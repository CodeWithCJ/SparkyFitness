import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(pathToFileURL(__filename));
const localeMod = require('../../scripts/i18n-audit/localeValidator.cjs');
const LocaleValidator: new (
  enPath: string,
  plPath: string
) => LocaleValidatorInstance = localeMod.LocaleValidator;
interface PluralGroup {
  base: string;
  isPlural: boolean;
  keys: string[];
}

const groupPluralKeys = localeMod.groupPluralKeys as (
  keys: string[]
) => PluralGroup[];

const SourceScanner = require('../../scripts/i18n-audit/sourceScanner.cjs');
const collectFindings = SourceScanner.collectFindings as (
  rootDir: string,
  sourceRoots: string[]
) => ScanResult;

const coreMod = require('../../scripts/i18n-audit/core.cjs');
const runAudit = coreMod.runAudit as (options?: AuditOptions) => AuditResult;

interface AuditError {
  rule: string;
  locale?: string;
  key?: string;
  form?: string;
  file?: string;
  line?: number;
  message?: string;
  sourcePlaceholders?: string[];
  translatedPlaceholders?: string[];
  context?: Record<string, unknown>;
}

interface AuditFinding {
  file: string;
  line: number;
  kind: string;
  value: string;
  context: Record<string, unknown>;
}

interface AuditReport {
  localeStructuralErrors: AuditError[];
  missingStaticKeys: AuditError[];
  placeholderErrors: AuditError[];
  pluralErrors: AuditError[];
  missingFallbackFindings: AuditError[];
  dynamicI18nFindings: AuditError[];
  hardcodedUiFindings: AuditFinding[];
  unsafeNumberFormatFindings: AuditFinding[];
  unregisteredLocaleFindings: AuditError[];
  summary: Record<string, number>;
  translationCoverage: Record<string, LocaleCoverage>;
}

interface AuditResult {
  hasErrors: boolean;
  report: AuditReport;
}

interface AuditOptions {
  rootDir?: string;
  enLocalePath?: string;
  plLocalePath?: string;
  registryPath?: string;
  sourceRoots?: string[];
}

interface ScanResult {
  findings: AuditFinding[];
  errors: AuditError[];
}

interface LocaleCoverage {
  translated: number;
  total: number;
  missing: number;
  percent: number;
  stale?: number;
}

interface ValidatorResult {
  errors: AuditError[];
  enKeys: string[];
  plKeys: string[];
  coverage: Record<string, LocaleCoverage>;
}

interface LocaleValidatorInstance {
  validate(): ValidatorResult;
}

let enLocalePath = '';
let plLocalePath = '';
let fixtureRoot = '';

function createFixtureStructure(
  structure: Record<string, string>,
  sourceFiles: Record<string, string> = {}
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-audit-test-'));
  const srcDir = path.join(tmpDir, 'src');
  const scriptsDir = path.join(tmpDir, 'scripts');
  const localeDir = path.join(srcDir, 'localization', 'locales');
  const registryDir = path.join(srcDir, 'localization');

  fs.mkdirSync(localeDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  const locales = Object.keys(structure);
  const localeEntries: Record<
    string,
    {
      languageCode: string;
      intlLocale: string;
      displayNameKey: string;
      defaultDisplayName: string;
    }
  > = {};
  for (const locale of locales) {
    const dir = path.join(localeDir, locale);
    fs.mkdirSync(dir, { recursive: true });
    const localePath = path.join(dir, 'translation.json');
    fs.writeFileSync(localePath, structure[locale] || '{}');
    if (locale === 'en') enLocalePath = localePath;
    else if (locale === 'pl') plLocalePath = localePath;
    const intlLocaleMap: Record<string, string> = {
      en: 'en-US',
      pl: 'pl-PL',
      de: 'de-DE',
    };
    localeEntries[locale] = {
      languageCode: locale,
      intlLocale: intlLocaleMap[locale] || locale,
      displayNameKey: `settings.language.${locale}`,
      defaultDisplayName: locale,
    };
  }

  // Write fixture localeRegistry.json so core.cjs can discover locales
  const registry = {
    sourceLocale: 'en',
    fallbackLocale: 'en',
    locales: localeEntries,
  };
  fs.writeFileSync(
    path.join(registryDir, 'localeRegistry.json'),
    JSON.stringify(registry, null, 2)
  );

  for (const [relPath, content] of Object.entries(sourceFiles)) {
    const fullPath = path.join(srcDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  fixtureRoot = tmpDir;

  return tmpDir;
}

function cleanupFixture(): void {
  if (fixtureRoot && fs.existsSync(fixtureRoot)) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

afterEach(() => {
  cleanupFixture();
});

function auditRun(
  tmpDir: string,
  extra: Partial<AuditOptions> = {}
): AuditResult {
  return runAudit({
    rootDir: tmpDir,
    enLocalePath,
    plLocalePath,
    sourceRoots: [path.join(tmpDir, 'src')],
    ...extra,
  });
}

function scan(tmpDir: string): ScanResult {
  return collectFindings(tmpDir, [path.join(tmpDir, 'src')]);
}

function hardcodedValues(findings: AuditFinding[]): string[] {
  return findings
    .filter((f) => f.kind === 'hardcoded-ui-text')
    .map((f) => f.value);
}

describe('LocaleValidator', () => {
  it('1. passes for structurally matching EN/PL locales', () => {
    const tmpDir = createFixtureStructure({
      en: '{"common": {"save": "Save", "close": "Close"}}',
      pl: '{"common": {"save": "Zapisz", "close": "Zamknij"}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
  });

  it('2. allows missing plain key in PL and reports coverage', () => {
    const tmpDir = createFixtureStructure({
      en: '{"common": {"save": "Save", "close": "Close"}}',
      pl: '{"common": {"save": "Zapisz"}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
    expect(result.coverage.pl.missing).toBe(1);
  });

  it('3. reports extra key in PL as non-blocking stale coverage', () => {
    const tmpDir = createFixtureStructure({
      en: '{"common": {"save": "Save"}}',
      pl: '{"common": {"save": "Zapisz", "extra": "Dodatkowy"}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
    expect(result.coverage.pl.stale).toBe(1);
  });

  it('4. fails for malformed JSON', () => {
    const tmpDir = createFixtureStructure({
      en: '{invalid json}',
      pl: '{"common": {"save": "Zapisz"}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors.some((e) => e.rule === 'malformed-json')).toBe(true);
  });

  it('5. fails for type mismatch (string vs non-string)', () => {
    const tmpDir = createFixtureStructure({
      en: '{"common": {"save": "Save"}}',
      pl: '{"common": {"save": 5}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors.some((e) => e.rule === 'type-mismatch')).toBe(true);
  });

  it('6. fails for different array length', () => {
    const tmpDir = createFixtureStructure({
      en: '{"days": {"short": ["Sun", "Mon", "Tue"]}}',
      pl: '{"days": {"short": ["Nie", "Pon"]}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors.some((e) => e.rule === 'array-length-mismatch')).toBe(
      true
    );
  });

  it('7. fails for mismatched placeholders', () => {
    const tmpDir = createFixtureStructure({
      en: '{"msg": "Delete {{name}}?"}',
      pl: '{"msg": "Usunąć {{count}}?"}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors.some((e) => e.rule === 'placeholder-mismatch')).toBe(
      true
    );
  });

  it('8. passes for same placeholders in different order', () => {
    const tmpDir = createFixtureStructure({
      en: '{"msg": "Delete {{name}} and {{count}}?"}',
      pl: '{"msg": "Usunąć {{count}} i {{name}}?"}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
  });

  it('fails for duplicate locale keys (singular colliding with plural group)', () => {
    const tmpDir = createFixtureStructure({
      en: '{"item": "Item", "item_one": "One item", "item_other": "Items"}',
      pl: '{"item": "Przedmiot", "item_one": "Jeden", "item_other": "Przedmioty"}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(
      result.errors.some((e) => e.rule === 'singular-plural-collision')
    ).toBe(true);
  });
});

describe('Pluralization', () => {
  it('9. allows incomplete Polish plural coverage', () => {
    const tmpDir = createFixtureStructure({
      en: '{"count": {"item_one": "item", "item_other": "items"}}',
      pl: '{"count": {"item_one": "przedmiot", "item_few": "przedmioty", "item_other": "przedmiotów"}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
    );

    const result = validator.validate();
    expect(result.errors).toHaveLength(0);
    expect(result.coverage.pl.missing).toBeGreaterThan(0);
  });

  it('10. passes for EN _one/_other and PL _one/_few/_many/_other', () => {
    const tmpDir = createFixtureStructure({
      en: '{"count": {"item_one": "item", "item_other": "items"}}',
      pl: '{"count": {"item_one": "przedmiot", "item_few": "przedmioty", "item_many": "przedmiotów", "item_other": "przedmiotów"}}',
    });

    const validator = new LocaleValidator(
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'en',
        'translation.json'
      ),
      path.join(
        tmpDir,
        'src',
        'localization',
        'locales',
        'pl',
        'translation.json'
      )
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

  it('11. detects existing static key', () => {
    const tmpDir = createFixtureStructure(
      {
        en: '{"common": {"save": "Save"}}',
        pl: '{"common": {"save": "Zapisz"}}',
      },
      { 'test.ts': sourceWithStaticKey }
    );

    const staticKeyFindings = scan(tmpDir).findings.filter(
      (f) => f.kind === 'static-t-key'
    );
    expect(staticKeyFindings.some((f) => f.value === 'common.save')).toBe(true);
  });

  it('12. fails for missing static key in locale', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('nonexistent.key');
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"common": {"save": "Save"}}',
        pl: '{"common": {"save": "Zapisz"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingStaticKeys.some((e) => e.key === 'nonexistent.key')
    ).toBe(true);
  });
});

describe('English fallback detection', () => {
  it('flags user-facing t() without an explicit English fallback', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('common.save');
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"common": {"save": "Save"}}',
        pl: '{"common": {"save": "Zapisz"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingFallbackFindings.some((e) => e.key === 'common.save')
    ).toBe(true);
  });

  it('accepts t() with a positional fallback string', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('common.save', 'Save');
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"common": {"save": "Save"}}',
        pl: '{"common": {"save": "Zapisz"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(false);
    expect(result.report.missingFallbackFindings.length).toBe(0);
  });

  it('accepts t() with a static defaultValue string', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('example.greeting', { name, defaultValue: 'Hello, {{name}}' });
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"example": {"greeting": "Hello, {{name}}"}}',
        pl: '{"example": {"greeting": "Cześć, {{name}}"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(false);
    expect(result.report.missingFallbackFindings.length).toBe(0);
  });

  it('accepts t() with a static defaultValue template literal', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('example.greeting', { defaultValue: \`Hello, {{name}}\` });
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"example": {"greeting": "Hello, {{name}}"}}',
        pl: '{"example": {"greeting": "Cześć, {{name}}"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(false);
    expect(result.report.missingFallbackFindings.length).toBe(0);
  });

  it('flags a static defaultValue that differs from the English catalog', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('example.greeting', { defaultValue: 'Hi, {{name}}' });
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"example": {"greeting": "Hello, {{name}}"}}',
        pl: '{"example": {"greeting": "Cześć, {{name}}"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingFallbackFindings.some(
        (e) => e.key === 'example.greeting'
      )
    ).toBe(true);
  });

  it('rejects a dynamic defaultValue variable', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('example.greeting', { defaultValue: fallbackText });
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"example": {"greeting": "Hello, {{name}}"}}',
        pl: '{"example": {"greeting": "Cześć, {{name}}"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingFallbackFindings.some(
        (e) => e.key === 'example.greeting'
      )
    ).toBe(true);
  });

  it('rejects a dynamic positional fallback variable', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  return t('example.greeting', fallbackText);
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"example": {"greeting": "Hello, {{name}}"}}',
        pl: '{"example": {"greeting": "Cześć, {{name}}"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingFallbackFindings.some(
        (e) => e.key === 'example.greeting'
      )
    ).toBe(true);
  });

  it('flags t() with options that lack defaultValue', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test({ count }) {
  const { t } = useTranslation();
  return t('items', { count });
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingFallbackFindings.some((e) => e.key === 'items')
    ).toBe(true);
  });

  it('allows an explicit suppression with justification for technical lookups', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  // i18n-audit-ignore-next-line missing-fallback -- technical lookup: canonical server key, never rendered
  return t('server.key');
}
`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"server": {"key": "Server key"}}',
        pl: '{"server": {"key": "Klucz serwera"}}',
      },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(false);
    expect(result.report.missingFallbackFindings.length).toBe(0);
  });

  it('rejects a missing-fallback suppression without justification', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test() {
  const { t } = useTranslation();
  // i18n-audit-ignore-next-line missing-fallback
  return t('common.save');
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.localeStructuralErrors.some(
        (e) => e.rule === 'suppression-without-justification'
      )
    ).toBe(true);
  });
});

describe('Dynamic t() key detection', () => {
  it('13. fails for dynamic key from server value', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test({ category }) {
  const { t } = useTranslation();
  return t(category.name);
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source }
    );

    const dynamicFindings = scan(tmpDir).findings.filter(
      (f) => f.kind === 'dynamic-t-key'
    );
    expect(dynamicFindings.length).toBeGreaterThan(0);
    expect(dynamicFindings[0].value).toBe('category.name');
  });

  it('fails the audit for unsafe template-literal translation keys', () => {
    const source = `
import { useTranslation } from 'react-i18next';
export function Test({ name }) {
  const { t } = useTranslation();
  return t(\`common.\${name}\`);
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(result.report.dynamicI18nFindings.length).toBe(1);
  });
});

describe('Hardcoded UI text detection (blocking)', () => {
  it('14. reports new hardcoded text in <Text> without failing the audit', () => {
    const source = `
import React from 'react';
import { Text } from 'react-native';
export function Test() {
  return <Text>Hardcoded English</Text>;
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source }
    );

    const result = auditRun(tmpDir);
    const hardcoded = scan(tmpDir).findings.filter(
      (f) => f.kind === 'hardcoded-ui-text' && f.value === 'Hardcoded English'
    );

    expect(hardcoded.length).toBe(1);
    expect(result.hasErrors).toBe(true);
    expect(result.report.hardcodedUiFindings.length).toBeGreaterThan(0);
  });

  it('inventories JSX expression children (string, single-quote and template forms)', () => {
    const source = `
import React from 'react';
import { Text } from 'react-native';
export function Test() {
  return (
    <>
      <Text>Hardcoded English</Text>
      <Text>{'Hardcoded English'}</Text>
      <Text>{\`Hardcoded English\`}</Text>
    </>
  );
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source }
    );

    const hardcoded = scan(tmpDir).findings.filter(
      (f) => f.kind === 'hardcoded-ui-text' && f.value === 'Hardcoded English'
    );

    expect(hardcoded).toHaveLength(3);
  });

  it('15. detects hardcoded accessibilityLabel', () => {
    const source = `
import React from 'react';
import { View } from 'react-native';
export function Test() {
  return <View accessibilityLabel="Back" />;
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source }
    );

    const hardcoded = scan(tmpDir).findings.filter(
      (f) => f.kind === 'hardcoded-ui-text' && f.value === 'Back'
    );
    expect(hardcoded.length).toBe(1);
  });

  it('16. detects Alert.alert text', () => {
    const source = `
import { Alert } from 'react-native';
export function Test() {
  Alert.alert('Are you sure?', 'This cannot be undone', [{ text: 'Delete', onPress: () => {} }]);
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source }
    );

    const foundValues = hardcodedValues(scan(tmpDir).findings);
    expect(foundValues).toContain('Are you sure?');
    expect(foundValues).toContain('This cannot be undone');
    expect(foundValues).toContain('Delete');
  });

  it('17. detects Toast.show text1', () => {
    const source = `
import Toast from 'react-native-toast-message';
export function Test() {
  Toast.show({ text1: 'Success', text2: 'Saved successfully' });
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source }
    );

    const foundValues = hardcodedValues(scan(tmpDir).findings);
    expect(foundValues).toContain('Success');
    expect(foundValues).toContain('Saved successfully');
  });
});

describe('Custom component UI text detection', () => {
  it('detects literal custom component props and button children', () => {
    const source = `
import React from 'react';
import { View } from 'react-native';
function Footer({ errorMessage }) { return <View>{errorMessage}</View>; }
export function Test() {
  return <Footer errorMessage="Failed to load more" />;
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source }
    );
    const values = hardcodedValues(scan(tmpDir).findings);
    expect(values).toContain('Failed to load more');
  });
});

describe('False positive exclusion', () => {
  it('18. does not flag route names, icon names, or testIDs', () => {
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
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source }
    );

    const hardcoded = hardcodedValues(scan(tmpDir).findings);
    expect(hardcoded).not.toContain('myButton');
    expect(hardcoded).not.toContain('SomeRouteName');
  });
});

describe('Static key resolution', () => {
  it('exact plain key passes', () => {
    const src = `export function F(t){ return t('common.save'); }`;
    const tmpDir = createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(result.report.missingStaticKeys.length).toBe(0);
  });

  it('common.save_as does not satisfy common.save', () => {
    const src = `export function F(t){ return t('common.save'); }`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"common":{"save_as":"Save as"}}',
        pl: '{"common":{"save_as":"Zapisz jako"}}',
      },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(
      result.report.missingStaticKeys.some((e) => e.key === 'common.save')
    ).toBe(true);
  });

  it('valid plural base passes', () => {
    const src = `export function F(t){ return t('measurement', { count }); }`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"measurement_one":"measurement","measurement_other":"measurements"}',
        pl: '{"measurement_one":"pomiar","measurement_few":"pomiary","measurement_many":"pomiarów","measurement_other":"pomiaru"}',
      },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(result.report.missingStaticKeys.length).toBe(0);
  });

  it('flags a count lookup backed only by singular catalog keys', () => {
    const src = `export function F(t, count){ return t('measurement', { count, defaultValue: '{{count}} measurement' }); }`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"measurement":"{{count}} measurement"}',
        pl: '{"measurement":"{{count}} pomiar"}',
      },
      { 'x.ts': src }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.pluralErrors.some(
        (e) => e.key === 'measurement' && e.locale === 'en'
      )
    ).toBe(true);
    expect(
      result.report.pluralErrors.some(
        (e) => e.key === 'measurement' && e.locale === 'en'
      )
    ).toBe(true);
  });

  it('flags a plural fallback that differs from the English _other form', () => {
    const src = `export function F(t, count){ return t('measurement', { count, defaultValue: '{{count}} measure', defaultValue_one: '{{count}} measurement', defaultValue_other: '{{count}} measurements' }); }`;
    const tmpDir = createFixtureStructure(
      {
        en: '{"measurement_one":"{{count}} measurement","measurement_other":"{{count}} measurements"}',
        pl: '{"measurement_one":"{{count}} pomiar","measurement_few":"{{count}} pomiary","measurement_many":"{{count}} pomiarów","measurement_other":"{{count}} pomiarów"}',
      },
      { 'x.ts': src }
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingFallbackFindings.some((e) => e.key === 'measurement')
    ).toBe(true);
  });

  it('static template literal `common.save` is static', () => {
    const src = `export function F(t){ return t(\`common.save\`); }`;
    const tmpDir = createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src }
    );
    const result = scan(tmpDir);
    const staticF = result.findings.filter(
      (f) => f.kind === 'static-t-key' && f.value === 'common.save'
    );
    const dynF = result.findings.filter((f) => f.kind === 'dynamic-t-key');
    expect(staticF.length).toBe(1);
    expect(dynF.length).toBe(0);
  });

  it('dynamic template literal is dynamic', () => {
    const src = `export function F(t){ return t(\`common.\${name}\`); }`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': src }
    );
    const dynF = scan(tmpDir).findings.filter(
      (f) => f.kind === 'dynamic-t-key'
    );
    expect(dynF.length).toBe(1);
  });

  it('t((\"common.save\" as const)) is static', () => {
    const src = `export function F(t){ return t(('common.save' as const)); }`;
    const tmpDir = createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(result.report.dynamicI18nFindings.length).toBe(0);
    expect(result.report.missingStaticKeys.length).toBe(0);
  });
});

describe('Per-rule suppression', () => {
  it('hardcoded suppression works', () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- Protocol label
return <Text>Protocol Value</Text>;`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': src }
    );
    const findings = scan(tmpDir).findings;
    expect(findings.filter((f) => f.value === 'Protocol Value').length).toBe(0);
  });

  it('dynamic suppression works', () => {
    const src = `// i18n-audit-ignore-next-line dynamic-i18n-key -- server key
return t(variable);`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(result.report.dynamicI18nFindings.length).toBe(0);
  });

  it('wrong rule does not suppress finding', () => {
    // hardcoded suppression should not hide a dynamic t()
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
const a = t(variable);`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(result.report.dynamicI18nFindings.length).toBe(1);
  });

  it('missing justification is an error', () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text
return <Text>No justification</Text>;`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.tsx': src }
    );
    const result = auditRun(tmpDir);
    expect(
      result.report.localeStructuralErrors.some(
        (e) => e.rule === 'suppression-without-justification'
      )
    ).toBe(true);
  });

  it('unknown rule is an error', () => {
    const src = `// i18n-audit-ignore-next-line bogus-rule -- reason
const a = 1;`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(
      result.report.localeStructuralErrors.some(
        (e) => e.rule === 'unknown-suppression-rule'
      )
    ).toBe(true);
  });

  it('suppression does not hide a missing static key', () => {
    const src = `// i18n-audit-ignore-next-line hardcoded-ui-text -- reason
return t('missing.key');`;
    const tmpDir = createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src }
    );
    const result = auditRun(tmpDir);
    expect(
      result.report.missingStaticKeys.some((e) => e.key === 'missing.key')
    ).toBe(true);
  });
});

describe('Alert and Toast dedup', () => {
  it('Alert produces exactly title/message/button', () => {
    const src = `import { Alert } from 'react-native';
Alert.alert('Title', 'Message', [{ text: 'Delete', onPress() {} }]);`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': src }
    );
    const alertF = scan(tmpDir).findings.filter(
      (f) => f.kind === 'hardcoded-ui-text'
    );
    expect(alertF).toHaveLength(3);
    const values = alertF.map((f) => f.value);
    expect(values).toContain('Title');
    expect(values).toContain('Message');
    expect(values).toContain('Delete');
    const deleteF = alertF.find((f) => f.value === 'Delete');
    expect(deleteF?.context.context).toBe('Alert.alert:button');
  });

  it('second Alert button is its own single finding', () => {
    const src = `import { Alert } from 'react-native';
Alert.alert('Title', 'Message', [{ text: 'Delete', onPress() {} }, { text: 'Cancel', onPress() {} }]);`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': src }
    );
    const findings = scan(tmpDir).findings;
    const deleteF = findings.filter(
      (f) => f.kind === 'hardcoded-ui-text' && f.value === 'Delete'
    );
    const cancelF = findings.filter(
      (f) => f.kind === 'hardcoded-ui-text' && f.value === 'Cancel'
    );
    expect(deleteF).toHaveLength(1);
    expect(cancelF).toHaveLength(1);
  });

  it('Toast produces exactly text1/text2', () => {
    const src = `import Toast from 'react-native-toast-message';
Toast.show({ text1: 'Success', text2: 'Saved' });`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'x.ts': src }
    );
    const toastF = scan(tmpDir).findings.filter(
      (f) => f.kind === 'hardcoded-ui-text'
    );
    expect(toastF).toHaveLength(2);
    const success = toastF.find((f) => f.value === 'Success');
    expect(success?.context.context).toBe('Toast.show');
    expect(success?.context.prop).toBe('text1');
  });
});

describe('Scan failure fail-closed behavior', () => {
  it('records a blocking source-scan-error when a source file cannot be read', () => {
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'ok.ts': 'export const ok = 1;' }
    );

    // A broken symlink with a source extension: readFileSync throws, and the
    // audit must fail closed instead of silently passing with partial coverage.
    fs.symlinkSync(
      path.join(tmpDir, 'does-not-exist-target'),
      path.join(tmpDir, 'src', 'broken.ts')
    );

    const result = auditRun(tmpDir);

    expect(result.hasErrors).toBe(true);
    const scanError = result.report.localeStructuralErrors.find(
      (e) => e.rule === 'source-scan-error'
    );
    expect(scanError).toBeDefined();
    expect(scanError?.file).toBe('src/broken.ts');
  });
});

describe('Custom root audit semantics', () => {
  it('derives source roots from the actual rootDir when none are supplied', () => {
    const src = `export function F(t){ return t('missing.in.custom.root'); }`;
    const tmpDir = createFixtureStructure(
      { en: '{"common":{"save":"Save"}}', pl: '{"common":{"save":"Zapisz"}}' },
      { 'x.ts': src }
    );

    // No sourceRoots passed: the audit must scan <rootDir>/src on its own.
    const result = runAudit({
      rootDir: tmpDir,
      enLocalePath,
      plLocalePath,
    });

    expect(
      result.report.missingStaticKeys.some(
        (e) => e.key === 'missing.in.custom.root'
      )
    ).toBe(true);
  });
});

describe('groupPluralKeys', () => {
  it('returns both plural group and plain single for the same base', () => {
    const result = groupPluralKeys(['item_one', 'item_other', 'item']);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ base: 'item', isPlural: true }),
        expect.objectContaining({
          base: 'item',
          isPlural: false,
          keys: ['item'],
        }),
      ])
    );
  });
});

describe('Hardened presentation literal extraction', () => {
  it('collects conditional, logical, nested, and asserted presentation literals', () => {
    const source = `
import React from 'react';
import { Text } from 'react-native';
export function Test({ condition, bar, userLabel, userTitle, userValue }) {
  return <>
    <Text>{condition ? 'First branch' : 'Second branch'}</Text>
    <Text>{condition && 'Visible message'}</Text>
    <Text>{(condition ? 'Condition-only A' : 'Condition-only B') && 'Visible RHS'}</Text>
    <Text>{condition ? (bar || 'Fallback A') : (userValue ? 'Fallback B' : 'Fallback C')}</Text>
    <Text>{('Asserted text' as const)}</Text>
    <Text>{('Typed text' as string)}</Text>
    <Text>{('Satisfied text' satisfies string)}</Text>
    <Text>{userLabel || 'Fallback label'}</Text>
    <Text>{userTitle ?? 'Fallback title'}</Text>
  </>;
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source }
    );
    const values = hardcodedValues(scan(tmpDir).findings);
    expect(values).toEqual(
      expect.arrayContaining([
        'First branch',
        'Second branch',
        'Visible message',
        'Fallback A',
        'Fallback B',
        'Fallback C',
        'Asserted text',
        'Typed text',
        'Satisfied text',
        'Fallback label',
        'Fallback title',
        'Visible RHS',
      ])
    );
    expect(values).not.toContain('condition');
    expect(values).not.toContain('Condition-only A');
    expect(values).not.toContain('Condition-only B');
  });

  it('reaches a real TypeAssertionExpression in a .ts presentation context', () => {
    const source = `
import { Alert } from 'react-native';
Alert.alert(<string>'Type asserted text');
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'type-assertion.ts': source }
    );
    expect(hardcodedValues(scan(tmpDir).findings)).toContain(
      'Type asserted text'
    );
  });

  it('detects Unicode UI letters but not arbitrary Unicode strings', () => {
    const source = `
import { Text } from 'react-native';
const canonical = '内部';
export function Test() {
  return <>
    <Text>{'Żółć'}</Text>
    <Text>{'保存'}</Text>
  </>;
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'unicode.tsx': source }
    );
    const values = hardcodedValues(scan(tmpDir).findings);
    expect(values).toContain('Żółć');
    expect(values).toContain('保存');
    expect(values).not.toContain('内部');
  });

  it('preserves punctuation-only dynamic template filtering', () => {
    const source = [
      "import { Text } from 'react-native';",
      'export function Test({ value }) {',
      '  return <Text>{`${value} ·`}</Text>;',
      '}',
    ].join('\\n');
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'dynamic.tsx': source }
    );
    expect(hardcodedValues(scan(tmpDir).findings)).not.toContain(' ·');
  });

  it('collects conditional Alert and Toast presentation values without scanning conditions', () => {
    const source = `
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
Alert.alert(condition ? 'Title A' : 'Title B', userMessage ?? 'Message fallback', [
  { text: condition && 'Button text', onPress() {} },
]);
Toast.show({ text1: ready ? 'Toast A' : 'Toast B', text2: value || 'Toast fallback' });
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.ts': source }
    );
    const values = hardcodedValues(scan(tmpDir).findings);
    expect(values).toEqual(
      expect.arrayContaining([
        'Title A',
        'Title B',
        'Message fallback',
        'Button text',
        'Toast A',
        'Toast B',
        'Toast fallback',
      ])
    );
    expect(values).not.toContain('condition');
    expect(values).not.toContain('ready');
  });

  it('does not inspect arbitrary expressions or condition comparisons', () => {
    const source = `
const payload = { label: 'Not UI' };
const value = mode === 'DELETE' ? 'Not UI either' : 'Still not UI';
const canonical = 'GET';
export function Test({ condition }) {
  return condition ? <View /> : <Text t={value} />;
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      { 'test.tsx': source }
    );
    const values = hardcodedValues(scan(tmpDir).findings);
    expect(values).not.toEqual(
      expect.arrayContaining([
        'Not UI',
        'Not UI either',
        'Still not UI',
        'DELETE',
        'GET',
      ])
    );
  });

  it('keeps t() results out of hardcoded findings and preserves one-finding suppression', () => {
    const suppressedSource = `
import { Text } from 'react-native';
import { t } from 'i18next';
export function Translated() {
  return <Text>{t('first', { defaultValue: 'Translated value' })}</Text>;
}
`;
    const translatedDir = createFixtureStructure(
      { en: '{"first":"First"}', pl: '{"first":"Pierwszy"}' },
      {
        'translated.tsx': suppressedSource,
      }
    );
    expect(hardcodedValues(scan(translatedDir).findings)).not.toContain(
      'Translated value'
    );

    const suppressedSourceWithDirective = `
import { Text } from 'react-native';
export function Test({ condition }) {
  // i18n-audit-ignore-next-line hardcoded-ui-text -- one candidate only
  return <Text>{condition ? 'First suppressed' : 'Second unsuppressed'}</Text>;
}
`;
    const tmpDir = createFixtureStructure(
      { en: '{"first":"First"}', pl: '{"first":"Pierwszy"}' },
      {
        'test.tsx': suppressedSourceWithDirective,
      }
    );
    const findings = scan(tmpDir).findings.filter(
      (f) => f.kind === 'hardcoded-ui-text'
    );
    expect(
      findings.filter((f) => f.value === 'Second unsuppressed')
    ).toHaveLength(1);
    expect(findings.filter((f) => f.value === 'First suppressed')).toHaveLength(
      0
    );
  });
});

describe('Multilingual source-first regressions', () => {
  it('discovers sibling locale directories from the locale root', () => {
    const tmpDir = createFixtureStructure({
      en: '{"dashboard": {"weeklyProgress": "Weekly progress"}}',
      pl: '{"dashboard": {}}',
      de: '{"dashboard": {"weeklyProgress": "Wöchentlicher Fortschritt"}}',
    });
    const result = auditRun(tmpDir);
    expect(result.hasErrors).toBe(false);
    expect(result.report.translationCoverage.pl).toMatchObject({ missing: 1 });
    expect(result.report.translationCoverage.de).toMatchObject({
      missing: 0,
      translated: 1,
      total: 1,
    });
  });

  it('fails when a statically used source key is absent from English', () => {
    const tmpDir = createFixtureStructure(
      { en: '{"common": {"save": "Save"}}', pl: '{}' },
      {
        'missing.ts':
          "export const label = t('missing.source', 'Missing source');",
      }
    );
    const result = auditRun(tmpDir);
    expect(result.hasErrors).toBe(true);
    expect(
      result.report.missingStaticKeys.some(
        (item) => item.key === 'missing.source' && item.locale === 'en'
      )
    ).toBe(true);
  });

  it('fails source plural placeholder drift', () => {
    const tmpDir = createFixtureStructure({
      en: '{"item_one": "{{count}} item", "item_other": "{{total}} items"}',
      pl: '{}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json')
    );
    expect(
      validator
        .validate()
        .errors.some(
          (item) => item.rule === 'placeholder-mismatch' && item.locale === 'en'
        )
    ).toBe(true);
  });

  it('fails target plural placeholder drift against the source family', () => {
    const tmpDir = createFixtureStructure({
      en: '{"item_one": "{{count}} item", "item_other": "{{count}} items"}',
      pl: '{"item_one": "{{count}} przedmiot", "item_few": "{{total}} przedmioty", "item_many": "{{count}} przedmiotów", "item_other": "{{count}} przedmiotów"}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json')
    );
    expect(
      validator
        .validate()
        .errors.some(
          (item) => item.rule === 'placeholder-mismatch' && item.locale === 'pl'
        )
    ).toBe(true);
  });

  it('rejects an unsupported English _few and _many compatibility pair', () => {
    const tmpDir = createFixtureStructure({
      en: '{"item_one":"item", "item_other":"items", "item_few":"items", "item_many":"items"}',
      pl: '{}',
    });
    const validator = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json')
    );
    expect(
      validator
        .validate()
        .errors.filter(
          (item) =>
            item.rule === 'invalid-plural-category' && item.locale === 'en'
        )
    ).toHaveLength(2);
  });

  it('allows empty target values as missing non-blocking coverage', () => {
    const tmpDir = createFixtureStructure({
      en: '{"greeting":"Hello {{name}}"}',
      pl: '{"greeting":""}',
    });
    const result = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json')
    ).validate();
    expect(result.errors).toHaveLength(0);
    expect(result.coverage.pl.missing).toBe(1);
  });

  it('still blocks non-empty target placeholder corruption', () => {
    const tmpDir = createFixtureStructure({
      en: '{"greeting":"Hello {{name}}"}',
      pl: '{"greeting":"Witaj {{wrong}}"}',
    });
    const result = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json')
    ).validate();
    expect(
      result.errors.some((item) => item.rule === 'placeholder-mismatch')
    ).toBe(true);
  });

  it('derives German target coverage independently from the English source', () => {
    const deForms = new Intl.PluralRules('de-DE')
      .resolvedOptions()
      .pluralCategories.map((category) => `_${category}`);
    const tmpDir = createFixtureStructure({
      en: JSON.stringify({
        item_one: '{{count}} item',
        item_other: '{{count}} items',
      }),
      pl: '{}',
    });
    const dePath = path.join(
      tmpDir,
      'src/localization/locales/de',
      'translation.json'
    );
    fs.mkdirSync(path.dirname(dePath), { recursive: true });
    fs.writeFileSync(
      dePath,
      JSON.stringify(
        Object.fromEntries(
          deForms.map((form) => [`item${form}`, '{{count}} German item'])
        )
      )
    );

    const result = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json'),
      { localePaths: [{ locale: 'de', path: dePath, intlLocale: 'de-DE' }] }
    ).validate();

    expect(result.errors.filter((error) => error.locale === 'de')).toHaveLength(
      0
    );
    expect(result.coverage.de).toMatchObject({
      total: deForms.length,
      translated: deForms.length,
      missing: 0,
    });
  });

  it('derives Arabic target coverage independently from the English source', () => {
    const arForms = new Intl.PluralRules('ar')
      .resolvedOptions()
      .pluralCategories.map((category) => `_${category}`);
    const tmpDir = createFixtureStructure({
      en: JSON.stringify({
        item_one: '{{count}} item',
        item_other: '{{count}} items',
      }),
      pl: '{}',
    });
    const arPath = path.join(
      tmpDir,
      'src/localization/locales/ar',
      'translation.json'
    );
    fs.mkdirSync(path.dirname(arPath), { recursive: true });
    fs.writeFileSync(
      arPath,
      JSON.stringify(
        Object.fromEntries(
          arForms.map((form) => [`item${form}`, '{{count}} Arabic fixture'])
        )
      )
    );

    const result = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json'),
      { localePaths: [{ locale: 'ar', path: arPath, intlLocale: 'ar' }] }
    ).validate();

    expect(result.errors.filter((error) => error.locale === 'ar')).toHaveLength(
      0
    );
    expect(result.coverage.ar).toMatchObject({
      total: arForms.length,
      translated: arForms.length,
      missing: 0,
    });
  });

  it('blocks unsafe localized JSX and object presentation properties', () => {
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      {
        'unsafe.tsx': `export const View = () => <Metric label={value.toFixed(1)} subtitle={value.toLocaleString('en-US')} />; const config = { label: value.toFixed(1) };`,
      }
    );
    const findings = scan(tmpDir).findings.filter(
      (finding) => finding.kind === 'locale-unsafe-number-format'
    );
    expect(findings.length).toBeGreaterThanOrEqual(3);
  });

  it('allows the shared localized formatter in presentation properties', () => {
    const tmpDir = createFixtureStructure(
      { en: '{}', pl: '{}' },
      {
        'safe.tsx': `export const View = () => <Metric label={formatLocalizedNumber(value)} />;`,
      }
    );
    expect(
      scan(tmpDir).findings.filter(
        (finding) => finding.kind === 'locale-unsafe-number-format'
      )
    ).toHaveLength(0);
  });

  it('supports synthetic region variants without collapsing them', () => {
    const registry = {
      'pt-BR': {
        languageCode: 'pt',
        intlLocale: 'pt-BR',
        displayNameKey: 'x',
        defaultDisplayName: 'Português (Brasil)',
      },
      'pt-PT': {
        languageCode: 'pt',
        intlLocale: 'pt-PT',
        displayNameKey: 'x',
        defaultDisplayName: 'Português (Portugal)',
      },
    };
    const {
      normalizeLocaleFromRegistry,
    } = require('../../src/localization/localeRegistry');
    expect(normalizeLocaleFromRegistry('pt-BR-x-private', registry)).toBe(
      'pt-BR'
    );
    expect(normalizeLocaleFromRegistry('pt-PT-x-private', registry)).toBe(
      'pt-PT'
    );
  });

  it('reports stale target plural family when source has removed the plural base', () => {
    const tmpDir = createFixtureStructure({
      en: JSON.stringify({ greeting: 'Hello' }),
      pl: JSON.stringify({
        greeting: 'Czesc',
        item_one: '{{count}} przedmiot',
        item_other: '{{count}} przedmiotow',
      }),
    });
    const result = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json')
    ).validate();
    expect(result.errors).toHaveLength(0);
    expect(result.coverage.pl.stale).toBeGreaterThanOrEqual(2);
  });

  it('placeholder errors include locale, sourcePlaceholders, and translatedPlaceholders fields', () => {
    const tmpDir = createFixtureStructure({
      en: JSON.stringify({ greeting: 'Hello {{name}}' }),
      pl: JSON.stringify({ greeting: 'Witaj {{wrong}}' }),
    });
    const result = new LocaleValidator(
      path.join(tmpDir, 'src/localization/locales/en/translation.json'),
      path.join(tmpDir, 'src/localization/locales/pl/translation.json')
    ).validate();
    const mismatch = result.errors.find(
      (e) => e.rule === 'placeholder-mismatch'
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.locale).toBe('pl');
    expect(mismatch?.sourcePlaceholders).toEqual(['name']);
    expect(mismatch?.translatedPlaceholders).toEqual(['wrong']);
  });

  it('handles missing locale root gracefully without crashing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-audit-noroot-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'empty.ts'),
      'export const x = 1;'
    );
    const result = auditRun(tmpDir, {
      enLocalePath: path.join(tmpDir, 'nonexistent', 'en', 'translation.json'),
    });
    expect(result.hasErrors).toBe(true);
  });
});

describe('unregistered locale catalogs', () => {
  const BROKEN = JSON.stringify({ greeting: 'Hola {{wrong}}' });
  const SOURCE = JSON.stringify({ greeting: 'Hello {{name}}' });

  interface FixtureRegistry {
    locales: Record<string, unknown>;
  }

  /** Leaves the locale directory on disk, only the registry entry goes. */
  function unregister(tmpDir: string, locale: string): void {
    const registryPath = path.join(
      tmpDir,
      'src/localization/localeRegistry.json'
    );
    const registry = JSON.parse(
      fs.readFileSync(registryPath, 'utf8')
    ) as unknown as FixtureRegistry;
    delete registry.locales[locale];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  }

  it('does not block on a placeholder mismatch in a catalog that is not registered', () => {
    const tmpDir = createFixtureStructure({ en: SOURCE, pl: BROKEN });
    unregister(tmpDir, 'pl');

    const { report, hasErrors } = auditRun(tmpDir);

    expect(hasErrors).toBe(false);
    expect(report.placeholderErrors).toHaveLength(0);
    const finding = report.unregisteredLocaleFindings.find(
      (e) => e.rule === 'placeholder-mismatch'
    );
    expect(finding?.locale).toBe('pl');
    expect(report.summary.unregisteredLocaleFindings).toBe(
      report.unregisteredLocaleFindings.length
    );
  });

  it('still blocks on the same defect once the locale is registered', () => {
    const tmpDir = createFixtureStructure({ en: SOURCE, pl: BROKEN });

    const { report, hasErrors } = auditRun(tmpDir);

    expect(hasErrors).toBe(true);
    expect(report.placeholderErrors.map((e) => e.locale)).toContain('pl');
    expect(report.unregisteredLocaleFindings).toHaveLength(0);
  });

  it('reports coverage for an unregistered catalog rather than ignoring it', () => {
    const tmpDir = createFixtureStructure({ en: SOURCE, pl: BROKEN });
    unregister(tmpDir, 'pl');

    const { report } = auditRun(tmpDir);

    expect(Object.keys(report.translationCoverage)).toContain('pl');
  });

  it('does not block on an unregistered directory whose name is not a valid locale tag', () => {
    const tmpDir = createFixtureStructure({ en: SOURCE, pl: SOURCE });
    const strayDir = path.join(tmpDir, 'src/localization/locales/not a locale');
    fs.mkdirSync(strayDir, { recursive: true });
    fs.writeFileSync(path.join(strayDir, 'translation.json'), SOURCE);

    const { report, hasErrors } = auditRun(tmpDir);

    expect(hasErrors).toBe(false);
    expect(report.localeStructuralErrors).toHaveLength(0);
    expect(report.unregisteredLocaleFindings.map((e) => e.rule)).toContain(
      'invalid-locale-tag'
    );
  });
});
