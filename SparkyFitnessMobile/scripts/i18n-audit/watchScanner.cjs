const fs = require('node:fs');
const path = require('node:path');

// Swift UI sources whose user-facing text must go through String(localized:).
// Each target is its own bundle, so it keys into its own en.lproj catalog.
const WATCH_SOURCE_DIRS = ['targets/watch', 'targets/watch-widget'];
const CATALOG_FILE = 'en.lproj/Localizable.strings';
const IGNORE_MARKER = 'i18n-ignore';

// Calls whose first positional string argument is shown to the user. SwiftUI
// treats a bare literal as a LocalizedStringKey, but the watch catalog uses
// semantic keys, so a bare literal never gets translated.
const UI_CALL =
  /\b(?:Text|Button|Label|Toggle|Section|NavigationLink|Picker|TextField|Link|navigationTitle|accessibilityLabel|accessibilityHint|alert|confirmationDialog)\(\s*"/g;

function listSwiftFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSwiftFiles(full));
    else if (entry.name.endsWith('.swift')) out.push(full);
  }
  return out.sort();
}

/**
 * Read a Swift string literal starting just after its opening quote. Returns
 * the literal text with `\( ... )` interpolations removed, or null if the
 * literal is unterminated.
 */
function readLiteral(source, start) {
  let text = '';
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"') return text;
    if (ch === '\n') return null;
    if (ch === '\\') {
      if (source[i + 1] === '(') {
        let depth = 1;
        i += 2;
        while (i < source.length && depth > 0) {
          if (source[i] === '(') depth += 1;
          else if (source[i] === ')') depth -= 1;
          i += 1;
        }
        continue;
      }
      i += 2;
      continue;
    }
    text += ch;
    i += 1;
  }
  return null;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function scanBareLiterals(rootDir) {
  const findings = [];
  for (const dir of WATCH_SOURCE_DIRS) {
    for (const file of listSwiftFiles(path.join(rootDir, dir))) {
      const source = fs.readFileSync(file, 'utf8');
      const lines = source.split('\n');
      UI_CALL.lastIndex = 0;
      let match;
      while ((match = UI_CALL.exec(source)) !== null) {
        const text = readLiteral(source, match.index + match[0].length);
        if (text === null || !/\p{L}/u.test(text)) continue;
        const line = lineOf(source, match.index);
        if (lines[line - 1].includes(IGNORE_MARKER)) continue;
        findings.push({
          file: path.relative(rootDir, file),
          line,
          text,
        });
      }
    }
  }
  return findings;
}

function parseStringsKeys(content) {
  const keys = new Map();
  const re = /^\s*"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/gm;
  let match;
  while ((match = re.exec(content)) !== null) keys.set(match[1], match[2]);
  return keys;
}

function scanLocalizedKeys(rootDir) {
  const used = [];
  const re =
    /String\(\s*localized:\s*"((?:[^"\\]|\\.)*)"\s*,\s*defaultValue:\s*"((?:[^"\\]|\\.)*)"/g;
  for (const dir of WATCH_SOURCE_DIRS) {
    for (const file of listSwiftFiles(path.join(rootDir, dir))) {
      const source = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = re.exec(source)) !== null) {
        used.push({
          file: path.relative(rootDir, file),
          line: lineOf(source, match.index),
          key: match[1],
          defaultValue: match[2],
          target: dir,
        });
      }
    }
  }
  return used;
}

function unescapeSwift(value) {
  return value.replace(/\\(["'\\])/g, '$1');
}

function auditWatch(rootDir) {
  const bareLiterals = scanBareLiterals(rootDir);

  const catalogs = {};
  for (const dir of WATCH_SOURCE_DIRS) {
    const file = path.join(rootDir, dir, CATALOG_FILE);
    catalogs[dir] = fs.existsSync(file)
      ? parseStringsKeys(fs.readFileSync(file, 'utf8'))
      : new Map();
  }

  const missingKeys = [];
  const mismatchedDefaults = [];
  for (const use of scanLocalizedKeys(rootDir)) {
    const catalog = catalogs[use.target];
    if (!catalog.has(use.key)) {
      missingKeys.push(use);
      continue;
    }
    // Interpolated defaults use %@/%lld in the catalog, so only compare the
    // static ones; the English catalog is the source of truth.
    if (
      !use.defaultValue.includes('\\(') &&
      unescapeSwift(use.defaultValue) !== unescapeSwift(catalog.get(use.key))
    ) {
      mismatchedDefaults.push(use);
    }
  }

  return {
    bareLiterals,
    missingKeys,
    mismatchedDefaults,
    hasErrors:
      bareLiterals.length > 0 ||
      missingKeys.length > 0 ||
      mismatchedDefaults.length > 0,
  };
}

module.exports = {
  auditWatch,
  scanBareLiterals,
  scanLocalizedKeys,
  parseStringsKeys,
  readLiteral,
};
