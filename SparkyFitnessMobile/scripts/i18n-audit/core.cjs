const path = require('node:path');
const fs = require('node:fs');
const {
  LocaleValidator,
  PLURAL_SUFFIXES,
  requiredPluralForms,
} = require('./localeValidator.cjs');
const REGISTRY_MANIFEST = require('../../src/localization/localeRegistry.json');
const {
  collectFindings: scanFindings,
  getAllSuppressionIssues,
  SOURCE_SCAN_ERROR_RULE,
} = require('./sourceScanner.cjs');

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_LOCALE = REGISTRY_MANIFEST.sourceLocale;
const FALLBACK_LOCALE = REGISTRY_MANIFEST.fallbackLocale;
const EN_LOCALE_PATH = path.join(
  MOBILE_ROOT,
  'src',
  'localization',
  'locales',
  SOURCE_LOCALE,
  'translation.json'
);
const SOURCE_INTL_LOCALE = REGISTRY_MANIFEST.locales[SOURCE_LOCALE].intlLocale;

function localeHasKey(keySet, key) {
  if (keySet.has(key)) return true;
  // An exact key that is the base of a recognized plural group is also valid
  // (i18next resolves t('measurement', { count }) to measurement_one/other).
  for (const suffix of PLURAL_SUFFIXES) {
    if (keySet.has(`${key}${suffix}`)) return true;
  }
  return false;
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
 *   - missing static source keys
 *   - source structural errors and existing translation structural corruption
 *   - placeholder mismatch
 *   - plural mismatch / missing plural forms
 *   - duplicate/singular-plural collisions reported by the validator
 *   - source scan errors (a file that cannot be read/parsed fails the audit
 *     closed instead of silently reducing coverage)
 *   - invalid suppression directives
 *
 * Translation completeness and stale target keys are non-blocking coverage diagnostics.
 * Hardcoded UI and locale-unsafe number formatting remain blocking.
 */
function runAudit(options = {}) {
  const rootDir = options.rootDir || MOBILE_ROOT;
  const enLocalePath =
    options.enLocalePath ||
    path.join(
      rootDir,
      'src',
      'localization',
      'locales',
      SOURCE_LOCALE,
      'translation.json'
    );
  let manifest = REGISTRY_MANIFEST;
  const registryPath =
    options.registryPath ||
    path.join(rootDir, 'src', 'localization', 'localeRegistry.json');
  if (fs.existsSync(registryPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    } catch {
      manifest = REGISTRY_MANIFEST;
    }
  }
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
    unsafeNumberFormatFindings: [],
    manualPluralizationFindings: [],
    // Weblate creates a catalog long before anyone ships it, so defects in an
    // unregistered one are reported but never block. Registered locales do.
    unregisteredLocaleFindings: [],
    translationCoverage: {},
    summary: {},
  };

  const isShipped = (locale) => Object.hasOwn(manifest.locales ?? {}, locale);

  const sourceLocaleDir = path.dirname(enLocalePath);
  const localeRoot = path.dirname(sourceLocaleDir);
  let localePaths = [];
  if (fs.existsSync(localeRoot)) {
    localePaths = fs
      .readdirSync(localeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== SOURCE_LOCALE)
      .map((entry) => ({
        locale: entry.name,
        path: path.join(localeRoot, entry.name, 'translation.json'),
        intlLocale: manifest.locales[entry.name]?.intlLocale || entry.name,
      }))
      .filter((entry) => {
        if (!fs.existsSync(entry.path)) return false;
        try {
          new Intl.PluralRules(
            entry.intlLocale ||
              manifest.locales[entry.locale]?.intlLocale ||
              entry.locale
          );
          return true;
        } catch {
          const finding = {
            rule: 'invalid-locale-tag',
            locale: entry.locale,
            message: `Invalid locale tag "${entry.intlLocale}" discovered in locale root; skipping`,
          };
          (isShipped(entry.locale)
            ? report.localeStructuralErrors
            : report.unregisteredLocaleFindings
          ).push(finding);
          return false;
        }
      });
  }
  const validator = new LocaleValidator(enLocalePath, null, {
    localePaths,
    sourceLocale: SOURCE_LOCALE,
    fallbackLocale: FALLBACK_LOCALE,
    sourceIntlLocale: SOURCE_INTL_LOCALE,
  });
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

  report.translationCoverage = localeResult.coverage || {};

  for (const error of localeResult.errors) {
    // Errors without a locale belong to the source catalog.
    if (
      error.locale !== undefined &&
      error.locale !== SOURCE_LOCALE &&
      !isShipped(error.locale)
    ) {
      report.unregisteredLocaleFindings.push(error);
    } else if (error.rule === 'missing-plural-form') {
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
  const sourceRequiredForms = requiredPluralForms(SOURCE_INTL_LOCALE);

  const seenStaticKeys = new Set();

  for (const finding of scanResult.findings) {
    if (finding.kind === 'static-t-key') {
      const { fallbacks = {}, hasCount = false } = finding.context;
      if (hasCount) {
        if (
          !sourceRequiredForms.every((form) =>
            enKeySet.has(`${finding.value}${form}`)
          )
        )
          report.pluralErrors.push({
            rule: 'count-requires-plural-group',
            locale: SOURCE_LOCALE,
            key: finding.value,
            file: finding.file,
            line: finding.line,
            message: `Count lookup requires ${sourceRequiredForms.join(', ')} forms in the ${SOURCE_LOCALE} source locale`,
          });
      }
      for (const [fallbackName, fallbackValue] of Object.entries(fallbacks)) {
        const expectedKey = expectedFallbackKey(
          finding.value,
          fallbackName,
          hasCount
        );
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
            locale: SOURCE_LOCALE,
            key: finding.value,
            file: finding.file,
            line: finding.line,
            message: `Static t("${finding.value}") not found in English locale`,
          });
        }
        // Missing target keys are represented by translation coverage, not errors.
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
    } else if (finding.kind === 'manual-pluralization') {
      report.manualPluralizationFindings.push({
        rule: 'manual-pluralization',
        file: finding.file,
        line: finding.line,
        expression: finding.value,
        context: finding.context,
      });
    } else if (finding.kind === 'locale-unsafe-number-format') {
      report.unsafeNumberFormatFindings.push({
        rule: 'locale-unsafe-number-format',
        file: finding.file,
        line: finding.line,
        expression: finding.value,
        context: finding.context,
      });
    } else if (finding.kind === 'hardcoded-ui-text') {
      // Hardcoded application-owned UI is a blocking regression guard.
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
    report.unsafeNumberFormatFindings.length,
    report.manualPluralizationFindings.length,
  ].reduce((a, b) => a + b, 0);

  report.summary = buildSummary(report);

  return {
    report,
    hasErrors:
      structuralErrorCount > 0 ||
      report.hardcodedUiFindings.length > 0 ||
      report.unsafeNumberFormatFindings.length > 0,
  };
}

function collectFindingsForSource(rootDir, sourceRoots) {
  return scanFindings(rootDir, sourceRoots || [path.join(rootDir, 'src')]);
}

function buildSummary(report) {
  return {
    translationCoverage: report.translationCoverage || {},
    sourceLocale: SOURCE_LOCALE,
    fallbackLocale: FALLBACK_LOCALE,
    localeStructuralErrors: report.localeStructuralErrors.length,
    missingStaticKeys: report.missingStaticKeys.length,
    placeholderErrors: report.placeholderErrors.length,
    pluralErrors: report.pluralErrors.length,
    missingFallbackFindings: report.missingFallbackFindings.length,
    hardcodedUiFindings: report.hardcodedUiFindings.length,
    dynamicI18nFindings: report.dynamicI18nFindings.length,
    unsafeNumberFormatFindings: report.unsafeNumberFormatFindings.length,
    manualPluralizationFindings: report.manualPluralizationFindings.length,
    unregisteredLocaleFindings: (report.unregisteredLocaleFindings ?? [])
      .length,
    sourceScanErrors: report.localeStructuralErrors.filter(
      (e) => e.rule === SOURCE_SCAN_ERROR_RULE
    ).length,
  };
}

module.exports = {
  runAudit,
  collectFindingsForSource,
  MOBILE_ROOT,
  EN_LOCALE_PATH,
  buildSummary,
};
