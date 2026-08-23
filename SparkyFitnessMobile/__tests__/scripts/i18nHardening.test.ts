import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(__filename);
const validator = require('../../scripts/i18n-audit/localeValidator.cjs');
const scanner = require('../../scripts/i18n-audit/sourceScanner.cjs');

function fixture(source: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-hardening-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'fixture.tsx'), source);
  return root;
}

describe('multilingual validator hardening', () => {
  it('uses runtime CLDR categories for German and Arabic', () => {
    expect(validator.requiredPluralForms('de-DE')).toEqual(
      new Intl.PluralRules('de-DE').resolvedOptions().pluralCategories.map((x: string) => `_${x}`),
    );
    expect(validator.requiredPluralForms('ar')).toEqual(
      new Intl.PluralRules('ar').resolvedOptions().pluralCategories.map((x: string) => `_${x}`),
    );
  });

  it('rejects invalid source leaves and source categories', () => {
    const root = fixture('{}');
    const en = path.join(root, 'en.json');
    fs.writeFileSync(en, JSON.stringify({ item_one: '{{count}} item', item_other: '{{count}} items', item_few: 'few', invalid: 3 }));
    const result = new validator.LocaleValidator(en, null, { sourceIntlLocale: 'en-US', localePaths: [] }).validate();
    expect(result.errors.some((x: { rule: string }) => x.rule === 'invalid-source-leaf')).toBe(true);
    expect(result.errors.some((x: { rule: string }) => x.rule === 'invalid-plural-category')).toBe(true);
  });

  it('validates optional target zero placeholders without requiring zero', () => {
    const root = fixture('{}');
    const en = path.join(root, 'en.json');
    const pl = path.join(root, 'pl.json');
    fs.writeFileSync(en, JSON.stringify({ item_one: '{{count}} item', item_other: '{{count}} items' }));
    fs.writeFileSync(pl, JSON.stringify({ item_zero: '{{total}} items' }));
    const result = new validator.LocaleValidator(en, pl, { localePaths: [{ locale: 'pl', path: pl, intlLocale: 'pl-PL' }] }).validate();
    expect(result.errors.some((x: { rule: string; locale?: string }) => x.rule === 'placeholder-mismatch' && x.locale === 'pl')).toBe(true);
  });
});

describe('bounded locale-unsafe number scanner', () => {
  function findings(source: string) {
    const root = fixture(source);
    return scanner.collectFindings(root, [path.join(root, 'src')]).findings.filter((x: { kind: string }) => x.kind === 'locale-unsafe-number-format');
  }

  it.each([
    '<Text>{value.toFixed(1)}</Text>',
    '<Axis tickFormat={(value) => value.toFixed(1)} />',
    'const chart = { tickFormat: (value) => value.toFixed(1) };',
    'Toast.show({ text1: weight.toFixed(1) });',
    "Alert.alert('Weight', weight.toFixed(1));",
    "<Text>{value.toLocaleString('en-US')}</Text>",
    "<Text>{new Intl.NumberFormat('en-US').format(value)}</Text>",
  ])('finds unsafe presentation: %s', (source) => expect(findings(source).length).toBeGreaterThan(0));

  it('allows internal and app-locale formatting', () => {
    expect(findings('const storage = value.toFixed(1);')).toHaveLength(0);
    expect(findings('<Text>{formatLocalizedNumber(value)}</Text>')).toHaveLength(0);
    expect(findings('<Text>{value.toLocaleString(getAppLocale())}</Text>')).toHaveLength(0);
  });

  it('supports one exact-line suppression', () => {
    const result = findings('// i18n-audit-ignore-next-line locale-unsafe-number-format -- deliberate legacy output\n<Text>{value.toFixed(1)}</Text>');
    expect(result).toHaveLength(0);
  });
});
