import fs from 'fs';
import path from 'path';

/**
 * Guards against the English translation file (public/locales/en/translation.json)
 * silently falling behind the keys the app actually uses.
 *
 * If this test fails, it means some component/hook calls t('some.key', ...) (or
 * <Trans i18nKey="some.key" />) for a key that either:
 *   - does not exist anywhere in public/locales/en/translation.json, or
 *   - exists at a path that is a nested object rather than a translatable string
 *     (usually because the same dotted path is used both as a leaf string
 *     somewhere and as a namespace prefix somewhere else - see the "type
 *     mismatch" section of the failure message).
 *
 * Fix by adding/renaming the missing key(s) in
 * SparkyFitnessFrontend/public/locales/en/translation.json. Other locales are
 * translated separately via Weblate and are intentionally not checked here.
 */

const SRC_ROOT = path.join(process.cwd(), 'src');
const EN_TRANSLATION_PATH = path.join(
  process.cwd(),
  'public/locales/en/translation.json'
);

// Any file under one of these directories/name patterns is considered test
// code, not application code, and is excluded from the key scan.
const EXCLUDED_PATH_SEGMENTS = [`${path.sep}tests${path.sep}`];
const EXCLUDED_FILE_PATTERNS = [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/];

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      files = files.concat(collectSourceFiles(fullPath));
      continue;
    }

    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    if (EXCLUDED_PATH_SEGMENTS.some((seg) => fullPath.includes(seg))) continue;
    if (EXCLUDED_FILE_PATTERNS.some((re) => re.test(entry.name))) continue;

    files.push(fullPath);
  }

  return files;
}

// Matches t('some.key', ...) / t("some.key", ...) - only literal string keys,
// so dynamically built keys like t(`prefix.${variable}`) or
// t('prefix.' + variable) are intentionally skipped (they cannot be
// statically verified - the regex just captures the static prefix up to the
// concatenation, which is filtered out below because it ends in '.').
const T_CALL_PATTERN = /\bt\(\s*['"]([A-Za-z0-9_.-]+)['"]/g;

// Matches <Trans i18nKey="some.key" ... />
const TRANS_COMPONENT_PATTERN = /i18nKey=['"]([A-Za-z0-9_.-]+)['"]/g;

function extractKeysFromFile(filePath: string): Map<string, number> {
  const text = fs.readFileSync(filePath, 'utf-8');
  const keysWithLine = new Map<string, number>();

  const addMatches = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) {
      const key = match[1];
      if (!keysWithLine.has(`${key}`)) {
        const line = text.slice(0, match.index).split('\n').length;
        keysWithLine.set(`${key}`, line);
      }
    }
  };

  addMatches(T_CALL_PATTERN);
  addMatches(TRANS_COMPONENT_PATTERN);

  return keysWithLine;
}

type FlatEntry = { type: 'string' | 'object' };

function flattenTranslations(
  node: unknown,
  prefix = '',
  out: Map<string, FlatEntry> = new Map()
): Map<string, FlatEntry> {
  if (typeof node !== 'object' || node === null) {
    return out;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.set(currentPath, { type: 'object' });
      flattenTranslations(value, currentPath, out);
    } else {
      out.set(currentPath, { type: 'string' });
    }
  }

  return out;
}

describe('i18n: English translation coverage', () => {
  it('has an en/translation.json entry for every t()/Trans key used in src', () => {
    const sourceFiles = collectSourceFiles(SRC_ROOT);

    // key -> first file/line where it was found (for a readable failure message)
    const usedKeys = new Map<string, { file: string; line: number }>();
    for (const filePath of sourceFiles) {
      const found = extractKeysFromFile(filePath);
      for (const [key, line] of found) {
        if (!usedKeys.has(key)) {
          usedKeys.set(key, {
            file: path.relative(process.cwd(), filePath),
            line,
          });
        }
      }
    }

    const rawTranslations = JSON.parse(
      fs.readFileSync(EN_TRANSLATION_PATH, 'utf-8')
    );
    const flatTranslations = flattenTranslations(rawTranslations);

    const missing: string[] = [];
    const typeMismatch: string[] = [];
    const skippedDynamic: string[] = [];

    for (const [key, location] of usedKeys) {
      // Dynamically built keys, e.g. t('prefix.' + variable), only yield
      // their static prefix up to the concatenation - can't be resolved
      // statically, so they're reported separately instead of failing.
      if (key.endsWith('.')) {
        skippedDynamic.push(
          `  "${key}*" (used at ${location.file}:${location.line})`
        );
        continue;
      }

      const entry = flatTranslations.get(key);

      if (entry?.type === 'string') {
        continue; // fully covered
      }

      // i18next pluralization: t('foo.bar', { count }) resolves to
      // foo.bar_one / foo.bar_other (and other CLDR plural forms) rather than
      // a literal "foo.bar" leaf, so check those before flagging as missing.
      const PLURAL_SUFFIXES = [
        '_zero',
        '_one',
        '_two',
        '_few',
        '_many',
        '_other',
      ];
      const hasPluralForm = PLURAL_SUFFIXES.some(
        (suffix) => flatTranslations.get(`${key}${suffix}`)?.type === 'string'
      );
      if (hasPluralForm) continue;

      if (entry?.type === 'object') {
        typeMismatch.push(
          `  "${key}" (used at ${location.file}:${location.line}) is a nested object in translation.json, not a string`
        );
        continue;
      }

      missing.push(`  "${key}" (used at ${location.file}:${location.line})`);
    }

    const messageParts: string[] = [];
    if (missing.length > 0) {
      messageParts.push(
        `Missing from public/locales/en/translation.json (${missing.length}):\n` +
          missing.sort().join('\n')
      );
    }
    if (typeMismatch.length > 0) {
      messageParts.push(
        `Key path conflicts in public/locales/en/translation.json (${typeMismatch.length}):\n` +
          typeMismatch.sort().join('\n')
      );
    }

    if (skippedDynamic.length > 0) {
      // Visible in CI logs but does not fail the build - these keys are
      // built at runtime (e.g. t('prefix.' + variable)) and can't be
      // statically verified. Worth a human glance if the list grows.
    }

    if (messageParts.length > 0) {
      throw new Error(
        `\n\n${messageParts.join('\n\n')}\n\n` +
          `Add the missing key(s) (or resolve the path conflict) in ` +
          `SparkyFitnessFrontend/public/locales/en/translation.json.\n`
      );
    }
  });
});
