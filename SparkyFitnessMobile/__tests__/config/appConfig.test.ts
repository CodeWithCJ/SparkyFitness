import appConfig from '../../app.config';

function buildConfig() {
  return appConfig({ config: {} } as never);
}

describe('Expo native language configuration', () => {
  it('keeps both native locale lists and localized metadata enabled', () => {
    const config = buildConfig();
    const localizationPlugin = (config.plugins ?? []).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization',
    ) as [string, { supportedLocales: { ios: string[]; android: string[] } }] | undefined;

    expect(localizationPlugin?.[1].supportedLocales.ios).toEqual(['en', 'pl']);
    expect(localizationPlugin?.[1].supportedLocales.android).toEqual(['en', 'pl']);
    expect(config.locales).toEqual({
      en: './locales/en.json',
      pl: './locales/pl.json',
    });
    expect(config.ios?.infoPlist).toMatchObject({
      UIPrefersShowingLanguageSettings: true,
      CFBundleAllowMixedLocalizations: true,
    });
  });
});
