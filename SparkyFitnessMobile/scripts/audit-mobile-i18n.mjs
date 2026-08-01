#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { runAudit } = require('./i18n-audit/core.cjs');

const args = process.argv.slice(2);
const outputFile = args.find((arg) => !arg.startsWith('--'));
const updateBaseline = args.includes('--update-baseline');
const showJson = args.includes('--json') || args.includes('--json-output');

const { report, error, baseline, hasErrors } = runAudit({ updateBaseline });

if (error) {
  console.error(error.message);
  process.exit(1);
}

const summary = report.summary;

function printHumanReport() {
  if (report.forbidden.length > 0) {
    console.log('\nForbidden files:');
    for (const f of report.forbidden) {
      console.log(`  - ${f.file}: ${f.message}`);
    }
  }

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
      console.log(`  - ${e.key}: EN=${JSON.stringify(e.enPlaceholders)} PL=${JSON.stringify(e.plPlaceholders)}`);
    }
  }

  if (report.pluralErrors.length > 0) {
    console.log('\nPlural errors:');
    for (const e of report.pluralErrors) {
      console.log(`  - ${e.locale} ${e.key}${e.form || ''}: ${e.message}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`locale structural errors: ${summary.localeStructuralErrors}`);
  console.log(`missing static keys: ${summary.missingStaticKeys}`);
  console.log(`placeholder errors: ${summary.placeholderErrors}`);
  console.log(`plural errors: ${summary.pluralErrors}`);
  console.log(`hardcoded UI findings: ${summary.hardcodedUiFindings}`);
  console.log(`dynamic i18n findings: ${summary.dynamicI18nFindings}`);
  console.log(`accepted baseline findings: ${summary.acceptedBaselineFindings}`);
  console.log(`new findings: ${summary.newFindings}`);
  console.log(`stale baseline findings: ${summary.staleBaselineFindings}`);

  if (report.newFindings.length > 0) {
    console.log('\nNew findings:');
    for (const f of report.newFindings) {
      const location = f.file;
      const value = f.value || f.expression;
      console.log(`  - ${f.rule}: ${location}`);
      console.log(`    value: ${value}`);
      console.log(`    message: ${f.message}`);
    }
  }

  if (report.staleBaselineFindings.length > 0) {
    console.log('\nStale baseline findings:');
    for (const s of report.staleBaselineFindings) {
      console.log(`  - ${s.fingerprint}: ${s.message}`);
    }
  }
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

if (hasErrors || report.forbidden.length > 0) {
  process.exit(1);
}
