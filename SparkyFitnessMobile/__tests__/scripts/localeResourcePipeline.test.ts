import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const MOBILE_ROOT = path.resolve(__dirname, '../..');
const generator = path.join(
  MOBILE_ROOT,
  'scripts/generate-locale-resources.mjs'
);
const nativeValidator = path.join(
  MOBILE_ROOT,
  'scripts/validate-native-widget-locales.mjs'
);

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sparky-locales-'));
  const registry = {
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
      de: {
        languageCode: 'de',
        intlLocale: 'de-DE',
        displayNameKey: 'settings.language.german',
        defaultDisplayName: 'Deutsch',
      },
    },
  };
  fs.mkdirSync(path.join(root, 'src/localization'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/localization/localeRegistry.json'),
    JSON.stringify(registry)
  );
  for (const locale of Object.keys(registry.locales)) {
    const catalogDir = path.join(root, 'src/localization/locales', locale);
    fs.mkdirSync(catalogDir, { recursive: true });
    fs.writeFileSync(path.join(catalogDir, 'translation.json'), '{}');
    fs.mkdirSync(path.join(root, 'locales'), { recursive: true });
    fs.writeFileSync(path.join(root, 'locales', `${locale}.json`), '{}');
  }
  return root;
}
function writeNative(
  root: string,
  locale: string,
  android: string,
  ios: string
): void {
  const androidDir = locale === 'en' ? 'values' : `values-${locale}`;
  fs.mkdirSync(path.join(root, 'targets/android-widget/res', androidDir), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(
      root,
      'targets/android-widget/res',
      androidDir,
      'widget_strings.xml'
    ),
    android
  );
  fs.mkdirSync(path.join(root, 'targets/widget', `${locale}.lproj`), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, 'targets/widget', `${locale}.lproj`, 'Localizable.strings'),
    ios
  );
}
function run(script: string, args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('registry-driven locale resource pipeline', () => {
  it('generates a DE runtime import solely from the fixture registry and catalog directories', () => {
    const root = fixtureRoot();
    const output = path.join(
      root,
      'src/localization/generatedLocaleResources.ts'
    );
    run(generator, ['--root', root, '--output', output]);
    const generated = fs.readFileSync(output, 'utf8');
    expect(generated).toContain("from './locales/de/translation.json'");
    expect(generated).toContain('"de": { translation: locale_deTranslation }');
    run(generator, ['--root', root, '--output', output, '--check']);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails closed when a shipped locale lacks a runtime or metadata catalog', () => {
    const root = fixtureRoot();
    fs.rmSync(path.join(root, 'locales/de.json'));
    expect(() => run(generator, ['--root', root])).toThrow(
      'Shipped locale "de" is missing locales/de.json'
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('allows partial DE widget resources, reports coverage, and rejects malformed target placeholders', () => {
    const root = fixtureRoot();
    writeNative(
      root,
      'en',
      '<resources><string name="title">Hello %1$s</string><string name="detail">Detail</string></resources>',
      '"title" = "Hello %@";\n"detail" = "Detail";'
    );
    writeNative(
      root,
      'pl',
      '<resources><string name="title">Cześć %1$s</string><string name="detail">Szczegół</string></resources>',
      '"title" = "Cześć %@";\n"detail" = "Szczegół";'
    );
    writeNative(
      root,
      'de',
      '<resources><string name="title">Hallo %1$s</string></resources>',
      '"title" = "Hallo %@";'
    );
    const output = run(nativeValidator, ['--root', root]);
    expect(output).toContain('de: 1/2 (1 missing)');
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
    fs.writeFileSync(
      path.join(
        root,
        'targets/android-widget/res/values-de/widget_strings.xml'
      ),
      '<resources><string name="title">Hallo %1$s</string></resources>'
    );
    fs.writeFileSync(
      path.join(root, 'targets/widget/de.lproj/Localizable.strings'),
      '"title" = "Hallo %lld";'
    );
    expect(() => run(nativeValidator, ['--root', root])).toThrow(
      'iOS widget de:title placeholder mismatch'
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reads a doubled percent as a literal rather than a format argument', () => {
    const root = fixtureRoot();
    // Unless `%%` is consumed first, the second `%` starts a match that takes the
    // following space as a flag and the next letter as the conversion, inventing an
    // argument that differs per language ("% o" here, "% d" in the translations).
    writeNative(root, 'en', '<resources><string name="goal">50%% of goal</string></resources>', '"goal" = "50%% of goal";');
    writeNative(root, 'pl', '<resources><string name="goal">50%% do celu</string></resources>', '"goal" = "50%% do celu";');
    writeNative(root, 'de', '<resources><string name="goal">50%% des Ziels</string></resources>', '"goal" = "50%% des Ziels";');
    const output = run(nativeValidator, ['--root', root]);
    expect(output).toContain('pl: 1/1 (0 missing)');
    expect(output).toContain('de: 1/1 (0 missing)');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
