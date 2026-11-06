const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { test } = require('node:test');
const {
  allowedFor,
  outsideAllowlist,
  rendersMarkup,
  valuesWithAttributes,
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
    'SparkyFitnessMobile/targets/android-widget/res/values-en/widget_strings.xml',
    'SparkyFitnessMobile/targets/android-widget/res/values-en-rGB/widget_strings.xml',
    'SparkyFitnessMobile/targets/android-widget/res/values-b+en+US/widget_strings.xml',
    'SparkyFitnessMobile/targets/android-widget/res/values-night/widget_strings.xml',
    'SparkyFitnessMobile/targets/android-widget/res/values-v31/widget_strings.xml',
    'SparkyFitnessMobile/targets/android-widget/res/values-car/widget_strings.xml',
    'SparkyFitnessMobile/targets/android-widget/res/values-de-night/widget_strings.xml',
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

test('no web catalogue in the repo puts attributes in a tag', () => {
  const json = catalogues.filter(
    (p) => p.endsWith('.json') && rendersMarkup(p)
  );
  assert.ok(json.length > 20, 'expected the web catalogues to be found');
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
    quotedBracket: '<link ">" href="https://example.com">text</link>',
    bareQuote: '<0 "x">text</0>',
    percent: 'Low (<15%)',
    minute: '<1 min',
    lessThan: 'Under < 5 kg, or a<b',
    closing: 'Fat</|final|> and <!-- note -->',
    doctype: '<!x href="https://example.com">x',
    openAtEnd: 'Read more <0 href="https://example.com"',
  });
  assert.deepEqual(valuesWithAttributes(catalogue), [
    'nested.link',
    'target',
    'slash',
    'quotedBracket',
    'doctype',
    'openAtEnd',
  ]);
});

test('only web catalogues are value-checked, because mobile has no <Trans>', () => {
  assert.ok(
    rendersMarkup('SparkyFitnessFrontend/public/locales/de/translation.json')
  );
  assert.ok(
    !rendersMarkup(
      'SparkyFitnessMobile/src/localization/locales/de/translation.json'
    )
  );
  // Skipping mobile is only safe while it renders values as plain text.
  const withTrans = tracked('SparkyFitnessMobile/src').filter(
    (p) =>
      /\.[jt]sx?$/.test(p) &&
      /<Trans\b|\bTrans\b[^\n]*from ['"]react-i18next['"]/.test(
        readFileSync(resolve(root, p), 'utf8')
      )
  );
  assert.deepEqual(withTrans, []);
});

test('JSON escapes cannot hide a tag', () => {
  const raw =
    '{"k": "\\u003c0 href=\\"https://example.com\\"\\u003ex\\u003c/0\\u003e"}';
  assert.ok(!raw.includes('<'), 'the raw text has no literal tag');
  assert.deepEqual(valuesWithAttributes(raw), ['k']);
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
