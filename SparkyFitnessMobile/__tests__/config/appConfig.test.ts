import fs from 'fs';
import path from 'path';

describe('Expo native language configuration', () => {
  it('retains the native locale configuration and localized metadata settings', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../app.config.ts'), 'utf8');
    expect(source).toContain('nativeLanguageTags()');
    expect(source).toContain('supportedLocales');
    expect(source).not.toContain("ios: ['en', 'pl']");
    expect(source).not.toContain("android: ['en', 'pl']");
    expect(source).toContain('UIPrefersShowingLanguageSettings: true');
    expect(source).toContain('CFBundleAllowMixedLocalizations: true');
  });
});
