#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { runAudit } = require('./i18n-audit/core.cjs');

const args = process.argv.slice(2);
const outputFile = args.find((arg) => !arg.startsWith('--'));
const showJson = args.includes('--json') || args.includes('--json-output');

// An output path without --json is not silently ignored: it is a user error to
// expect a file, so say so explicitly and continue with the human report.
if (outputFile && !showJson) {
  console.error(
    `[audit] Output file "${outputFile}" requires --json (JSON report mode); writing only the human report to stdout.`
  );
}

const { report, hasErrors } = runAudit();

const summary = report.summary;

function printHumanReport() {
  if (report.localeStructuralErrors.length > 0) {
    console.log('\nLocale structural errors:');
    for (const e of report.localeStructuralErrors) {
      console.log(`  - ${e.rule} ${e.key ? e.key : ''}: ${e.message}`);
    }
  }

  if (report.missingStaticKeys.length > 0) {
    console.log('\nMissing static keys:');
    for (const e of report.missingStaticKeys) {
      console.log(`  - ${e.locale} key "${e.key}": ${e.message}`);
    }
  }

  if (report.placeholderErrors.length > 0) {
    console.log('\nPlaceholder errors:');
    for (const e of report.placeholderErrors) {
      console.log(
        `  - ${e.locale} ${e.key}: source=${JSON.stringify(e.sourcePlaceholders)} translated=${JSON.stringify(e.translatedPlaceholders)}`
      );
    }
  }

  if (report.pluralErrors.length > 0) {
    console.log('\nPlural errors:');
    for (const e of report.pluralErrors) {
      console.log(`  - ${e.locale} ${e.key}${e.form || ''}: ${e.message}`);
    }
  }

  if (report.missingFallbackFindings.length > 0) {
    console.log('\nUser-facing t() without English fallback:');
    for (const e of report.missingFallbackFindings) {
      console.log(`  - ${e.key} at ${e.file}:${e.line}`);
    }
  }

  if (report.dynamicI18nFindings.length > 0) {
    console.log('\nDynamic t() keys:');
    for (const e of report.dynamicI18nFindings) {
      console.log(`  - ${e.expression} at ${e.file}:${e.line}`);
    }
  }

  if ((report.unregisteredLocaleFindings ?? []).length > 0) {
    console.log('\nUnregistered locale findings (non-blocking, not shipped):');
    for (const e of report.unregisteredLocaleFindings) {
      console.log(
        `  - ${e.locale} ${e.rule}${e.key ? ` ${e.key}` : ''}: ${e.message ?? ''}`
      );
    }
  }

  console.log('\n=== Summary ===');
  console.log(`source locale: ${summary.sourceLocale ?? 'en'}`);
  console.log(`fallback locale: ${summary.fallbackLocale ?? 'en'}`);
  console.log(`locale structural errors: ${summary.localeStructuralErrors}`);
  console.log(`missing static keys: ${summary.missingStaticKeys}`);
  console.log(`placeholder errors: ${summary.placeholderErrors}`);
  console.log(`plural errors: ${summary.pluralErrors}`);
  console.log(
    `user-facing t() without English fallback: ${summary.missingFallbackFindings}`
  );
  console.log(`dynamic t() keys: ${summary.dynamicI18nFindings}`);
  console.log(`source scan errors: ${summary.sourceScanErrors ?? 0}`);
  if (
    report.translationCoverage &&
    Object.keys(report.translationCoverage).length > 0
  ) {
    console.log('\nTranslations:');
    for (const [locale, coverage] of Object.entries(
      report.translationCoverage
    )) {
      console.log(
        `  ${locale}: ${coverage.translated}/${coverage.total} complete (${coverage.percent}%), ${coverage.missing} missing${coverage.stale ? `, ${coverage.stale} stale` : ''}`
      );
    }
  }
  console.log(
    `hardcoded UI strings (blocking): ${summary.hardcodedUiFindings}`
  );
  console.log(
    `locale-unsafe number formatting (blocking): ${summary.unsafeNumberFormatFindings ?? 0}`
  );
  console.log(
    `manual pluralization antipatterns (blocking): ${summary.manualPluralizationFindings ?? 0}`
  );
}

if (showJson) {
  const jsonPath = outputFile || null;
  const output = JSON.stringify(report, null, 2);
  if (jsonPath) {
    fs.writeFileSync(jsonPath, output + '\n', 'utf8');
    console.log(`JSON report written to ${jsonPath}`);
  } else {
    console.log(output);
  }
} else {
  printHumanReport();
}

if (hasErrors) {
  process.exit(1);
}
