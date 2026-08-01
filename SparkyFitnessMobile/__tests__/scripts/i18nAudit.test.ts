import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(pathToFileURL(__filename));
const localeMod = require('../../scripts/i18n-audit/localeValidator.cjs');
const LocaleValidator: any = localeMod.LocaleValidator;

const SourceScanner = require('../../scripts/i18n-audit/sourceScanner.cjs');
const collectFindings = SourceScanner.collectFindings;

const coreMod = require('../../scripts/i18n-audit/core.cjs');
const runAudit = coreMod.runAudit;
const buildMigrationFingerprint = coreMod.buildMigrationFingerprint;

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
});
