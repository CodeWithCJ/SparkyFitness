#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { auditWatch } = require('./i18n-audit/watchScanner.cjs');

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const result = auditWatch(rootDir);

if (result.missingKeys.length > 0) {
  console.log('\nString(localized:) keys missing from Localizable.strings:');
  for (const e of result.missingKeys) {
    console.log(`  - "${e.key}" at ${e.file}:${e.line}`);
  }
}
if (result.mismatchedDefaults.length > 0) {
  console.log('\ndefaultValue differs from the English catalog entry:');
  for (const e of result.mismatchedDefaults) {
    console.log(`  - "${e.key}" at ${e.file}:${e.line}`);
  }
}
if (result.bareLiterals.length > 0) {
  console.log(
    '\nHardcoded watch UI text (use String(localized:defaultValue:)):'
  );
  for (const e of result.bareLiterals) {
    console.log(`  - "${e.text}" at ${e.file}:${e.line}`);
  }
  console.log(
    '\nAdd the text to the target\'s en.lproj/Localizable.strings. For text that must stay literal, add "// i18n-ignore" on the line.'
  );
}

console.log(
  `watch i18n: ${result.bareLiterals.length} hardcoded strings, ${result.missingKeys.length} missing keys, ${result.mismatchedDefaults.length} mismatched defaults`
);
process.exit(result.hasErrors ? 1 : 0);
