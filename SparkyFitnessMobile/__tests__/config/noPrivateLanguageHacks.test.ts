import fs from 'fs';
import path from 'path';

describe('language implementation safety', () => {
  it('does not use private iOS language forcing APIs', () => {
    const root = path.resolve(__dirname, '../..');
    const files = [
      'src/localization/appLanguage.ts',
      'src/localization/i18n.ts',
      'src/screens/AppSettingsScreen.tsx',
      'plugins/withAppLanguage.ts',
    ];
    const forbidden = [
      'AppleLanguages',
      'App-Prefs:',
      'UserDefaults',
      'Bundle.main',
      'swizzle',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      for (const token of forbidden) expect(source).not.toContain(token);
    }
  });
});
