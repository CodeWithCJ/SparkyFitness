import fs from 'node:fs';
import path from 'node:path';

/**
 * Narrow regression guard against future implicit-locale presentation.
 *
 * We scan the source tree for locale-less date/number formatting calls that
 * would silently use the device/runtime locale instead of the active Sparky
 * application locale. Only the clearly-suspicious patterns are flagged:
 * toLocale{String,Date,Time} with an empty / undefined / [] locale argument.
 * Uses that pass an app-derived locale (e.g. .toLocaleDateString(locale, ...))
 * are not flagged, because they already honor the application locale.
 *
 * Exceptions are granted per call-site line (not whole files), so a new
 * accidental implicit-locale call added to an otherwise-trusted file is still
 * caught.
 */
describe('locale-less presentation guard', () => {
  const srcRoot = path.join(__dirname, '..', '..', 'src');

  // Per-call-site exceptions for intentional system-locale / non-presentation
  // uses. Format: "relative/path:line" -> reason. Only these exact lines are
  // exempted; a new bad call elsewhere in the same file is still flagged.
  const INTENTIONAL_LINES: Record<string, string> = {
    'screens/LogScreen.tsx:223': 'debug/log clipboard display (category C)',
    'screens/LogScreen.tsx:325': 'debug/log clipboard display (category C)',
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

  test('forbids implicit-locale toLocale* calls outside per-line exceptions', () => {
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
    const appliedExceptions: string[] = [];

    for (const file of files) {
      const rel = path.relative(srcRoot, file).replaceAll('\\', '/');
      const source = fs.readFileSync(file, 'utf8');
      source.split('\n').forEach((line, idx) => {
        const lineNo = idx + 1;
        for (const needle of forbidden) {
          if (!line.includes(needle)) continue;

          const key = `${rel}:${lineNo}`;
          if (Object.prototype.hasOwnProperty.call(INTENTIONAL_LINES, key)) {
            appliedExceptions.push(key);
            continue;
          }
          violations.push(`${rel}:${lineNo}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);

    // Every documented per-line exception must correspond to a real flagged
    // call — otherwise the allowlist silently references an obsolete line.
    for (const key of Object.keys(INTENTIONAL_LINES)) {
      expect(appliedExceptions).toContain(key);
    }
  });

  test('intentional timezone-resolution files contain no implicit-locale toLocale* presentation', () => {
    // These files legitimately read the device timezone via Intl.DateTimeFormat,
    // which the scanner does not flag. Assert they have no empty-arg toLocale*
    // presentation calls leaking through.
    const tzFiles = [
      'services/api/healthDataApi.ts',
      'services/api/preferencesApi.ts',
      'services/healthkit/dataTransformation.ts',
    ];
    for (const rel of tzFiles) {
      const source = fs.readFileSync(path.join(srcRoot, rel), 'utf8');
      const flagged = source
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) =>
          /\.toLocaleString\(\)|\.toLocaleDateString\(\)|\.toLocaleTimeString\(\)/.test(line),
        );
      expect(
        flagged.map(({ line, n }) => `${rel}:${n}: ${line.trim()}`),
      ).toEqual([]);
    }
  });
});
