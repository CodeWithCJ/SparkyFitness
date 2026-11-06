const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { test } = require('node:test');
const {
  allowedFor,
  outsideAllowlist,
  valuesWithAttributes,
  addedLinesWithAttributes,
} = require('./automation-allowlist.cjs');
const { readFileSync } = require('node:fs');

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
});

test('nix/ branches are not auto-merged: their workflow merges its own PR', () => {
  assert.equal(allowedFor('nix/update-pnpm-hashes'), null);
  assert.deepEqual(
    outsideAllowlist('nix/update-pnpm-hashes', ['nix/backend.nix']),
    ['nix/backend.nix']
  );
});

test('no catalogue in the repo puts attributes in a tag', () => {
  const json = catalogues.filter((p) => p.endsWith('.json'));
  const found = json.flatMap((p) =>
    valuesWithAttributes(readFileSync(resolve(root, p), 'utf8')).map(
      (k) => `${p}: ${k}`
    )
  );
  assert.deepEqual(found, []);
});

test('values may carry tags but not attributes', () => {
  const catalogue = JSON.stringify({
    plain: 'Open <0>settings</0> and <strong>save</strong>',
    nested: { link: 'Read <0 href="https://example.com">this</0>' },
    target: '<1 target=_blank rel="opener">x</1>',
    slash: '<0/href="https://example.com">x</0>',
    selfClosing: 'Line<br/>break and <0/> here',
  });
  assert.deepEqual(valuesWithAttributes(catalogue), [
    'nested.link',
    'target',
    'slash',
  ]);
});

test('diff check flags only added lines with attributes in a tag', () => {
  const patch = [
    '--- a/x.json',
    '+++ b/x.json',
    '-  "old": "<0 href=\\"a\\">gone</0>",',
    '+  "ok": "<0>fine</0>",',
    '+  "bad": "<0 href=\\"https://evil.example\\">x</0>"',
  ].join('\n');
  assert.equal(addedLinesWithAttributes(patch).length, 1);
  assert.match(addedLinesWithAttributes(patch)[0], /evil/);
});

test('other branches have no allowlist, so every path is outside it', () => {
  assert.equal(allowedFor('feat/anything'), null);
  assert.deepEqual(
    outsideAllowlist('umbrel/update-app-package', [
      'umbrel/sparkyfitness/umbrel-app.yml',
    ]),
    ['umbrel/sparkyfitness/umbrel-app.yml']
  );
});
