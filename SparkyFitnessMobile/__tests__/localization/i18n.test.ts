import i18n, {
  applyLanguagePreference,
  formatLocalizedNumber,
  localizeTemplate,
  localizeText,
  resolveLanguagePreference,
} from '../../src/localization/i18n';

describe('mobile localization', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('uses English by default', () => {
    expect(localizeText('Settings')).toBe('Settings');
    expect(resolveLanguagePreference('system')).toBe('en');
  });

  it('reuses a matching Weblate translation', async () => {
    await applyLanguagePreference('pl');
    expect(localizeText('Settings')).toBe('Ustawienia');
  });

  it('uses mobile translations for labels absent from Weblate', async () => {
    await applyLanguagePreference('pl');
    expect(localizeText('App Settings')).toBe('Ustawienia aplikacji');
  });

  it('formats numbers for the selected app language', async () => {
    expect(formatLocalizedNumber(2000)).toBe('2,000');
    await applyLanguagePreference('pl');
    expect(formatLocalizedNumber(2000)).toBe('2000');
  });

  it('preserves values in translated templates', async () => {
    await applyLanguagePreference('pl');
    expect(localizeTemplate('{{value1}} days to go', [5])).toBe(
      'Pozostało 5 dni',
    );
  });
});
