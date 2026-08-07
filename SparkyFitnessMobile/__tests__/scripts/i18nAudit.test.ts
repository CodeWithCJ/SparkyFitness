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
const buildMigrationFingerprint = coreMod.buildMigrationFingerprint;
const buildDynamicMigrationFingerprint = coreMod.buildDynamicMigrationFingerprint;

let enLocalePath = '';
let plLocalePath = '';
let fixtureRoot = '';
let sourcePath = '';

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
  sourcePath = srcDir;

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

function auditRun(
  tmpDir: string,
  baseline?: any,
  extra: any = {},
) {
  return runAudit({
    rootDir: tmpDir,
    enLocalePath,
    plLocalePath,
    sourceRoots: [path.join(tmpDir, 'src')],
    forbiddenFiles: [],
    baseline,
    ...extra,
  });
}

function hardcodedBaseline(fp: string, file: string, value: string, context: any, count: number) {
  return {
    version: 1,
    findings: [{ rule: 'hardcoded-ui-text', file, value, context, fingerprint: fp }],
    counts: { [fp]: count },
  };
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

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
    });

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

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });

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

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });

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
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });

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

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });

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
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });

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

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });

    expect(result.report.localeStructuralErrors.some((e: any) => e.rule === 'suppression-without-justification')).toBe(true);
  });
});

describe('Dynamic t() key detection', () => {
  it('13. detects dynamic key from server value', async () => {
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
});

describe('Hardcoded UI text detection', () => {
  it('14. detects new hardcoded text in <Text>', async () => {
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

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const hardcoded = findings.filter((f: any) => f.kind === 'hardcoded-ui-text' && f.value === 'Hardcoded English');
    expect(hardcoded.length).toBe(1);
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

describe('Baseline behavior', () => {
  it('19. passes when baseline matches current findings', async () => {
    const source = `
import { Text } from 'react-native';
export function Test() {
  return <Text>Baseline text</Text>;
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const targetFinding = findings.find((f: any) => f.value === 'Baseline text');

    const fp = buildMigrationFingerprint(targetFinding);

    const baselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      findings: [{
        rule: 'hardcoded-ui-text',
        file: 'test.tsx',
        value: 'Baseline text',
        context: targetFinding.context,
        fingerprint: fp,
      }],
      counts: {
        [fp]: 1,
      },
    };

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: baselineData,
    });

    expect(result.hasErrors).toBe(false);
    expect(result.report.acceptedBaselineFindings).toBe(1);
  });

  it('20. fails for increased count of same fingerprint', async () => {
    const source = `
import { Alert } from 'react-native';
export function Test() {
  Alert.alert('Delete item?');
  Alert.alert('Delete item?');
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const targetFinding = findings.find((f: any) => f.value === 'Delete item?');
    const fp = buildMigrationFingerprint(targetFinding);

    const baselineData = {
      version: 1,
      createdAt: new Date().toISOString(),
      findings: [{
        rule: 'hardcoded-ui-text',
        file: 'test.ts',
        value: 'Delete item?',
        context: targetFinding.context,
        fingerprint: fp,
      }],
      counts: {
        [fp]: 1,
      },
    };

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: baselineData,
    });

    expect(result.hasErrors).toBe(true);
    expect(result.report.newFindings.some((f: any) => f.message.includes('Increased occurrences'))).toBe(true);
  });

  it('21. fails for new fingerprint', async () => {
    const source = `
import { Text } from 'react-native';
export function Test() {
  return <Text>New text</Text>;
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source },
    );

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });

    expect(result.hasErrors).toBe(true);
    expect(result.report.newFindings.some((f: any) => f.value === 'New text')).toBe(true);
  });

  it('22. fails for stale baseline entry', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      {},
    );

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: {
        version: 1,
        findings: [{
          rule: 'hardcoded-ui-text',
          file: 'test.tsx',
          value: 'Old text',
          context: {},
          fingerprint: 'hardcoded-ui-text:test.tsx:Old text:',
        }],
        counts: {
          'hardcoded-ui-text:test.tsx:Old text:': 1,
        },
      },
    });

    expect(result.hasErrors).toBe(true);
    expect(result.report.staleBaselineFindings.length).toBe(1);
  });

  it('23. update-baseline writes only migration findings', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': 'import { Text } from "react-native"; export function Test() { return <Text>Legacy text</Text>; }' },
    );
    const baselinePath = path.join(tmpDir, 'baseline.json');
    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath,
      plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baselinePath,
      updateBaseline: true,
    });

    expect(result.error).toBeUndefined();
    const written = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    expect(written.findings.every((entry: any) => ['hardcoded-ui-text', 'dynamic-i18n-key'].includes(entry.rule))).toBe(true);
    expect(written).not.toHaveProperty('createdAt');
  });

  it('24. update-baseline refuses structural errors', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{}}' },
      {},
    );
    const baselinePath = path.join(tmpDir, 'baseline.json');
    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath,
      plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baselinePath,
      updateBaseline: true,
    });

    expect(result.error).toBeDefined();
    expect(fs.existsSync(baselinePath)).toBe(false);
  });
});

describe('Baseline counts', () => {
  const context = { element: 'Text', form: 'text' };
  const file = 'src/x.tsx';
  const value = 'Some text';
  let fp: string;

  beforeEach(() => {
    fp = buildMigrationFingerprint({ file, value, kind: 'hardcoded-ui-text', context });
  });

  it('1. passes when 3 occurrences match 3 baseline (3 → 3)', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Some text</Text>\n<Text>Some text</Text>\n<Text>Some text</Text>' },
    );
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 3));
    expect(result.hasErrors).toBe(false);
    expect(result.report.acceptedBaselineFindings).toBe(3);
    expect(result.report.newFindings.length).toBe(0);
    expect(result.report.staleBaselineFindings.length).toBe(0);
  });

  it('2. reports increase for 1 → 2', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Some text</Text>\n<Text>Some text</Text>' },
    );
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 1));
    expect(result.hasErrors).toBe(true);
    expect(result.report.newFindings.some((f: any) => f.baselineCount === 1 && f.currentCount === 2 && f.delta === 1)).toBe(true);
    expect(result.report.acceptedBaselineFindings).toBe(1);
  });

  it('3. reports stale for 3 → 2', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Some text</Text>\n<Text>Some text</Text>' },
    );
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 3));
    expect(result.hasErrors).toBe(true);
    const stale = result.report.staleBaselineFindings.find((s: any) => s.fingerprint === fp);
    expect(stale).toBeDefined();
    expect(stale.removed).toBe(1);
    expect(result.report.acceptedBaselineFindings).toBe(2);
  });

  it('4. reports stale for total disappearance 1 → 0', async () => {
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, {});
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 1));
    expect(result.hasErrors).toBe(true);
    const stale = result.report.staleBaselineFindings.find((s: any) => s.fingerprint === fp);
    expect(stale).toBeDefined();
    expect(stale.removed).toBe(1);
  });

  it('5. reports new fingerprint', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Brand new text</Text>' },
    );
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.hasErrors).toBe(true);
    expect(result.report.newFindings.some((f: any) => f.value === 'Brand new text')).toBe(true);
  });
});

describe('Static key resolution', () => {
  it('9. exact plain key passes', async () => {
    const src = `export function F(t){ return t('common.save'); }`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.missingStaticKeys.length).toBe(0);
  });

  it('10. common.save_as does not satisfy common.save', async () => {
    const src = `export function F(t){ return t('common.save'); }`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save_as":"Save as"}}', pl: '{"common":{"save_as":"Zapisz jako"}}' },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.missingStaticKeys.some((e: any) => e.key === 'common.save')).toBe(true);
  });

  it('11. valid plural base passes', async () => {
    const src = `export function F(t){ return t('measurement', { count }); }`;
    const tmpDir = await createFixtureStructure(
      {
        en: '{"measurement_one":"measurement","measurement_other":"measurements"}',
        pl: '{"measurement_one":"pomiar","measurement_few":"pomiary","measurement_many":"pomiarów","measurement_other":"pomiaru"}',
      },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.missingStaticKeys.length).toBe(0);
  });

  it('12. static template literal `common.save` is static', async () => {
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

  it('13. dynamic template literal is dynamic', async () => {
    const src = `export function F(t){ return t(\`common.\${name}\`); }`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const dynF = findings.filter((f: any) => f.kind === 'dynamic-t-key');
    expect(dynF.length).toBe(1);
  });

  it('14. t(("common.save" as const)) is static', async () => {
    const src = `export function F(t){ return t(('common.save' as const)); }`;
    const tmpDir = await createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.dynamicI18nFindings.length).toBe(0);
    expect(result.report.missingStaticKeys.length).toBe(0);
  });
});

describe('Per-rule suppression', () => {
  it('22. hardcoded suppression works', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- Protocol label
return <Text>Protocol Value</Text>;`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.tsx': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    expect(findings.filter((f: any) => f.value === 'Protocol Value').length).toBe(0);
  });

  it('23. dynamic suppression works', async () => {
    const src = `// i18n-audit-ignore-next-line dynamic-i18n-key -- server key
return t(variable);`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.dynamicI18nFindings.length).toBe(0);
  });

  it('24. wrong rule does not suppress finding', async () => {
    // hardcoded suppression should not hide a dynamic t()
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
const a = t(variable);`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.dynamicI18nFindings.length).toBe(1);
  });

  it('25. missing justification is an error', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text
return <Text>No justification</Text>;`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.tsx': src });
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.localeStructuralErrors.some((e: any) => e.rule === 'suppression-without-justification')).toBe(true);
  });

  it('26. unknown rule is an error', async () => {
    const src = `// i18n-audit-ignore-next-line bogus-rule -- reason
const a = 1;`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.localeStructuralErrors.some((e: any) => e.rule === 'unknown-suppression-rule')).toBe(true);
  });

  it('27. suppression does not hide a missing static key', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
return t('missing.key');`;
    const tmpDir = await createFixtureStructure({ en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' }, { 'x.ts': src });
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.missingStaticKeys.some((e: any) => e.key === 'missing.key')).toBe(true);
  });
});

describe('Alert and Toast dedup', () => {
  it('30. Alert produces exactly title/message/button', async () => {
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

  it('31. second Alert button is its own single finding', async () => {
    const src = `import { Alert } from 'react-native';
Alert.alert('Title', 'Message', [{ text: 'Delete', onPress() {} }, { text: 'Cancel', onPress() {} }]);`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const deleteF = findings.filter((f: any) => f.kind === 'hardcoded-ui-text' && f.value === 'Delete');
    const cancelF = findings.filter((f: any) => f.kind === 'hardcoded-ui-text' && f.value === 'Cancel');
    expect(deleteF).toHaveLength(1);
    expect(cancelF).toHaveLength(1);
  });

  it('32. Toast produces exactly text1/text2', async () => {
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
  it('27. detects forbidden mobile.pl.json', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      {},
    );

    fs.writeFileSync(path.join(tmpDir, 'src', 'localization', 'mobile.pl.json'), '{}');

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [
        path.join(tmpDir, 'src', 'localization', 'mobile.pl.json'),
        path.join(tmpDir, 'src', 'localization', 'mobile.pl.overrides.json'),
        path.join(tmpDir, 'scripts', 'populate-mobile-polish.mjs'),
      ],
    });

    expect(result.hasErrors).toBe(true);
    expect(result.report.forbidden.some((f: any) => f.file.includes('mobile.pl.json'))).toBe(true);
  });

  it('28. detects forbidden populate-mobile-polish.mjs', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      {},
    );
    fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'scripts', 'populate-mobile-polish.mjs'), 'console.log("old script");');

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath: enLocalePath,
      plLocalePath: plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [
        path.join(tmpDir, 'src', 'localization', 'mobile.pl.json'),
        path.join(tmpDir, 'src', 'localization', 'mobile.pl.overrides.json'),
        path.join(tmpDir, 'scripts', 'populate-mobile-polish.mjs'),
      ],
    });

    expect(result.hasErrors).toBe(true);
    expect(result.report.forbidden.some((f: any) => f.file.includes('populate-mobile-polish.mjs'))).toBe(true);
  });
});

describe('Baseline determinism', () => {
  it('29. fingerprint is deterministic', async () => {
    const source1 = `
import { Text } from 'react-native';
export function Test1() {
  return <Text>Deterministic text</Text>;
}
`;

    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source1 },
    );

    const findings1 = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const target = findings1.find((f: any) => f.value === 'Deterministic text');
    const fp1 = buildMigrationFingerprint(target);

    const findings2 = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const target2 = findings2.find((f: any) => f.value === 'Deterministic text');
    const fp2 = buildMigrationFingerprint(target2);

    expect(fp1).toBe(fp2);
  });

  it('30. two update-baseline runs produce byte-identical file', async () => {
    const dir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': `import { Text } from 'react-native';
export function T(){ return <Text>Identical text</Text>; }` },
    );
    const bp1 = path.join(dir, 'baseline1.json');
    const bp2 = path.join(dir, 'baseline2.json');
    auditRun(dir, undefined, { baselinePath: bp1, updateBaseline: true });
    auditRun(dir, undefined, { baselinePath: bp2, updateBaseline: true });
    expect(fs.readFileSync(bp1, 'utf8')).toBe(fs.readFileSync(bp2, 'utf8'));
  });

  it('31. update-baseline still refuses on structural error', async () => {
    const dir = await createFixtureStructure(
      { en: '{"item":"Item","item_one":"One"}', pl: '{"item_one":"Jeden"}' },
      {},
    );
    const baselinePath = path.join(dir, 'baseline.json');
    const result = auditRun(dir, undefined, { baselinePath, updateBaseline: true });
    expect(result.error).toBeDefined();
    expect(fs.existsSync(baselinePath)).toBe(false);
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
