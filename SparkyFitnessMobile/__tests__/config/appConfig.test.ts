import fs from 'fs';
import path from 'path';

describe('Expo native language configuration', () => {
  it('retains the native locale configuration and localized metadata settings', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../app.config.ts'), 'utf8');
    expect(source).toContain("ios: ['en', 'pl']");
    expect(source).toContain("android: ['en', 'pl']");
    expect(source).toContain("en: './locales/en.json'");
    expect(source).toContain("pl: './locales/pl.json'");
    expect(source).toContain('UIPrefersShowingLanguageSettings: true');
    expect(source).toContain('CFBundleAllowMixedLocalizations: true');
  });
});
