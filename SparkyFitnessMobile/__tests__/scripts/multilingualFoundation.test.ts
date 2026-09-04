/**
 * Multilingual foundation contract tests.
 *
 * These tests prove the registry-driven pipeline is the single source of truth
 * for shipped locales and that adding a new language is a data/translation
 * operation, not a code change across multiple files.
 *
 * The fixture locale `de` (and occasionally `fr`) is used to exercise the
 * pipeline without adding a production language.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(pathToFileURL(__filename));
const androidQualifiers =
  require('../../scripts/androidLocaleQualifiers.cjs') as {
    localeFromAndroidDir: (name: string, source: string) => string | null;
    androidDirForLocale: (locale: string, source: string) => string;
  };

const MOBILE_ROOT = path.resolve(__dirname, '../..');
const generator = path.join(
  MOBILE_ROOT,
  'scripts/generate-locale-resources.mjs'
);
const nativeValidator = path.join(
  MOBILE_ROOT,
  'scripts/validate-native-widget-locales.mjs'
);

// Re-import the registry modules so we can test against the real production
// registry and synthetic fixture registries.
import {
  SHIPPED_LOCALES,
  SUPPORTED_LANGUAGES,
  normalizeLocaleFromRegistry,
} from '../../src/localization/localeRegistry';
import { RESOURCE_MAP } from '../../src/localization/generatedLocaleResources';

function run(script: string, args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface FixtureRegistry {
  sourceLocale: string;
  fallbackLocale: string;
  locales: Record<
    string,
    {
      languageCode: string;
      intlLocale: string;
      displayNameKey: string;
      defaultDisplayName: string;
    }
  >;
}

function createFixtureRoot(registry: FixtureRegistry): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sparky-muf-'));
  fs.mkdirSync(path.join(root, 'src/localization'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/localization/localeRegistry.json'),
    JSON.stringify(registry)
  );
  return root;
}

function writeRuntimeCatalog(
  root: string,
  locale: string,
  content: object
): void {
  const dir = path.join(root, 'src/localization/locales', locale);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'translation.json'), JSON.stringify(content));
}

function writeMetadataFile(
  root: string,
  locale: string,
  content: object
): void {
  fs.mkdirSync(path.join(root, 'locales'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'locales', `${locale}.json`),
    JSON.stringify(content)
  );
}

function writeAndroidWidget(root: string, locale: string, xml: string): void {
  const dir = locale === 'en' ? 'values' : `values-${locale}`;
  fs.mkdirSync(path.join(root, 'targets/android-widget/res', dir), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, 'targets/android-widget/res', dir, 'widget_strings.xml'),
    xml
  );
}

function writeIosWidget(root: string, locale: string, strings: string): void {
  fs.mkdirSync(path.join(root, 'targets/widget', `${locale}.lproj`), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, 'targets/widget', `${locale}.lproj`, 'Localizable.strings'),
    strings
  );
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 1. Picker iterates only over SHIPPED_LOCALES
// ---------------------------------------------------------------------------

describe('language picker excludes unshipped Weblate locales', () => {
  it('SUPPORTED_LANGUAGES contains only shipped locales (en, pl, es) and not unshipped (de, fr)', () => {
    // The production registry ships en + pl + es. Even if Weblate syncs de/fr
    // catalogs, those locales must not appear in the runtime language picker.
    expect(SUPPORTED_LANGUAGES).toContain('en');
    expect(SUPPORTED_LANGUAGES).toContain('pl');
    expect(SUPPORTED_LANGUAGES).toContain('es');
    expect(SUPPORTED_LANGUAGES).not.toContain('de');
    expect(SUPPORTED_LANGUAGES).not.toContain('fr');
  });

  it('RESOURCE_MAP keys match SUPPORTED_LANGUAGES exactly (no unshipped locale sneaks in)', () => {
    expect(Object.keys(RESOURCE_MAP).sort()).toEqual(
      [...SUPPORTED_LANGUAGES].sort()
    );
  });

  it('SHIPPED_LOCALES does not include de or fr', () => {
    expect(Object.keys(SHIPPED_LOCALES)).not.toContain('de');
    expect(Object.keys(SHIPPED_LOCALES)).not.toContain('fr');
  });
});

// ---------------------------------------------------------------------------
// 2. No duplicate hardcoded locale list in key generation/config files
// ---------------------------------------------------------------------------

describe('no duplicate hardcoded shipped locale list', () => {
  const sourceFiles = [
    'src/localization/i18n.ts',
    'app.config.ts',
    'plugins/withAppLanguage.ts',
    'plugins/withCalorieWidget.ts',
  ];

  // Hardcoded locale arrays that bypass the registry: `['en', 'pl']`, `["en", "pl"]`,
  // `'en', 'pl'` in a locale-list context, etc. The key generation files should
  // derive locales from SUPPORTED_LANGUAGES / nativeLanguageTags(), not from a
  // manual list.
  const hardcodedPatterns: RegExp[] = [
    /\[\s*['"]en['"]\s*,\s*['"]pl['"]\s*\]/,
    /\[\s*['"]en['"]\s*,\s*['"]pl['"]\s*,/,
  ];

  it.each(sourceFiles)(
    '%s does not contain a hardcoded [en, pl] locale list',
    (relPath) => {
      const source = fs.readFileSync(path.join(MOBILE_ROOT, relPath), 'utf8');
      for (const pattern of hardcodedPatterns) {
        expect(source).not.toMatch(pattern);
      }
    }
  );

  it('app.config.ts derives locales from nativeLanguageTags()', () => {
    const source = fs.readFileSync(
      path.join(MOBILE_ROOT, 'app.config.ts'),
      'utf8'
    );
    expect(source).toContain('nativeLanguageTags()');
  });

  it('i18n.ts imports RESOURCE_MAP from generated file (not manual per-locale imports)', () => {
    const source = fs.readFileSync(
      path.join(MOBILE_ROOT, 'src/localization/i18n.ts'),
      'utf8'
    );
    expect(source).toContain("from './generatedLocaleResources'");
    // No manual per-locale translation imports.
    expect(source).not.toMatch(
      /import\s+\w+Translation\s+from\s+['"]\.\/locales\/\w+\/translation\.json['"]/
    );
  });

  it('plugin files import SUPPORTED_LANGUAGES from localeRegistry', () => {
    for (const relPath of [
      'plugins/withAppLanguage.ts',
      'plugins/withCalorieWidget.ts',
    ]) {
      const source = fs.readFileSync(path.join(MOBILE_ROOT, relPath), 'utf8');
      expect(source).toContain("from '../src/localization/localeRegistry'");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Generated resource map is deterministic and stale-check works
// ---------------------------------------------------------------------------

describe('generated locale resources determinism', () => {
  it('generator output is stable across runs for the same registry', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'settings.language.english',
          defaultDisplayName: 'English',
        },
        pl: {
          languageCode: 'pl',
          intlLocale: 'pl-PL',
          displayNameKey: 'settings.language.polish',
          defaultDisplayName: 'Polski',
        },
      },
    };
    const root = createFixtureRoot(registry);
    for (const locale of Object.keys(registry.locales)) {
      writeRuntimeCatalog(root, locale, {});
      writeMetadataFile(root, locale, {});
    }
    const output = path.join(
      root,
      'src/localization/generatedLocaleResources.ts'
    );
    run(generator, ['--root', root, '--output', output]);
    const first = fs.readFileSync(output, 'utf8');
    run(generator, ['--root', root, '--output', output]);
    const second = fs.readFileSync(output, 'utf8');
    expect(second).toBe(first);
    // No timestamps or machine-specific paths.
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(first).not.toMatch(/\/tmp\//);
    expect(first).not.toMatch(os.hostname());
    cleanup(root);
  });

  it('--check fails when the generated file is stale (registry changed but generator not run)', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
      },
    };
    const root = createFixtureRoot(registry);
    writeRuntimeCatalog(root, 'en', {});
    writeMetadataFile(root, 'en', {});
    const output = path.join(
      root,
      'src/localization/generatedLocaleResources.ts'
    );
    run(generator, ['--root', root, '--output', output]);
    // Add a new locale to the registry but do NOT regenerate.
    registry.locales.pl = {
      languageCode: 'pl',
      intlLocale: 'pl-PL',
      displayNameKey: 'x',
      defaultDisplayName: 'Polski',
    };
    fs.writeFileSync(
      path.join(root, 'src/localization/localeRegistry.json'),
      JSON.stringify(registry)
    );
    writeRuntimeCatalog(root, 'pl', {});
    writeMetadataFile(root, 'pl', {});
    expect(() =>
      run(generator, ['--root', root, '--output', output, '--check'])
    ).toThrow('stale');
    cleanup(root);
  });
});

// ---------------------------------------------------------------------------
// 4. Shipped-locale completeness contract (metadata file required = blocking)
// ---------------------------------------------------------------------------

describe('shipped locale completeness contract', () => {
  it('fails when a shipped locale is missing its runtime catalog', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
        de: {
          languageCode: 'de',
          intlLocale: 'de-DE',
          displayNameKey: 'x',
          defaultDisplayName: 'Deutsch',
        },
      },
    };
    const root = createFixtureRoot(registry);
    writeRuntimeCatalog(root, 'en', {});
    writeMetadataFile(root, 'en', {});
    writeMetadataFile(root, 'de', {});
    // Missing: src/localization/locales/de/translation.json
    expect(() => run(generator, ['--root', root])).toThrow(
      'Shipped locale "de" is missing src/localization/locales/de/translation.json'
    );
    cleanup(root);
  });

  it('fails when a shipped locale is missing its metadata JSON', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
        de: {
          languageCode: 'de',
          intlLocale: 'de-DE',
          displayNameKey: 'x',
          defaultDisplayName: 'Deutsch',
        },
      },
    };
    const root = createFixtureRoot(registry);
    writeRuntimeCatalog(root, 'en', {});
    writeRuntimeCatalog(root, 'de', {});
    writeMetadataFile(root, 'en', {});
    // Missing: locales/de.json
    expect(() => run(generator, ['--root', root])).toThrow(
      'Shipped locale "de" is missing locales/de.json'
    );
    cleanup(root);
  });

  it('succeeds when all shipped locale prerequisites exist', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
        de: {
          languageCode: 'de',
          intlLocale: 'de-DE',
          displayNameKey: 'x',
          defaultDisplayName: 'Deutsch',
        },
      },
    };
    const root = createFixtureRoot(registry);
    for (const locale of Object.keys(registry.locales)) {
      writeRuntimeCatalog(root, locale, {});
      writeMetadataFile(root, locale, {});
    }
    expect(() => run(generator, ['--root', root])).not.toThrow();
    cleanup(root);
  });
});

// ---------------------------------------------------------------------------
// 5. Device/system language matching with shipped DE
// ---------------------------------------------------------------------------

describe('device language matching with a shipped DE fixture', () => {
  const fixtureRegistry = {
    en: {
      languageCode: 'en',
      intlLocale: 'en-US',
      displayNameKey: 'x',
      defaultDisplayName: 'English',
    },
    pl: {
      languageCode: 'pl',
      intlLocale: 'pl-PL',
      displayNameKey: 'x',
      defaultDisplayName: 'Polski',
    },
    de: {
      languageCode: 'de',
      intlLocale: 'de-DE',
      displayNameKey: 'x',
      defaultDisplayName: 'Deutsch',
    },
  };

  it('maps de to de (language-only tag)', () => {
    expect(normalizeLocaleFromRegistry('de', fixtureRegistry)).toBe('de');
  });

  it('maps de-DE to de (exact intlLocale match)', () => {
    expect(normalizeLocaleFromRegistry('de-DE', fixtureRegistry)).toBe('de');
  });

  it('maps de-AT to de (regional extension of the same language)', () => {
    // de-AT is not registered, but it starts with de- so it resolves to de
    // via the prefix fallback (de is the longest matching prefix).
    expect(normalizeLocaleFromRegistry('de-AT', fixtureRegistry)).toBe('de');
  });

  it('maps unsupported fr-FR to null (fallback to EN at runtime)', () => {
    expect(normalizeLocaleFromRegistry('fr-FR', fixtureRegistry)).toBeNull();
  });

  it('maps unsupported fr to null', () => {
    expect(normalizeLocaleFromRegistry('fr', fixtureRegistry)).toBeNull();
  });

  it('does not ambiguously resolve a language-only tag when multiple regional locales exist', () => {
    const synthetic = {
      'pt-BR': {
        languageCode: 'pt',
        intlLocale: 'pt-BR',
        displayNameKey: 'x',
        defaultDisplayName: 'Brasil',
      },
      'pt-PT': {
        languageCode: 'pt',
        intlLocale: 'pt-PT',
        displayNameKey: 'x',
        defaultDisplayName: 'Portugal',
      },
    };
    expect(normalizeLocaleFromRegistry('pt', synthetic)).toBeNull();
    expect(normalizeLocaleFromRegistry('pt-BR', synthetic)).toBe('pt-BR');
  });
});

// ---------------------------------------------------------------------------
// 6. Multi-surface incomplete DE integration (RN 50%, Android 40%, iOS 30%)
// ---------------------------------------------------------------------------

describe('Weblate-incomplete multi-surface DE integration', () => {
  it('passes validation with partial DE on all surfaces and reports coverage', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
        pl: {
          languageCode: 'pl',
          intlLocale: 'pl-PL',
          displayNameKey: 'x',
          defaultDisplayName: 'Polski',
        },
        de: {
          languageCode: 'de',
          intlLocale: 'de-DE',
          displayNameKey: 'x',
          defaultDisplayName: 'Deutsch',
        },
      },
    };
    const root = createFixtureRoot(registry);
    for (const locale of Object.keys(registry.locales)) {
      writeRuntimeCatalog(root, locale, {});
      writeMetadataFile(root, locale, {});
    }

    // Source (en): 2 keys
    writeAndroidWidget(
      root,
      'en',
      '<resources><string name="title">Hello %1$s</string><string name="detail">Detail</string></resources>'
    );
    writeIosWidget(root, 'en', '"title" = "Hello %@";\n"detail" = "Detail";');
    // PL: complete (2/2)
    writeAndroidWidget(
      root,
      'pl',
      '<resources><string name="title">Cześć %1$s</string><string name="detail">Szczegół</string></resources>'
    );
    writeIosWidget(root, 'pl', '"title" = "Cześć %@";\n"detail" = "Szczegół";');
    // DE: partial — 1 of 2 keys (50% Android, 50% iOS)
    writeAndroidWidget(
      root,
      'de',
      '<resources><string name="title">Hallo %1$s</string></resources>'
    );
    writeIosWidget(root, 'de', '"title" = "Hallo %@";');

    const output = run(nativeValidator, ['--root', root]);
    // Validation passes (no structural errors).
    expect(output).toContain('de: 1/2 (1 missing)');

    // Now add a broken placeholder to verify it still blocks.
    fs.writeFileSync(
      path.join(
        root,
        'targets/android-widget/res/values-de/widget_strings.xml'
      ),
      '<resources><string name="title">Hallo %1$d</string></resources>'
    );
    expect(() => run(nativeValidator, ['--root', root])).toThrow(
      'Android widget de:title placeholder mismatch'
    );

    cleanup(root);
  });
});

// ---------------------------------------------------------------------------
// 7. Malformed DE runtime translation (wrong placeholder)
// ---------------------------------------------------------------------------

describe('malformed DE runtime translation blocks CI', () => {
  const validatorModule =
    require('../../scripts/i18n-audit/localeValidator.cjs') as {
      LocaleValidator: new (
        enPath: string,
        plPath: string | null,
        options?: Record<string, unknown>
      ) => {
        validate(): {
          errors: {
            rule: string;
            locale?: string;
            key?: string;
            sourcePlaceholders?: string[];
            translatedPlaceholders?: string[];
          }[];
          coverage: Record<
            string,
            {
              translated: number;
              total: number;
              missing: number;
              percent: number;
            }
          >;
        };
      };
    };

  it('DE with {{username}} instead of {{name}} is a placeholder mismatch', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sparky-malformed-'));
    const enPath = path.join(root, 'en.json');
    const dePath = path.join(root, 'de.json');
    fs.writeFileSync(enPath, JSON.stringify({ greeting: 'Hello {{name}}' }));
    fs.writeFileSync(
      dePath,
      JSON.stringify({ greeting: 'Hallo {{username}}' })
    );
    const result = new validatorModule.LocaleValidator(enPath, null, {
      localePaths: [{ locale: 'de', path: dePath, intlLocale: 'de-DE' }],
    }).validate();
    expect(
      result.errors.some(
        (e) => e.rule === 'placeholder-mismatch' && e.locale === 'de'
      )
    ).toBe(true);
    expect(
      result.errors.some((e) => e.sourcePlaceholders?.includes('name'))
    ).toBe(true);
    expect(
      result.errors.some((e) => e.translatedPlaceholders?.includes('username'))
    ).toBe(true);
    cleanup(root);
  });

  it('DE missing key (greeting absent) passes with coverage missing, not error', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sparky-missing-key-'));
    const enPath = path.join(root, 'en.json');
    const dePath = path.join(root, 'de.json');
    fs.writeFileSync(
      enPath,
      JSON.stringify({ greeting: 'Hello {{name}}', farewell: 'Bye {{name}}' })
    );
    fs.writeFileSync(dePath, JSON.stringify({ farewell: 'Tschüss {{name}}' }));
    const result = new validatorModule.LocaleValidator(enPath, null, {
      localePaths: [{ locale: 'de', path: dePath, intlLocale: 'de-DE' }],
    }).validate();
    expect(result.errors.filter((e) => e.locale === 'de')).toHaveLength(0);
    expect(result.coverage.de.missing).toBe(1);
    expect(result.coverage.de.translated).toBe(1);
    cleanup(root);
  });
});

// ---------------------------------------------------------------------------
// 7b. Malformed native widget placeholders block CI
// ---------------------------------------------------------------------------

describe('malformed native widget placeholders block CI', () => {
  it('Android DE with %1$d instead of source %1$s is a placeholder mismatch', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
        de: {
          languageCode: 'de',
          intlLocale: 'de-DE',
          displayNameKey: 'x',
          defaultDisplayName: 'Deutsch',
        },
      },
    };
    const root = createFixtureRoot(registry);
    for (const locale of Object.keys(registry.locales)) {
      writeRuntimeCatalog(root, locale, {});
      writeMetadataFile(root, locale, {});
    }
    writeAndroidWidget(
      root,
      'en',
      '<resources><string name="title">Hello %1$s</string></resources>'
    );
    writeIosWidget(root, 'en', '"title" = "Hello %@";');
    writeAndroidWidget(
      root,
      'de',
      '<resources><string name="title">Hallo %1$d</string></resources>'
    );
    writeIosWidget(root, 'de', '"title" = "Hallo %@";');
    expect(() => run(nativeValidator, ['--root', root])).toThrow(
      'Android widget de:title placeholder mismatch'
    );
    cleanup(root);
  });

  it('iOS DE with %lld instead of source %@ is a placeholder mismatch', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
        de: {
          languageCode: 'de',
          intlLocale: 'de-DE',
          displayNameKey: 'x',
          defaultDisplayName: 'Deutsch',
        },
      },
    };
    const root = createFixtureRoot(registry);
    for (const locale of Object.keys(registry.locales)) {
      writeRuntimeCatalog(root, locale, {});
      writeMetadataFile(root, locale, {});
    }
    writeAndroidWidget(
      root,
      'en',
      '<resources><string name="title">Hello %1$s</string></resources>'
    );
    writeIosWidget(root, 'en', '"title" = "Hello %@";');
    writeAndroidWidget(
      root,
      'de',
      '<resources><string name="title">Hallo %1$s</string></resources>'
    );
    writeIosWidget(root, 'de', '"title" = "Hallo %lld";');
    expect(() => run(nativeValidator, ['--root', root])).toThrow(
      'iOS widget de:title placeholder mismatch'
    );
    cleanup(root);
  });
});

// ---------------------------------------------------------------------------
// 7c. Target 20% coverage does NOT fail validation
// ---------------------------------------------------------------------------

describe('target 20% coverage does NOT fail validation', () => {
  it('DE with 20% runtime coverage passes (5 keys, 1 translated)', () => {
    const validatorModule =
      require('../../scripts/i18n-audit/localeValidator.cjs') as {
        LocaleValidator: new (
          enPath: string,
          plPath: string | null,
          options?: Record<string, unknown>
        ) => {
          validate(): {
            errors: { locale?: string }[];
            coverage: Record<
              string,
              {
                translated: number;
                total: number;
                missing: number;
                percent: number;
              }
            >;
          };
        };
      };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sparky-20pct-'));
    const enPath = path.join(root, 'en.json');
    const dePath = path.join(root, 'de.json');
    const enKeys: Record<string, string> = {};
    for (let i = 0; i < 5; i++) enKeys[`key${i}`] = `Value ${i}`;
    fs.writeFileSync(enPath, JSON.stringify(enKeys));
    // Only 1 of 5 keys translated (20%)
    fs.writeFileSync(dePath, JSON.stringify({ key0: 'Wert 0' }));
    const result = new validatorModule.LocaleValidator(enPath, null, {
      localePaths: [{ locale: 'de', path: dePath, intlLocale: 'de-DE' }],
    }).validate();
    expect(result.errors.filter((e) => e.locale === 'de')).toHaveLength(0);
    expect(result.coverage.de.translated).toBe(1);
    expect(result.coverage.de.total).toBe(5);
    expect(result.coverage.de.missing).toBe(4);
    expect(result.coverage.de.percent).toBe(20);
    cleanup(root);
  });
});

// ---------------------------------------------------------------------------
// 8. EN is the only mandatory-100% source locale
// ---------------------------------------------------------------------------

describe('EN is the only mandatory-100% source locale', () => {
  it('EN catalog exists and is non-empty', () => {
    const enPath = path.join(
      MOBILE_ROOT,
      'src/localization/locales/en/translation.json'
    );
    expect(fs.existsSync(enPath)).toBe(true);
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  it('EN metadata file exists', () => {
    expect(fs.existsSync(path.join(MOBILE_ROOT, 'locales/en.json'))).toBe(true);
  });

  it('EN widget resources exist (Android + iOS)', () => {
    expect(
      fs.existsSync(
        path.join(
          MOBILE_ROOT,
          'targets/android-widget/res/values/widget_strings.xml'
        )
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(MOBILE_ROOT, 'targets/widget/en.lproj/Localizable.strings')
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. DE shipped → generated RESOURCE_MAP includes DE
// ---------------------------------------------------------------------------

describe('DE shipped → generated RESOURCE_MAP includes DE', () => {
  it('generator includes DE when shipped in fixture registry', () => {
    const registry: FixtureRegistry = {
      sourceLocale: 'en',
      fallbackLocale: 'en',
      locales: {
        en: {
          languageCode: 'en',
          intlLocale: 'en-US',
          displayNameKey: 'x',
          defaultDisplayName: 'English',
        },
        pl: {
          languageCode: 'pl',
          intlLocale: 'pl-PL',
          displayNameKey: 'x',
          defaultDisplayName: 'Polski',
        },
        de: {
          languageCode: 'de',
          intlLocale: 'de-DE',
          displayNameKey: 'x',
          defaultDisplayName: 'Deutsch',
        },
      },
    };
    const root = createFixtureRoot(registry);
    for (const locale of Object.keys(registry.locales)) {
      writeRuntimeCatalog(root, locale, {});
      writeMetadataFile(root, locale, {});
    }
    const output = path.join(
      root,
      'src/localization/generatedLocaleResources.ts'
    );
    run(generator, ['--root', root, '--output', output]);
    const generated = fs.readFileSync(output, 'utf8');
    expect(generated).toContain("from './locales/de/translation.json'");
    expect(generated).toContain('"de": { translation: locale_deTranslation }');
    cleanup(root);
  });

  it('DE unshipped → production RESOURCE_MAP does NOT include DE', () => {
    expect(Object.keys(RESOURCE_MAP)).not.toContain('de');
  });
});

// ---------------------------------------------------------------------------
// 10. iOS widget .lproj inclusion is discovery-driven
// ---------------------------------------------------------------------------

describe('iOS widget .lproj inclusion is discovery-driven', () => {
  it('all shipped locales have corresponding .lproj directories', () => {
    const widgetRoot = path.join(MOBILE_ROOT, 'targets/widget');
    const lprojDirs = fs
      .readdirSync(widgetRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.endsWith('.lproj'))
      .map((e) => e.name.slice(0, -'.lproj'.length));
    for (const locale of Object.keys(SHIPPED_LOCALES)) {
      expect(lprojDirs).toContain(locale);
    }
  });

  it('adding de.lproj fixture does not require Swift edits (contract is directory-based)', () => {
    // The expo-target.config.js / plugin copies all .lproj directories
    // without enumerating them. Verify the plugin does not hardcode en/pl lproj.
    const pluginSource = fs.readFileSync(
      path.join(MOBILE_ROOT, 'plugins/withCalorieWidget.ts'),
      'utf8'
    );
    expect(pluginSource).not.toMatch(/en\.lproj|pl\.lproj/);
  });
});

// ---------------------------------------------------------------------------
// 11. Android widget values-de can be added without Kotlin edits
// ---------------------------------------------------------------------------

describe('Android widget values-de can be added without Kotlin edits', () => {
  it('plugin copies the entire res tree without hardcoding values-pl', () => {
    const pluginSource = fs.readFileSync(
      path.join(MOBILE_ROOT, 'plugins/withCalorieWidget.ts'),
      'utf8'
    );
    // The plugin copies resSrc → resDest via copyTree, not by enumerating
    // individual values-* directories.
    expect(pluginSource).not.toMatch(/values-pl/);
    expect(pluginSource).not.toMatch(/values-en/);
  });

  it('Android qualifier mapping: language-only is values-<locale>, a region is -rXX and a script is b+', () => {
    const { localeFromAndroidDir, androidDirForLocale } = androidQualifiers;

    expect(androidDirForLocale('en', 'en')).toBe('values');
    expect(androidDirForLocale('de', 'en')).toBe('values-de');
    expect(androidDirForLocale('pt-BR', 'en')).toBe('values-pt-rBR');
    expect(androidDirForLocale('yue-Hant', 'en')).toBe('values-b+yue+Hant');
    // Android keeps legacy codes for a few languages, and Weblate writes them.
    expect(androidDirForLocale('id', 'en')).toBe('values-in');
    expect(androidDirForLocale('zh-Hans', 'en')).toBe('values-zh-rCN');

    expect(localeFromAndroidDir('values', 'en')).toBe('en');
    expect(localeFromAndroidDir('values-pt-rBR', 'en')).toBe('pt-BR');
    expect(localeFromAndroidDir('values-b+yue+Hant', 'en')).toBe('yue-Hant');
    expect(localeFromAndroidDir('values-in', 'en')).toBe('id');
    expect(localeFromAndroidDir('drawable', 'en')).toBeNull();
  });
});
