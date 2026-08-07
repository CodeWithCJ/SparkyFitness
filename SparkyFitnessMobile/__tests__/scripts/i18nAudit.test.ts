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

  it('3. reports correct delta for 1 → 3', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Some text</Text>\n<Text>Some text</Text>\n<Text>Some text</Text>' },
    );
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 1));
    const newF = result.report.newFindings.find((f: any) => f.fingerprint === fp);
    expect(newF).toBeDefined();
    expect(newF.delta).toBe(2);
    expect(newF.currentCount).toBe(3);
    expect(newF.baselineCount).toBe(1);
  });

  it('4. reports stale for 3 → 2', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Some text</Text>\n<Text>Some text</Text>' },
    );
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 3));
    expect(result.hasErrors).toBe(true);
    const stale = result.report.staleBaselineFindings.find((s: any) => s.fingerprint === fp);
    expect(stale).toBeDefined();
    expect(stale.removed).toBe(1);
    expect(stale.baselineCount).toBe(3);
    expect(stale.currentCount).toBe(2);
    expect(result.report.acceptedBaselineFindings).toBe(2);
  });

  it('5. reports correct delta for 3 → 1', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Some text</Text>' },
    );
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 3));
    const stale = result.report.staleBaselineFindings.find((s: any) => s.fingerprint === fp);
    expect(stale).toBeDefined();
    expect(stale.removed).toBe(2);
    expect(result.report.acceptedBaselineFindings).toBe(1);
  });

  it('6. reports stale for total disappearance 1 → 0', async () => {
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, {});
    const result = auditRun(tmpDir, hardcodedBaseline(fp, file, value, context, 1));
    expect(result.hasErrors).toBe(true);
    const stale = result.report.staleBaselineFindings.find((s: any) => s.fingerprint === fp);
    expect(stale).toBeDefined();
    expect(stale.removed).toBe(1);
    expect(stale.baselineCount).toBe(1);
    expect(stale.currentCount).toBe(0);
  });

  it('7. reports new fingerprint', async () => {
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Brand new text</Text>' },
    );
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.hasErrors).toBe(true);
    expect(result.report.newFindings.some((f: any) => f.value === 'Brand new text')).toBe(true);
  });

  it('8. accepted count is correct with partial mismatch', async () => {
    // fp has 2 current, 1 baseline -> min 1 accepted. Another fp has 2/2 -> 2 accepted.
    const fp2fp = buildMigrationFingerprint({ file, value: 'Other', kind: 'hardcoded-ui-text', context });
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': '<Text>Some text</Text>\n<Text>Some text</Text>\n<Text>Other</Text>\n<Text>Other</Text>' },
    );
    const result = auditRun(tmpDir, {
      version: 1,
      findings: [
        { rule: 'hardcoded-ui-text', file, value, context, fingerprint: fp },
        { rule: 'hardcoded-ui-text', file, value: 'Other', context, fingerprint: fp2fp },
      ],
      counts: { [fp]: 1, [fp2fp]: 2 },
    });
    expect(result.report.acceptedBaselineFindings).toBe(3);
    expect(result.report.newFindings.length).toBe(1);
    expect(result.report.staleBaselineFindings.length).toBe(0);
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

describe('Plural group validation', () => {
  it('15. fails for missing PL _many', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item_one":"item","item_other":"items"}',
      pl: '{"item_one":"przedmiot","item_few":"przedmioty","item_other":"przedmiotów"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'missing-plural-form' && e.locale === 'pl' && e.form === '_many')).toBe(true);
  });

  it('16. fails for missing placeholder in PL _few', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item_one":"{{count}} item","item_other":"{{count}} items"}',
      pl: '{"item_one":"{{count}} element","item_few":"elementy","item_many":"{{count}} elementów","item_other":"{{count}} elementu"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'placeholder-mismatch' && e.key === 'item_few')).toBe(true);
  });

  it('17. fails for missing placeholder in PL _many', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item_one":"{{count}} item","item_other":"{{count}} items"}',
      pl: '{"item_one":"{{count}} element","item_few":"{{count}} elementy","item_many":"elementy","item_other":"{{count}} elementu"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'placeholder-mismatch' && e.key === 'item_many')).toBe(true);
  });

  it('18. fails for EN _one/_other inconsistency', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item_one":"{{count}} item","item_other":"items"}',
      pl: '{"item_one":"{{count}} element","item_few":"{{count}} elementy","item_many":"{{count}} elementów","item_other":"{{count}} elementu"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'placeholder-mismatch' && e.key === 'item_other')).toBe(true);
  });

  it('19. plain key plus plural group in EN fails', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item":"Item","item_one":"One item","item_other":"Items"}',
      pl: '{"item":"Przedmiot","item_one":"Jeden","item_few":"Kilka","item_many":"Wiele","item_other":"Przedmioty"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'singular-plural-collision' && e.locale === 'en' && e.key === 'item')).toBe(true);
  });

  it('20. plain key plus plural group in PL fails', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item_one":"One item","item_other":"Items"}',
      pl: '{"item":"Przedmiot","item_one":"Jeden","item_few":"Kilka","item_many":"Wiele","item_other":"Przedmioty"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'singular-plural-collision' && e.locale === 'pl' && e.key === 'item')).toBe(true);
  });

  it('21. complete correct plural group passes', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item_one":"{{count}} item","item_other":"{{count}} items"}',
      pl: '{"item_one":"{{count}} element","item_few":"{{count}} elementy","item_many":"{{count}} elementów","item_other":"{{count}} elementu"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.filter((e: any) => e.rule === 'placeholder-mismatch' || e.rule === 'singular-plural-collision')).toHaveLength(0);
  });

  it('21b. correct EN plural group without a plain key does not collide', async () => {
    const tmpDir = await createFixtureStructure({
      en: '{"item_one":"One item","item_other":"Items"}',
      pl: '{"item_one":"Jeden","item_few":"Kilka","item_many":"Wiele","item_other":"Elementy"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'singular-plural-collision')).toBe(false);
  });

  it.each([
    { name: 'plain before plural in EN', en: '{"item":"Item","item_one":"One item","item_other":"Items"}', pl: '{"item_one":"Jeden","item_few":"Kilka","item_many":"Wiele","item_other":"Elementy"}', locale: 'en' },
    { name: 'plural before plain in EN', en: '{"item_one":"One item","item_other":"Items","item":"Item"}', pl: '{"item_one":"Jeden","item_few":"Kilka","item_many":"Wiele","item_other":"Elementy"}', locale: 'en' },
    { name: 'mixed order EN', en: '{"item_one":"One","item":"Item","item_other":"Items"}', pl: '{"item_one":"Jeden","item_few":"Kilka","item_many":"Wiele","item_other":"Elementy"}', locale: 'en' },
    { name: 'mixed order PL', en: '{"item_one":"One","item_other":"Items"}', pl: '{"item_one":"Jeden","item":"Element","item_few":"Elementy","item_many":"Elementów","item_other":"Elementu"}', locale: 'pl' },
  ])('38. detects singular-plural-collision regardless of order ($name)', async ({ en, pl, locale }) => {
    const tmpDir = await createFixtureStructure({ en, pl });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src', 'localization', 'locales', 'en', 'translation.json'),
      path.join(tmpDir, 'src', 'localization', 'locales', 'pl', 'translation.json'),
    );
    const r = validator.validate();
    expect(r.errors.some((e: any) => e.rule === 'singular-plural-collision' && e.locale === locale && e.key === 'item')).toBe(true);
  });

  it('39. groupPluralKeys returns both plural group and plain single for the same base', () => {
    const result = groupPluralKeys(['item_one', 'item_other', 'item']);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ base: 'item', isPlural: true }),
        expect.objectContaining({ base: 'item', isPlural: false, keys: ['item'] }),
      ]),
    );
  });

  it('39b. groupPluralKeys is order-independent for mixed plain/plural keys', () => {
    const a = groupPluralKeys(['item_one', 'item_other', 'item']);
    const b = groupPluralKeys(['item', 'item_other', 'item_one']);
    const normalize = (rows: any[]) =>
      rows.map((r) => ({ base: r.base, isPlural: r.isPlural, keys: [...r.keys].sort() }))
        .sort((x: any, y: any) => (x.base + x.isPlural).localeCompare(y.base + y.isPlural));
    expect(normalize(a)).toEqual(normalize(b));
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

  it('27. one directive suppresses at most one finding', async () => {
    // Two hardcoded on the same next line; directive consumes only one.
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
const obj = { title: 'Alpha text', subtitle: 'Beta text' };`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const values = findings.filter((f: any) => f.kind === 'hardcoded-ui-text').map((f: any) => f.value);
    // Only one of Alpha/Beta is suppressed; the other remains.
    expect(values.filter((v: any) => v === 'Alpha text').length + values.filter((v: any) => v === 'Beta text').length).toBe(1);
  });

  it('28. suppression does not hide a missing static key', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
return t('missing.key');`;
    const tmpDir = await createFixtureStructure({ en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' }, { 'x.ts': src });
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.missingStaticKeys.some((e: any) => e.key === 'missing.key')).toBe(true);
  });

  it('29. suppression does not hide a plural error', async () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
return t('item', { count });`;
    const tmpDir = await createFixtureStructure(
      { en: '{"item_one":"item","item_other":"items"}', pl: '{"item_one":"przedmiot","item_few":"przedmioty"}' },
      { 'x.ts': src },
    );
    const result = auditRun(tmpDir, { version: 1, findings: [], counts: {} });
    expect(result.report.pluralErrors.length).toBeGreaterThan(0);
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
    // 'Delete' must have the Alert.alert:button context, not a generic prop:text
    const deleteF = alertF.find((f: any) => f.value === 'Delete');
    expect(deleteF.context.context).toBe('Alert.alert:button');
    expect(deleteF.context.prop).toBeUndefined();
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
    const saved = toastF.find((f: any) => f.value === 'Saved');
    expect(success.context.context).toBe('Toast.show');
    expect(success.context.prop).toBe('text1');
    expect(saved.context.context).toBe('Toast.show');
    expect(saved.context.prop).toBe('text2');
  });

  it('33. plain text/text1/text2 outside Alert/Toast still detected', async () => {
    const src = `const obj = { text: 'Plain text', text1: 'field1', text2: 'field2' };`;
    const tmpDir = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': src });
    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const values = findings.filter((f: any) => f.kind === 'hardcoded-ui-text').map((f: any) => f.value);
    expect(values).toContain('Plain text');
    expect(values).toContain('field1');
    expect(values).toContain('field2');
  });
});

describe('Suppression', () => {
  it('25. suppression with justification works', async () => {
    const source = `
import { Text } from 'react-native';
export function Test() {
  // i18n-audit-ignore-next-line hardcoded-ui-text -- Protocol-defined label
  return <Text>Protocol Value</Text>;
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source },
    );

    const findings = collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
    const suppressed = findings.filter(
      (f: any) => f.value === 'Protocol Value',
    );
    expect(suppressed.length).toBe(0);
  });

  it('26. suppression without justification does not suppress', async () => {
    const source = `
import { Text } from 'react-native';
export function Test() {
  // i18n-audit-ignore-next-line hardcoded-ui-text
  return <Text>No justification</Text>;
}
`;
    const tmpDir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source },
    );

    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath,
      plLocalePath,
      sourceRoots: [path.join(tmpDir, 'src')],
      forbiddenFiles: [],
      baseline: { version: 1, findings: [], counts: {} },
    });
    expect(result.hasErrors).toBe(true);
    expect(result.report.localeStructuralErrors.some((e: any) => e.rule === 'suppression-without-justification')).toBe(true);
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

  it('30. fingerprint does not change on line shift', async () => {
    const source1 = `
import { Text } from 'react-native';
export function Test1() {
  return <Text>Shifted text</Text>;
}
`;
    const source2 = `
import { Text } from 'react-native';
export function Test() {
  const unused = 1;
  const unused2 = 2;
  return <Text>Shifted text</Text>;
}
`;
    const tmpDir1 = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'test.tsx': source1 });
    const findings1 = collectFindings(tmpDir1, [path.join(tmpDir1, 'src')]);
    const fp1 = buildMigrationFingerprint(findings1.find((f: any) => f.value === 'Shifted text'));

    const tmpDir2 = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'test.tsx': source2 });
    const findings2 = collectFindings(tmpDir2, [path.join(tmpDir2, 'src')]);
    const fp2 = buildMigrationFingerprint(findings2.find((f: any) => f.value === 'Shifted text'));

    expect(fp1).toBe(fp2);
  });

  it('34. fingerprint does not change on line shift (template dynamic)', async () => {
    const source1 = `
export function T(t){ return t(\`common.\${name}\`); }`;
    const source2 = `
export function T(t){
  const a = 1;
  return t(\`common.\${name}\`);
}`;
    const tmpDir1 = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': source1 });
    const f1 = collectFindings(tmpDir1, [path.join(tmpDir1, 'src')]);
    const dyn1 = f1.find((f: any) => f.kind === 'dynamic-t-key');
    expect(dyn1).toBeDefined();
    const fp1 = buildDynamicMigrationFingerprint({ file: dyn1.file, expression: dyn1.value });

    const tmpDir2 = await createFixtureStructure({ en: '{}', pl: '{}' }, { 'x.ts': source2 });
    const f2 = collectFindings(tmpDir2, [path.join(tmpDir2, 'src')]);
    const dyn2 = f2.find((f: any) => f.kind === 'dynamic-t-key');
    expect(dyn2).toBeDefined();
    const fp2 = buildDynamicMigrationFingerprint({ file: dyn2.file, expression: dyn2.value });

    expect(fp1).toBe(fp2);
  });

  it('35. regenerated baseline of a dynamic key does not contain line', async () => {
    const dir = await createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': `export function T(t){ return t(variable); }` },
    );
    const baselinePath = path.join(dir, 'baseline.json');
    auditRun(dir, undefined, { baselinePath, updateBaseline: true });
    const written = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    expect(written.findings.every((f: any) => f.rule !== 'dynamic-i18n-key' || f.line === undefined)).toBe(true);
  });

  it('36. two update-baseline runs produce byte-identical file', async () => {
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

  it('37. update-baseline still refuses on structural error', async () => {
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
