import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(pathToFileURL(__filename));
const localeMod = require('../../scripts/i18n-audit/localeValidator.cjs');
const LocaleValidator: any = localeMod.LocaleValidator;
const groupPluralKeys = localeMod.groupPluralKeys;

const SourceScanner = require('../../scripts/i18n-audit/sourceScanner.cjs');
const collectFindings = SourceScanner.collectFindings;

const coreMod = require('../../scripts/i18n-audit/core.cjs');
const runAudit = coreMod.runAudit;

let enLocalePath = '';
let plLocalePath = '';
let fixtureRoot = '';

async function createFixtureStructure(
  structure: Record<string, string>,
  sourceFiles: Record<string, string> = {},
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-audit-test-'));
  const srcDir = path.join(tmpDir, 'src');
  const scriptsDir = path.join(tmpDir, 'scripts');
  const localeDir = path.join(srcDir, 'localization', 'locales');
  const enDir = path.join(localeDir, 'en');
  const plDir = path.join(localeDir, 'pl');

  fs.mkdirSync(enDir, { recursive: true });
  fs.mkdirSync(plDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  const enContent = structure.en || '{}';
  const plContent = structure.pl || '{}';

  enLocalePath = path.join(enDir, 'translation.json');
  plLocalePath = path.join(plDir, 'translation.json');

  fs.writeFileSync(enLocalePath, enContent);
  fs.writeFileSync(plLocalePath, plContent);

  for (const [relPath, content] of Object.entries(sourceFiles)) {
    const fullPath = path.join(srcDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  fixtureRoot = tmpDir;

  return tmpDir;
}

async function cleanupFixture() {
  if (fixtureRoot && fs.existsSync(fixtureRoot)) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

afterEach(async () => {
  await cleanupFixture();
});

function auditRun(tmpDir: string, extra: any = {}) {
  return runAudit({
    rootDir: tmpDir,
    enLocalePath,
    plLocalePath,
    sourceRoots: [path.join(tmpDir, 'src')],
    forbiddenFiles: [],
    ...extra,
  });
}

describe('LocaleValidator', () => {
  it('1. passes for structurally matching EN/PL locales', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"common": {"save": "Save", "close": "Close"}}',
      pl: '{"common": {"save": "Zapisz", "close": "Zamknij"}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
  });

  it('2. fails for missing plain key in PL', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"common": {"save": "Save", "close": "Close"}}',
      pl: '{"common": {"save": "Zapisz"}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'missing-key' && e.key === 'common.close')).toBe(true);
  });

  it('3. fails for extra key in PL', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"common": {"save": "Save"}}',
      pl: '{"common": {"save": "Zapisz", "extra": "Dodatkowy"}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'missing-key' && e.locale === 'en' && e.key === 'common.extra')).toBe(true);
  });

  it('4. fails for malformed JSON', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{invalid json}',
      pl: '{"common": {"save": "Zapisz"}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'malformed-json')).toBe(true);
  });

  it('5. fails for type mismatch (string vs non-string)', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"common": {"save": "Save"}}',
      pl: '{"common": {"save": 5}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'type-mismatch')).toBe(true);
  });

  it('6. fails for different array length', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"days": {"short": ["Sun", "Mon", "Tue"]}}',
      pl: '{"days": {"short": ["Nie", "Pon"]}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'array-length-mismatch')).toBe(true);
  });

  it('7. fails for mismatched placeholders', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"msg": "Delete {{name}}?"}',
      pl: '{"msg": "Usunąć {{count}}?"}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'placeholder-mismatch')).toBe(true);
  });

  it('8. passes for same placeholders in different order', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"msg": "Delete {{name}} and {{count}}?"}',
      pl: '{"msg": "Usunąć {{count}} i {{name}}?"}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
  });

  it('fails for duplicate locale keys (singular colliding with plural group)', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item": "Item", "item_one": "One item", "item_other": "Items"}',
      pl: '{"item": "Przedmiot", "item_one": "Jeden", "item_other": "Przedmioty"}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'singular-plural-collision')).toBe(true);
  });
});

describe('Pluralization', () => {
  it('9. fails for missing _many in Polish', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"count": {"item_one": "item", "item_other": "items"}}',
      pl: '{"count": {"item_one": "przedmiot", "item_few": "przedmioty", "item_other": "przedmiotów"}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors.some((e: any) => e.rule === 'missing-plural-form' && e.locale === 'pl' && e.form === '_many')).toBe(true);
  });

  it('10. passes for EN _one/_other and PL _one/_few/_many/_other', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"count": {"item_one": "item", "item_other": "items"}}',
      pl: '{"count": {"item_one": "przedmiot", "item_few": "przedmioty", "item_many": "przedmiotów", "item_other": "przedmiotów"}}',
    });

    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Static t() key detection', () => {
  const sourceWithStaticKey = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('common.save');
}
`;

  it('11. detects existing static key', async () => {
    const tmpDir = await createFixtureStructure(
      {
        en: '{"common": {"save": "Save"}}',
        pl: '{"common": {"save": "Zapisz"}}',
      },
      { 'test.ts': sourceWithStaticKey },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const staticKeyFindings = findings.filter((f: any) => f.kind === 'static-t-key');
    expect(staticKeyFindings.some((f: any) => f.value === 'common.save')).toBe(true);
  });

  it('12. fails for missing static key in locale', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('nonexistent.key');
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common": {"save": "Save"}}', pl: '{"common": {"save": "Zapisz"}}' },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.missingStaticKeys.some((e: any) => e.key === 'nonexistent.key')).toBe(true);
  });
});

describe('English fallback detection', () => {
  it('flags user-facing t() without an explicit English fallback', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('common.save');
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common": {"save": "Save"}}', pl: '{"common": {"save": "Zapisz"}}' },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.missingFallbackFindings.some((e: any) => e.key === 'common.save')).toBe(true);
  });

  it('accepts t() with a positional fallback string', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('common.save', 'Save');
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common": {"save": "Save"}}', pl: '{"common": {"save": "Zapisz"}}' },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(false);
    expect(result.report.missingFallbackFindings.length).toBe(0);
  });

  it('accepts t() with a defaultValue option', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('example.greeting', { name, defaultValue: 'Hello, {{name}}' });
}
`;
    const tmpDir = await createFixtureStructure(
      {
        en: '{"example": {"greeting": "Hello, {{name}}"}}',
        pl: '{"example": {"greeting": "Cześć, {{name}}"}}',
      },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(false);
    expect(result.report.missingFallbackFindings.length).toBe(0);
  });

  it('flags t() with options that lack defaultValue', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test({ count }) {
  const { t } = useTranslation();
  return t('items', { count });
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.missingFallbackFindings.some((e: any) => e.key === 'items')).toBe(true);
  });

  it('allows an explicit suppression with justification for technical lookups', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  // i18n-audit-ignore-next-line missing-fallback -- technical lookup: canonical server key, never rendered
  return t('server.key');
}
`;
    const tmpDir = await createFixtureStructure(
      {
        en: '{"server": {"key": "Server key"}}',
        pl: '{"server": {"key": "Klucz serwera"}}',
      },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(false);
    expect(result.report.missingFallbackFindings.length).toBe(0);
  });

  it('rejects a missing-fallback suppression without justification', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  // i18n-audit-ignore-next-line missing-fallback
  return t('common.save');
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.localeStructuralErrors.some((e: any) => e.rule === 'suppression-without-justification')).toBe(true);
  });
});

describe('Dynamic t() key detection', () => {
  it('13. fails for dynamic key from server value', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test({ category }) {
  const { t } = useTranslation();
  return t(category.name);
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const dynamicFindings = findings.filter((f: any) => f.kind === 'dynamic-t-key');
    expect(dynamicFindings.length).toBeGreaterThan(0);
    expect(dynamicFindings[0].value).toBe('category.name');
  });

  it('fails the audit for unsafe template-literal translation keys', async () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test({ name }) {
  const { t } = useTranslation();
  return t(\`common.\${name}\`);
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.dynamicI18nFindings.length).toBe(1);
  });
});

describe('Hardcoded UI text detection (informational)', () => {
  it('14. reports new hardcoded text in <Text> without failing the audit', async () => {
    const source = `
import React from 'react';
import { Text } from 'react-native';
export function Test() {
  return <Text>Hardcoded English</Text>;
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source },
    );

    const result = auditRun(tmpDir);
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const hardcoded = findings.filter((f: any) => f.kind === 'hardcoded-ui-text' && f.value === 'Hardcoded English');

    expect(hardcoded.length).toBe(1);
    expect(result.hasErrors).toBe(false);
    expect(result.report.hardcodedUiFindings.length).toBeGreaterThan(0);
  });

  it('15. detects hardcoded accessibilityLabel', async () => {
    const source = `
import React from 'react';
import { View } from 'react-native';
export function Test() {
  return <View accessibilityLabel="Back" />;
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const hardcoded = findings.filter((f: any) => f.kind === 'hardcoded-ui-text' && f.value === 'Back');
    expect(hardcoded.length).toBe(1);
  });

  it('16. detects Alert.alert text', async () => {
    const source = `
import { Alert } from 'react-native';
export function Test() {
  Alert.alert('Are you sure?', 'This cannot be undone', [{ text: 'Delete', onPress: () => {} }]);
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const hardcodedValues = findings
      .filter((f: any) => f.kind === 'hardcoded-ui-text')
      .map((f: any) => f.value);
    expect(hardcodedValues).toContain('Are you sure?');
    expect(hardcodedValues).toContain('This cannot be undone');
    expect(hardcodedValues).toContain('Delete');
  });

  it('17. detects Toast.show text1', async () => {
    const source = `
import Toast from 'react-native-toast-message';
export function Test() {
  Toast.show({ text1: 'Success', text2: 'Saved successfully' });
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const hardcodedValues = findings
      .filter((f: any) => f.kind === 'hardcoded-ui-text')
      .map((f: any) => f.value);
    expect(hardcodedValues).toContain('Success');
    expect(hardcodedValues).toContain('Saved successfully');
  });
});

describe('False positive exclusion', () => {
  it('18. does not flag route names, icon names, or testIDs', async () => {
    const source = `
import React from 'react';
import { Text } from 'react-native';
export function Test() {
  return (
    <>
      <Text testID="myButton" />
      <Text>SomeRouteName</Text>
    </>
  );
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const hardcoded = findings
      .filter((f: any) => f.kind === 'hardcoded-ui-text')
      .map((f: any) => f.value);
    expect(hardcoded).not.toContain('myButton');
    expect(hardcoded).not.toContain('SomeRouteName');
  });
});

describe('Static key resolution', () => {
  it('exact plain key passes', async () => {
    const src = `export function F(t){ return t('common.save'); }`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir);
    expect(result.report.missingStaticKeys.length).toBe(0);
  });

  it('common.save_as does not satisfy common.save', async () => {
    const src = `export function F(t){ return t('common.save'); }`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save_as":"Save as"}}', pl: '{"common":{"save_as":"Zapisz jako"}}' },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir);
    expect(result.report.missingStaticKeys.some((e: any) => e.key === 'common.save')).toBe(true);
  });

  it('valid plural base passes', async () => {
    const src = `export function F(t){ return t('measurement', { count }); }`;
    const tmpDir = await createFixtureStructure(
      {
        en: '{"measurement_one":"measurement","measurement_other":"measurements"}',
        pl: '{"measurement_one":"pomiar","measurement_few":"pomiary","measurement_many":"pomiarów","measurement_other":"pomiaru"}',
      },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir);
    expect(result.report.missingStaticKeys.length).toBe(0);
  });

  it('static template literal `common.save` is static', async () => {
    const src = `export function F(t){ return t(\`common.save\`); }`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src },
    );
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const staticF = findings.filter((f: any) => f.kind === 'static-t-key' && f.value === 'common.save');
    const dynF = findings.filter((f: any) => f.kind === 'dynamic-t-key');
    expect(staticF.length).toBe(1);
    expect(dynF.length).toBe(0);
  });

  it('dynamic template literal is dynamic', async () => {
    const src = `export function F(t){ return t(\`common.\${name}\`); }`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const dynF = findings.filter((f: any) => f.kind === 'dynamic-t-key');
    expect(dynF.length).toBe(1);
  });

  it('t(("common.save" as const)) is static', async () => {
    const src = `export function F(t){ return t(('common.save' as const)); }`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir);
    expect(result.report.dynamicI18nFindings.length).toBe(0);
    expect(result.report.missingStaticKeys.length).toBe(0);
  });
});

describe('Per-rule suppression', () => {
  it('hardcoded suppression works', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- Protocol label
return <Text>Protocol Value</Text>;`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.tsx': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    expect(findings.filter((f: any) => f.value === 'Protocol Value').length).toBe(0);
  });

  it('dynamic suppression works', async () => {
    const src = `// i18n-audit-ignore-next-line dynamic-i18n-key -- server key
return t(variable);`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const result = auditRun(tmpDir);
    expect(result.report.dynamicI18nFindings.length).toBe(0);
  });

  it('wrong rule does not suppress finding', async () => {
    // hardcoded suppression should not hide a dynamic t()
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
const a = t(variable);`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const result = auditRun(tmpDir);
    expect(result.report.dynamicI18nFindings.length).toBe(1);
  });

  it('missing justification is an error', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text
return <Text>No justification</Text>;`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.tsx': src });
    const result = auditRun(tmpDir);
    expect(result.report.localeStructuralErrors.some((e: any) => e.rule === 'suppression-without-justification')).toBe(true);
  });

  it('unknown rule is an error', async () => {
    const src = `// i18n-audit-ignore-next-line bogus-rule -- reason
const a = 1;`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const result = auditRun(tmpDir);
    expect(result.report.localeStructuralErrors.some((e: any) => e.rule === 'unknown-suppression-rule')).toBe(true);
  });

  it('suppression does not hide a missing static key', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
return t('missing.key');`;
    const tmpDir = await createFixtureStructure({ en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' }, { 'x.ts': src });
    const result = auditRun(tmpDir);
    expect(result.report.missingStaticKeys.some((e: any) => e.key === 'missing.key')).toBe(true);
  });
});

describe('Alert and Toast dedup', () => {
  it('Alert produces exactly title/message/button', async () => {
    const src = `import { Alert } from 'react-native';
Alert.alert('Title', 'Message', [{ text: 'Delete', onPress() {} }]);`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const alertF = findings.filter((f: any) => f.kind === 'hardcoded-ui-text');
    expect(alertF).toHaveLength(3);
    const values = alertF.map((f: any) => f.value);
    expect(values).toContain('Title');
    expect(values).toContain('Message');
    expect(values).toContain('Delete');
    const deleteF = alertF.find((f: any) => f.value === 'Delete');
    expect(deleteF.context.context).toBe('Alert.alert:button');
  });

  it('second Alert button is its own single finding', async () => {
    const src = `import { Alert } from 'react-native';
Alert.alert('Title', 'Message', [{ text: 'Delete', onPress() {} }, { text: 'Cancel', onPress() {} }]);`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const deleteF = findings.filter((f: any) => f.kind === 'hardcoded-ui-text' && f.value === 'Delete');
    const cancelF = findings.filter((f: any) => f.kind === 'hardcoded-ui-text' && f.value === 'Cancel');
    expect(deleteF).toHaveLength(1);
    expect(cancelF).toHaveLength(1);
  });

  it('Toast produces exactly text1/text2', async () => {
    const src = `import Toast from 'react-native-toast-message';
Toast.show({ text1: 'Success', text2: 'Saved' });`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const toastF = findings.filter((f: any) => f.kind === 'hardcoded-ui-text');
    expect(toastF).toHaveLength(2);
    const success = toastF.find((f: any) => f.value === 'Success');
    expect(success.context.context).toBe('Toast.show');
    expect(success.context.prop).toBe('text1');
  });
});

describe('Forbidden files', () => {
  it('detects forbidden mobile.pl.json', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      {},
    );

    fs.writeFileSync(path.join(tmpDir, 'src', 'localization', 'mobile.pl.json'), '{}');

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.forbidden.some((f: any) => f.file.includes('mobile.pl.json'))).toBe(true);
  });

  it('detects forbidden populate-mobile-polish.mjs', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      {},
    );
    fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'scripts', 'populate-mobile-polish.mjs'), 'console.log("old script");');

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.forbidden.some((f: any) => f.file.includes('populate-mobile-polish.mjs'))).toBe(true);
  });
});

describe('groupPluralKeys', () => {
  it('returns both plural group and plain single for the same base', () => {
    const result = groupPluralKeys(['item_one', 'item_other', 'item']);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ base: 'item', isPlural: true }),
        expect.objectContaining({ base: 'item', isPlural: false, keys: ['item'] }),
      ]),
    );
  });
});
