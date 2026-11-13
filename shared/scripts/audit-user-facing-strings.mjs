#!/usr/bin/env node
// Guards against new hardcoded user-facing English in @workspace/shared.
// Shared should export ids and data; apps own translation. Existing English
// catalogs are allowed per file through scripts/user-facing-strings.baseline.json
// (a ratchet: a file may not gain more than its baseline). Add `i18n-ignore`
// on a line for text that must stay literal (canonical API/storage values).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const srcDir = path.join(rootDir, 'src');
const baselineFile = path.join(
  rootDir,
  'scripts/user-facing-strings.baseline.json'
);
const IGNORE_MARKER = 'i18n-ignore';

// Properties that hold text shown to people. Zod schemas (src/schemas) carry
// validation messages and descriptions, not UI, so they are not scanned.
const UI_PROPERTIES = new Set([
  'label',
  'title',
  'description',
  'message',
  'hint',
  'summary',
  'body',
  'text',
  'placeholder',
  'tooltip',
  'subtitle',
]);

function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === path.join(srcDir, 'schemas')) continue;
      out.push(...listSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

// A sentence-like literal: contains a letter and a space, so ids such as
// 'weight_kg' or 'kcal' are not mistaken for prose.
function looksLikeProse(text) {
  return /\p{L}/u.test(text) && /\s/.test(text.trim());
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const findings = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      UI_PROPERTIES.has(node.name.text) &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
      looksLikeProse(node.initializer.text)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      if (!lines[line].includes(IGNORE_MARKER)) {
        findings.push({ line: line + 1, text: node.initializer.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

const results = {};
for (const file of listSourceFiles(srcDir)) {
  const findings = scanFile(file);
  if (findings.length > 0)
    results[path.relative(rootDir, file).split(path.sep).join('/')] = findings;
}
const counts = Object.fromEntries(
  Object.entries(results).map(([file, f]) => [file, f.length])
);

if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(baselineFile, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`[shared-i18n] baseline written to ${baselineFile}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const offenders = Object.entries(counts).filter(
  ([file, count]) => count > (baseline[file] ?? 0)
);

for (const [file] of offenders) {
  console.log(`\n${file} has more user-facing English than its baseline:`);
  for (const f of results[file])
    console.log(`  - "${f.text}" at ${file}:${f.line}`);
}
if (offenders.length > 0) {
  console.log(
    '\nExport ids or data from shared and translate in the app. For text that must stay literal, add "// i18n-ignore" on the line.'
  );
}
const legacy = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(
  `shared i18n: ${offenders.length} files over baseline (${legacy} legacy strings allowed)`
);
process.exit(offenders.length > 0 ? 1 : 0);
