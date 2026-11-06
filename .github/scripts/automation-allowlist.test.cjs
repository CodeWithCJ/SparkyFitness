const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { allowedFor, outsideAllowlist } = require('./automation-allowlist.cjs');

const root = resolve(__dirname, '../..');
const tracked = (...specs) =>
  execFileSync('git', ['ls-files', '--', ...specs], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

const catalogues = tracked(
  'SparkyFitnessFrontend/public/locales',
  'SparkyFitnessMobile/src/localization/locales',
  'SparkyFitnessMobile/locales',
  'SparkyFitnessMobile/targets/android-widget/res/values-*/widget_strings.xml',
  'SparkyFitnessMobile/targets/widget/*.lproj/Localizable.strings'
);
const isEnglish = (p) =>
  /\/locales\/en\/|\/locales\/en\.json$|\/en\.lproj\/|\/res\/values\//.test(p);

test('every non-English catalogue in the repo is allowed on i18n/ branches', () => {
  const nonEnglish = catalogues.filter((p) => !isEnglish(p));
  assert.ok(
    nonEnglish.length > 50,
    'expected the real locale files to be found'
  );
  assert.deepEqual(
    outsideAllowlist('i18n/sync-weblate-translations', nonEnglish),
    []
  );
});

test('English catalogues are never allowed', () => {
  const english = catalogues.filter(isEnglish);
  assert.ok(english.length > 0);
  assert.deepEqual(
    outsideAllowlist('i18n/sync-weblate-translations', english),
    english
  );
});

test('code, workflows, nested and non-catalogue files are rejected', () => {
  const bad = [
    'SparkyFitnessFrontend/src/App.tsx',
    '.github/workflows/sync-translations.yml',
    'package.json',
    'SparkyFitnessFrontend/public/locales/de/evil.html',
    'SparkyFitnessFrontend/public/locales/de/.prettierrc.cjs',
    'SparkyFitnessFrontend/public/locales/fr/cache/note.json',
    'SparkyFitnessMobile/targets/widget/de.lproj/Controls.swift',
    'nix/update-hashes.sh',
  ];
  assert.deepEqual(
    outsideAllowlist('i18n/sync-weblate-translations', bad),
    bad
  );
  assert.deepEqual(outsideAllowlist('nix/update-pnpm-hashes', bad), bad);
});

test('nix/ branches allow only nix/*.nix', () => {
  assert.deepEqual(
    outsideAllowlist('nix/update-pnpm-hashes', [
      'nix/backend.nix',
      'nix/frontend.nix',
    ]),
    []
  );
  assert.deepEqual(
    outsideAllowlist('nix/update-pnpm-hashes', [
      'SparkyFitnessFrontend/public/locales/de/translation.json',
    ]),
    ['SparkyFitnessFrontend/public/locales/de/translation.json']
  );
});

test('other branches have no allowlist, so every path is outside it', () => {
  assert.equal(allowedFor('feat/anything'), null);
  assert.deepEqual(
    outsideAllowlist('umbrel/update-app-package', ['nix/backend.nix']),
    ['nix/backend.nix']
  );
});
