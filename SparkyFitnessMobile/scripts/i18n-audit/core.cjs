const fs = require('node:fs');
const path = require('node:path');
const { LocaleValidator, PLURAL_SUFFIXES } = require('./localeValidator.cjs');
const { collectFindings: scanFindings, getAllSuppressionIssues } = require('./sourceScanner.cjs');

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const EN_LOCALE_PATH = path.join(MOBILE_ROOT, 'src', 'localization', 'locales', 'en', 'translation.json');
const PL_LOCALE_PATH = path.join(MOBILE_ROOT, 'src', 'localization', 'locales', 'pl', 'translation.json');

const FORBIDDEN_FILES = [
  path.join(MOBILE_ROOT, 'src', 'localization', 'mobile.pl.json'),
  path.join(MOBILE_ROOT, 'src', 'localization', 'mobile.pl.overrides.json'),
  path.join(MOBILE_ROOT, 'scripts', 'populate-mobile-polish.mjs'),
];

const SOURCE_ROOTS = [path.join(MOBILE_ROOT, 'src')];

function checkForbiddenFiles(rootDir, forbiddenFiles) {
  const errors = [];
  const files = forbiddenFiles && forbiddenFiles.length > 0
    ? forbiddenFiles
    : [
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

function localeHasKey(keySet, key) {
  if (keySet.has(key)) return true;
  // An exact key that is the base of a recognized plural group is also valid
  // (i18next resolves t('measurement', { count }) to measurement_one/other).
  for (const suffix of PLURAL_SUFFIXES) {
    if (keySet.has(`${key}${suffix}`)) return true;
  }
  return false;
}

/**
 * Runs the i18n audit.
 *
 * Blocking (exit != 0 when present):
 *   - user-facing t() without an explicit English fallback
 *   - dynamic t(variable) / unsafe template-literal translation keys
 *   - missing static locale keys
 *   - EN/PL structure mismatch (missing/extra keys, type mismatch)
 *   - placeholder mismatch
 *   - plural mismatch / missing plural forms
 *   - duplicate/singular-plural collisions reported by the validator
 *   - forbidden legacy Polish files
 *   - invalid suppression directives
 *
 * Informational (reported in the summary, never blocking):
 *   - hardcoded UI strings (full inventory and migration live in PR5)
 */
function runAudit(options = {}) {
  const rootDir = options.rootDir || MOBILE_ROOT;
  const enLocalePath = options.enLocalePath || EN_LOCALE_PATH;
  const plLocalePath = options.plLocalePath || PL_LOCALE_PATH;
  const forbiddenFiles = options.forbiddenFiles;
  const sourceRoots = options.sourceRoots || SOURCE_ROOTS;

  const report = {
    forbidden: [],
    localeStructuralErrors: [],
    missingStaticKeys: [],
    placeholderErrors: [],
    pluralErrors: [],
    missingFallbackFindings: [],
    hardcodedUiFindings: [],
    dynamicI18nFindings: [],
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
    report.summary = buildSummary(report);
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
      report.dynamicI18nFindings.push({
        rule: 'dynamic-i18n-key',
        file: finding.file,
        line: finding.line,
        expression: finding.value,
        message: `Dynamic i18n key "${finding.value}" at ${finding.file}:${finding.line} — use a static map instead`,
      });
    } else if (finding.kind === 'hardcoded-ui-text') {
      // Informational only: the full hardcoded-UI inventory and its migration
      // belong to PR5. PR3 reports the count without a checked-in snapshot.
      report.hardcodedUiFindings.push({
        rule: 'hardcoded-ui-text',
        file: finding.file,
        line: finding.line,
        value: finding.value,
        context: finding.context,
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
    report.dynamicI18nFindings.length,
  ].reduce((a, b) => a + b, 0);

  report.summary = buildSummary(report);

  return { report, hasErrors: structuralErrorCount > 0 };
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
  };
}

module.exports = {
  runAudit,
  checkForbiddenFiles,
  collectFindingsForSource,
  FORBIDDEN_FILES,
  MOBILE_ROOT,
  EN_LOCALE_PATH,
  PL_LOCALE_PATH,
  buildSummary,
};
