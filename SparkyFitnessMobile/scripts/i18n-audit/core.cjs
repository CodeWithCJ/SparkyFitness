const fs = require('node:fs');
const path = require('node:path');
const { LocaleValidator, PLURAL_SUFFIXES } = require('./localeValidator.cjs');
const { collectFindings: scanFindings, getAllSuppressionIssues } = require('./sourceScanner.cjs');

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const EN_LOCALE_PATH = path.join(MOBILE_ROOT, 'src', 'localization', 'locales', 'en', 'translation.json');
const PL_LOCALE_PATH = path.join(MOBILE_ROOT, 'src', 'localization', 'locales', 'pl', 'translation.json');
const BASELINE_PATH = path.join(__dirname, 'i18n-audit-baseline.json');

const FORBIDDEN_FILES = [
  path.join(MOBILE_ROOT, 'src', 'localization', 'mobile.pl.json'),
  path.join(MOBILE_ROOT, 'src', 'localization', 'mobile.pl.overrides.json'),
  path.join(MOBILE_ROOT, 'scripts', 'populate-mobile-polish.mjs'),
];

const SOURCE_ROOTS = [path.join(MOBILE_ROOT, 'src')];

const REQUIRED_PLURAL_FORMS = {
  en: ['_one', '_other'],
  pl: ['_one', '_few', '_many', '_other'],
};

const MIGRATORY_RULES = new Set(['hardcoded-ui-text', 'dynamic-i18n-key']);

function checkForbiddenFiles(rootDir, forbiddenFiles) {
  const errors = [];
  const files = forbiddenFiles || [
    path.join(rootDir, 'src', 'localization', 'mobile.pl.json'),
    path.join(rootDir, 'src', 'localization', 'mobile.pl.overrides.json'),
    path.join(rootDir, 'scripts', 'populate-mobile-polish.mjs'),
  ];
  for (const filePath of files) {
    if (fs.existsSync(filePath)) {
      const relPath = path.relative(rootDir, filePath).replaceAll('\\', '/');
      errors.push({
        rule: 'forbidden-file',
        file: relPath,
        message: `Forbidden file exists: ${relPath}`,
      });
    }
  }
  return errors;
}

function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch {
    return null;
  }
}

function saveBaseline(baselinePath, data) {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(baselinePath, serialized, 'utf8');
}

function buildMigrationFingerprint(finding) {
  const contextStr = finding.context ? JSON.stringify(finding.context) : '';
  return `hardcoded-ui-text:${finding.file}:${finding.value}:${contextStr}`;
}

function buildDynamicMigrationFingerprint(finding) {
  return `dynamic-i18n-key:${finding.file}:${finding.expression}`;
}

function localeHasKey(keySet, key) {
  if (keySet.has(key)) return true;
  // An exact key that is the base of a recognized plural group is also valid
  // (i18next resolves t('measurement', { count }) to measurement_one/other).
  for (const suffix of PLURAL_SUFFIXES) {
    if (keySet.has(`${key}${suffix}`)) return true;
  }
  return false;
}

function runAudit(options = {}) {
  const rootDir = options.rootDir || MOBILE_ROOT;
  const enLocalePath = options.enLocalePath || EN_LOCALE_PATH;
  const plLocalePath = options.plLocalePath || PL_LOCALE_PATH;
  const baselinePath = options.baselinePath || BASELINE_PATH;
  const forbiddenFiles = options.forbiddenFiles;
  const sourceRoots = options.sourceRoots || SOURCE_ROOTS;
  const baseline = options.baseline !== undefined ? options.baseline : loadBaseline(baselinePath);

  const report = {
    forbidden: [],
    localeStructuralErrors: [],
    missingStaticKeys: [],
    placeholderErrors: [],
    pluralErrors: [],
    missingFallbackFindings: [],
    hardcodedUiFindings: [],
    dynamicI18nFindings: [],
    acceptedBaselineFindings: 0,
    newFindings: [],
    staleBaselineFindings: [],
    summary: {},
  };

  report.forbidden = checkForbiddenFiles(rootDir, forbiddenFiles);

  const validator = new LocaleValidator(enLocalePath, plLocalePath);
  let localeResult;
  try {
    localeResult = validator.validate();
  } catch (err) {
    report.localeStructuralErrors.push({
      rule: 'malformed-json',
      message: err.message,
    });
    return { report, hasErrors: true };
  }

  for (const error of localeResult.errors) {
    if (error.rule === 'missing-plural-form') {
      report.pluralErrors.push(error);
    } else if (error.rule === 'placeholder-mismatch') {
      report.placeholderErrors.push(error);
    } else {
      report.localeStructuralErrors.push(error);
    }
  }

  const findings = collectFindingsForSource(rootDir, sourceRoots);

  const suppressionIssues = getAllSuppressionIssues();
  for (const suppression of suppressionIssues) {
    report.localeStructuralErrors.push({
      rule: suppression.rule,
      file: suppression.file,
      line: suppression.line,
      directiveRule: suppression.directiveRule,
      message: suppression.message,
    });
  }

  const enKeySet = new Set(localeResult.enKeys || []);
  const plKeySet = new Set(localeResult.plKeys || []);

  const seenStaticKeys = new Set();

  for (const finding of findings) {
    if (finding.kind === 'static-t-key') {
      if (!seenStaticKeys.has(finding.value)) {
        seenStaticKeys.add(finding.value);
        if (!localeHasKey(enKeySet, finding.value)) {
          report.missingStaticKeys.push({
            rule: 'missing-static-key',
            locale: 'en',
            key: finding.value,
            file: finding.file,
            line: finding.line,
            message: `Static t("${finding.value}") not found in English locale`,
          });
        }
        if (!localeHasKey(plKeySet, finding.value)) {
          report.missingStaticKeys.push({
            rule: 'missing-static-key',
            locale: 'pl',
            key: finding.value,
            file: finding.file,
            line: finding.line,
            message: `Static t("${finding.value}") not found in Polish locale`,
          });
        }
      }
    } else if (finding.kind === 'missing-fallback-key') {
      report.missingFallbackFindings.push({
        rule: 'missing-fallback',
        file: finding.file,
        line: finding.line,
        key: finding.value,
        message: `User-facing t("${finding.value}") without explicit English fallback at ${finding.file}:${finding.line} — pass a fallback string or defaultValue`,
      });
    } else if (finding.kind === 'dynamic-t-key') {
      const fp = `dynamic-t-key:${finding.file}:${finding.value}`;
      report.dynamicI18nFindings.push({
        rule: 'dynamic-i18n-key',
        file: finding.file,
        line: finding.line,
        expression: finding.value,
        fingerprint: fp,
        message: `Dynamic i18n key "${finding.value}" at ${finding.file}:${finding.line} — use a static map instead`,
      });
    } else if (finding.kind === 'hardcoded-ui-text') {
      const fp = `hardcoded-ui-text:${finding.file}:${finding.line}:${finding.value}`;
      report.hardcodedUiFindings.push({
        rule: 'hardcoded-ui-text',
        file: finding.file,
        line: finding.line,
        value: finding.value,
        context: finding.context,
        fingerprint: fp,
      });
    }
  }

  if (options.updateBaseline) {
    const structuralErrors = [
      ...report.forbidden,
      ...report.localeStructuralErrors,
      ...report.missingStaticKeys,
      ...report.placeholderErrors,
      ...report.pluralErrors,
      ...report.missingFallbackFindings,
    ];

    if (structuralErrors.length > 0) {
      report.summary = buildSummary(report);
      return {
        report,
        error: new Error('Cannot update baseline due to structural errors that are not allowed in baseline'),
      };
    }

    const migrationBaseline = [];
    for (const finding of report.hardcodedUiFindings) {
      migrationBaseline.push({
        rule: 'hardcoded-ui-text',
        file: finding.file,
        value: finding.value,
        context: finding.context,
        fingerprint: buildMigrationFingerprint({ file: finding.file, value: finding.value, kind: 'hardcoded-ui-text', context: finding.context }),
      });
    }
    for (const finding of report.dynamicI18nFindings) {
      migrationBaseline.push({
        rule: 'dynamic-i18n-key',
        file: finding.file,
        expression: finding.expression,
        fingerprint: buildDynamicMigrationFingerprint({ file: finding.file, expression: finding.expression }),
      });
    }

    migrationBaseline.sort((a, b) => {
      const ruleCmp = (a.rule || '').localeCompare(b.rule || '');
      if (ruleCmp !== 0) return ruleCmp;
      return (a.fingerprint || '').localeCompare(b.fingerprint || '');
    });

    const countByFp = new Map();
    for (const item of migrationBaseline) {
      countByFp.set(item.fingerprint, (countByFp.get(item.fingerprint) || 0) + 1);
    }

    const baselineData = {
      version: 1,
      findings: migrationBaseline,
      counts: Object.fromEntries(countByFp.entries()),
    };

    saveBaseline(baselinePath, baselineData);

    report.summary = {
      forbidden: report.forbidden.length,
      localeStructuralErrors: report.localeStructuralErrors.length,
      missingStaticKeys: report.missingStaticKeys.length,
      placeholderErrors: report.placeholderErrors.length,
      pluralErrors: report.pluralErrors.length,
      missingFallbackFindings: report.missingFallbackFindings.length,
      hardcodedUiFindings: report.hardcodedUiFindings.length,
      dynamicI18nFindings: report.dynamicI18nFindings.length,
      acceptedBaselineFindings: 0,
      newFindings: 0,
      staleBaselineFindings: 0,
    };

    return { report, baseline: baselineData };
  }

  if (baseline) {
    const currentBaselineFindings = new Map();
    for (const finding of report.hardcodedUiFindings) {
      const fp = buildMigrationFingerprint({
        file: finding.file,
        value: finding.value,
        kind: 'hardcoded-ui-text',
        context: finding.context,
      });

      if (!currentBaselineFindings.has(fp)) {
        currentBaselineFindings.set(fp, { count: 0, kind: 'hardcoded-ui-text' });
      }
      currentBaselineFindings.get(fp).count += 1;
    }

    for (const finding of report.dynamicI18nFindings) {
      const fp = buildDynamicMigrationFingerprint({ file: finding.file, expression: finding.expression });
      if (!currentBaselineFindings.has(fp)) {
        currentBaselineFindings.set(fp, { count: 0, kind: 'dynamic-i18n-key' });
      }
      currentBaselineFindings.get(fp).count += 1;
    }

    const baselineMap = new Map();
    for (const entry of baseline.findings) {
      const fp = entry.fingerprint;
      if (!baselineMap.has(fp)) {
        baselineMap.set(fp, entry);
      }
    }

    const baselineFindings = new Map();
    if (baseline.counts) {
      for (const [fp, count] of Object.entries(baseline.counts)) {
        baselineFindings.set(fp, { count, entry: baselineMap.get(fp) });
      }
    } else {
      for (const entry of baseline.findings) {
        baselineFindings.set(entry.fingerprint, { count: 1, entry });
      }
    }

    let acceptedCount = 0;

    // Compare each fingerprint by (baselineCount, currentCount). A fingerprint
    // may carry multiple occurrences; accepted counts are the truly accepted
    // occurrences, computed as Math.min(baselineCount, currentCount).
    for (const [fp, current] of currentBaselineFindings.entries()) {
      const baselineEntry = baselineFindings.get(fp);
      const baselineCount = baselineEntry ? baselineEntry.count : 0;
      const currentCount = current.count;

      if (baselineCount > 0) {
        acceptedCount += Math.min(baselineCount, currentCount);
        if (currentCount === baselineCount) {
          continue; // equal: fully accepted, no new, no stale
        }
      }

      // currentCount > baselineCount (or new fingerprint) → new violation.
      if (currentCount > baselineCount) {
        const firstFinding = report.hardcodedUiFindings.find((f) => buildMigrationFingerprint({
          file: f.file,
          value: f.value,
          kind: 'hardcoded-ui-text',
          context: f.context,
        }) === fp) || report.dynamicI18nFindings.find((f) => buildDynamicMigrationFingerprint({ file: f.file, expression: f.expression }) === fp);

        if (firstFinding) {
          report.newFindings.push({
            fingerprint: fp,
            rule: current.kind,
            baselineCount,
            currentCount,
            delta: currentCount - baselineCount,
            file: firstFinding.file,
            line: firstFinding.line,
            value: firstFinding.value ?? firstFinding.expression,
            message: baselineCount === 0
              ? `New finding: "${firstFinding.value ?? firstFinding.expression}" at ${firstFinding.file}:${firstFinding.line}`
              : `Increased occurrences of "${firstFinding.value ?? firstFinding.expression}" (${currentCount} > ${baselineCount})`,
          });
        }
        continue;
      }

      // currentCount < baselineCount (partial decrease) → stale.
      if (currentCount < baselineCount) {
        const firstFinding = report.hardcodedUiFindings.find((f) => buildMigrationFingerprint({
          file: f.file,
          value: f.value,
          kind: 'hardcoded-ui-text',
          context: f.context,
        }) === fp) || report.dynamicI18nFindings.find((f) => buildDynamicMigrationFingerprint({ file: f.file, expression: f.expression }) === fp);

        report.staleBaselineFindings.push({
          fingerprint: fp,
          rule: current.kind,
          baselineCount,
          currentCount,
          removed: baselineCount - currentCount,
          file: firstFinding?.file,
          value: firstFinding?.value ?? firstFinding?.expression,
          message: `Stale baseline entry - occurrences decreased (${baselineCount} → ${currentCount})`,
        });
      }
    }

    // Fingerprints present in baseline but completely absent from current code.
    for (const [fp, baselineEntry] of baselineFindings.entries()) {
      if (currentBaselineFindings.has(fp)) continue;
      report.staleBaselineFindings.push({
        fingerprint: fp,
        rule: baselineEntry.entry?.rule || 'unknown',
        baselineCount: baselineEntry.count,
        currentCount: 0,
        removed: baselineEntry.count,
        message: `Stale baseline entry - finding no longer present (removed ${baselineEntry.count})`,
      });
    }

    report.acceptedBaselineFindings = acceptedCount;
  } else {
    for (const finding of report.hardcodedUiFindings) {
      report.newFindings.push({
        fingerprint: finding.fingerprint,
        rule: 'hardcoded-ui-text',
        file: finding.file,
        line: finding.line,
        value: finding.value,
        message: `New hardcoded UI text: "${finding.value}" at ${finding.file}:${finding.line}`,
      });
    }
    for (const finding of report.dynamicI18nFindings) {
      report.newFindings.push({
        fingerprint: finding.fingerprint,
        rule: 'dynamic-i18n-key',
        file: finding.file,
        line: finding.line,
        expression: finding.expression,
        message: `New dynamic i18n key: ${finding.expression} at ${finding.file}:${finding.line}`,
      });
    }
  }

  const structuralErrorCount = [
    report.forbidden.length,
    report.localeStructuralErrors.length,
    report.missingStaticKeys.length,
    report.placeholderErrors.length,
    report.pluralErrors.length,
    report.missingFallbackFindings.length,
  ].reduce((a, b) => a + b, 0);

  report.summary = {
    forbidden: report.forbidden.length,
    localeStructuralErrors: report.localeStructuralErrors.length,
    missingStaticKeys: report.missingStaticKeys.length,
    placeholderErrors: report.placeholderErrors.length,
    pluralErrors: report.pluralErrors.length,
    missingFallbackFindings: report.missingFallbackFindings.length,
    hardcodedUiFindings: report.hardcodedUiFindings.length,
    dynamicI18nFindings: report.dynamicI18nFindings.length,
    acceptedBaselineFindings: report.acceptedBaselineFindings,
    newFindings: report.newFindings.length,
    staleBaselineFindings: report.staleBaselineFindings.length,
  };

  const hasErrors = structuralErrorCount > 0 ||
    report.newFindings.length > 0 ||
    report.staleBaselineFindings.length > 0;

  return { report, hasErrors };
}

function collectFindingsForSource(rootDir, sourceRoots) {
  return scanFindings(rootDir, sourceRoots || [path.join(rootDir, 'src')]);
}

function buildSummary(report) {
  return {
    forbidden: report.forbidden.length,
    localeStructuralErrors: report.localeStructuralErrors.length,
    missingStaticKeys: report.missingStaticKeys.length,
    placeholderErrors: report.placeholderErrors.length,
    pluralErrors: report.pluralErrors.length,
    missingFallbackFindings: report.missingFallbackFindings.length,
    hardcodedUiFindings: report.hardcodedUiFindings.length,
    dynamicI18nFindings: report.dynamicI18nFindings.length,
    acceptedBaselineFindings: report.acceptedBaselineFindings,
    newFindings: report.newFindings.length,
    staleBaselineFindings: report.staleBaselineFindings.length,
  };
}

module.exports = {
  runAudit,
  checkForbiddenFiles,
  loadBaseline,
  saveBaseline,
  buildMigrationFingerprint,
  buildDynamicMigrationFingerprint,
  collectFindingsForSource,
  REQUIRED_PLURAL_FORMS,
  FORBIDDEN_FILES,
  BASELINE_PATH,
  MOBILE_ROOT,
  EN_LOCALE_PATH,
  PL_LOCALE_PATH,
  MIGRATORY_RULES,
  buildSummary,
};
