import fs from 'node:fs';
import path from 'node:path';

/**
 * Narrow regression guard against future implicit-locale presentation.
 *
 * We scan the source tree for locale-less date/number formatting calls that
 * would silently use the device/runtime locale instead of the active Sparky
 * application locale. Valid uses that pass an app-derived locale are allowed;
 * the small set of intentional non-app-locale uses (debug logging and the
 * canonical locale helpers themselves) are in the explicit allowlist below.
 *
 * This is intentionally narrative/structural, not a full AST rewrite: it only
 * flags the clearly-suspicious patterns with individually justified
 * exclusions, mirroring the review's guidance.
 */
describe('locale-less presentation guard', () => {
  const srcRoot = path.join(__dirname, '..', '..', 'src');

  // Explicit allowlist for intentional system-locale / non-presentation uses.
  // Format: "relative/path.ts" -> reason.
  const INTENTIONAL = {
    'screens/LogScreen.tsx': 'debug/log clipboard display (category C)',
    'services/api/healthDataApi.ts': 'device timezone resolution, not presentation',
    'services/api/preferencesApi.ts': 'device timezone resolution, not presentation',
    'services/healthkit/dataTransformation.ts': 'device timezone resolution, not presentation',
    'utils/dateUtils.ts': 'receives an explicit app/locale parameter or derives from resolvedLanguage',
    'utils/medicationScheduleLocalization.ts': 'locale parameter defaults to getAppLocale()',
    'screens/ImportHistoryScreen.tsx': 'locale parameter derived from i18n.language (app locale)',
    'components/wellness/CycleCalendarGrid.tsx': 'derives pl-PL/en-US from i18n.language (app locale)',
  };

  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  walk(srcRoot);

  test('forbids implicit-locale toLocale* calls outside the justified allowlist', () => {
    const forbidden = new Set([
      '.toLocaleString()',
      '.toLocaleDateString()',
      '.toLocaleTimeString()',
      '.toLocaleString(undefined',
      '.toLocaleDateString(undefined',
      '.toLocaleTimeString(undefined',
      '.toLocaleString([]',
      '.toLocaleDateString([]',
      '.toLocaleTimeString([]',
    ]);

    const violations: string[] = [];

    for (const file of files) {
      const rel = path.relative(srcRoot, file).replaceAll('\\', '/');
      if (Object.prototype.hasOwnProperty.call(INTENTIONAL, rel)) continue;

      const source = fs.readFileSync(file, 'utf8');
      source.split('\n').forEach((line, idx) => {
        for (const needle of forbidden) {
          if (line.includes(needle)) {
            violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  test('documents the intended allowlist for remaining system-locale uses', () => {
    // This test keeps the allowlist honest: every entry must be a real file.
    for (const rel of Object.keys(INTENTIONAL)) {
      expect(fs.existsSync(path.join(srcRoot, rel))).toBe(true);
    }
  });
});
