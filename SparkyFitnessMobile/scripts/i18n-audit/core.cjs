const path = require('node:path');
const { LocaleValidator, PLURAL_SUFFIXES } = require('./localeValidator.cjs');
const { collectFindings: scanFindings, getAllSuppressionIssues, SOURCE_SCAN_ERROR_RULE } = require('./sourceScanner.cjs');

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const EN_LOCALE_PATH = path.join(MOBILE_ROOT, 'src', 'localization', 'locales', 'en', 'translation.json');
const PL_LOCALE_PATH = path.join(MOBILE_ROOT, 'src', 'localization', 'locales', 'pl', 'translation.json');

function localeHasKey(keySet, key) {
  if (keySet.has(key)) return true;
  // An exact key that is the base of a recognized plural group is also valid
  // (i18next resolves t('measurement', { count }) to measurement_one/other).
  for (const suffix of PLURAL_SUFFIXES) {
    if (keySet.has(`${key}${suffix}`)) return true;
  }
  return false;
}

function localeHasRequiredPluralForms(keySet, key, locale) {
  const requiredForms = locale === 'en'
    ? ['_one', '_other']
    : ['_one', '_few', '_many', '_other'];
  return requiredForms.every((form) => keySet.has(`${key}${form}`));
}

function expectedFallbackKey(key, fallbackName, hasCount) {
  if (!hasCount) return key;
  if (fallbackName === 'defaultValue') return `${key}_other`;
  return `${key}_${fallbackName.slice('defaultValue_'.length)}`;
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
 *   - source scan errors (a file that cannot be read/parsed fails the audit
 *     closed instead of silently reducing coverage)
 *   - invalid suppression directives
 *
 * Informational (reported in the summary, never blocking):
 *   - hardcoded UI strings (full inventory and migration live in PR5)
 */
function runAudit(options = {}) {
  const rootDir = options.rootDir || MOBILE_ROOT;
  const enLocalePath = options.enLocalePath || EN_LOCALE_PATH;
  const plLocalePath = options.plLocalePath || PL_LOCALE_PATH;
  // Default source roots derive from the ACTUAL rootDir so a custom-root run
  // scans its own source tree; the production default remains mobile/src.
  const sourceRoots = options.sourceRoots || [path.join(rootDir, 'src')];

  const report = {
    localeStructuralErrors: [],
    missingStaticKeys: [],
    placeholderErrors: [],
    pluralErrors: [],
    missingFallbackFindings: [],
    hardcodedUiFindings: [],
    dynamicI18nFindings: [],
    summary: {},
  };

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

  const scanResult = collectFindingsForSource(rootDir, sourceRoots);

  // Scan errors are blocking: a source file that could not be scanned must
  // fail the audit rather than pass with incomplete coverage.
  for (const scanError of scanResult.errors) {
    report.localeStructuralErrors.push(scanError);
  }

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

  for (const finding of scanResult.findings) {
    if (finding.kind === 'static-t-key') {
      const { fallbacks = {}, hasCount = false } = finding.context;
      if (hasCount) {
        for (const locale of ['en', 'pl']) {
          const keySet = locale === 'en' ? enKeySet : plKeySet;
          if (!localeHasRequiredPluralForms(keySet, finding.value, locale)) {
            report.pluralErrors.push({
              rule: 'count-requires-plural-group',
              locale,
              key: finding.value,
              file: finding.file,
              line: finding.line,
              message: `Count lookup t("${finding.value}") requires ${locale === 'en' ? '_one and _other' : '_one, _few, _many, and _other'} forms in the ${locale === 'en' ? 'English' : 'Polish'} locale`,
            });
          }
        }
      }
      for (const [fallbackName, fallbackValue] of Object.entries(fallbacks)) {
        const expectedKey = expectedFallbackKey(finding.value, fallbackName, hasCount);
        if (localeResult.enValues[expectedKey] !== fallbackValue) {
          report.missingFallbackFindings.push({
            rule: 'default-value-mismatch',
            file: finding.file,
            line: finding.line,
            key: finding.value,
            message: `Fallback ${fallbackName} for t("${finding.value}") must exactly match English locale key "${expectedKey}"`,
          });
        }
      }
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
    localeStructuralErrors: report.localeStructuralErrors.length,
    missingStaticKeys: report.missingStaticKeys.length,
    placeholderErrors: report.placeholderErrors.length,
    pluralErrors: report.pluralErrors.length,
    missingFallbackFindings: report.missingFallbackFindings.length,
    hardcodedUiFindings: report.hardcodedUiFindings.length,
    dynamicI18nFindings: report.dynamicI18nFindings.length,
    sourceScanErrors: report.localeStructuralErrors.filter(
      (e) => e.rule === SOURCE_SCAN_ERROR_RULE,
    ).length,
  };
}

module.exports = {
  runAudit,
  collectFindingsForSource,
  MOBILE_ROOT,
  EN_LOCALE_PATH,
  PL_LOCALE_PATH,
  buildSummary,
};
