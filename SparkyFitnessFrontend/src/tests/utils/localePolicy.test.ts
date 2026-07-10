import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  SAUDI_DEFAULT_PREFERENCES,
  getFallbackLanguages,
  getHtmlLanguage,
  getLanguageDirection,
  getPresentationLocale,
  resolveLanguagePreference,
} from '@/utils/localePolicy';

describe('localePolicy', () => {
  it('uses Arabic and Saudi metric preferences when no preference exists', () => {
    expect(DEFAULT_LANGUAGE).toBe('ar');
    expect(SAUDI_DEFAULT_PREFERENCES).toEqual({
      language: 'ar',
      dateFormat: 'dd/MM/yyyy',
      weightUnit: 'kg',
      measurementUnit: 'cm',
      distanceUnit: 'km',
      waterDisplayUnit: 'ml',
      energyUnit: 'kcal',
      firstDayOfWeek: 0,
      timezoneFallback: 'Asia/Riyadh',
    });
  });

  it('preserves an explicit language and defaults only an absent preference', () => {
    expect(resolveLanguagePreference('en')).toBe('en');
    expect(resolveLanguagePreference(' pt-BR ')).toBe('pt-BR');
    expect(resolveLanguagePreference(null)).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguagePreference('')).toBe(DEFAULT_LANGUAGE);
  });

  it.each(['ar', 'ar-SA', 'ar_SA', 'AR'])(
    '%s uses RTL direction',
    (language) => {
      expect(getLanguageDirection(language)).toBe('rtl');
    }
  );

  it.each(['en', 'en-US', 'fr', 'zh-Hans'])(
    '%s uses LTR direction',
    (language) => {
      expect(getLanguageDirection(language)).toBe('ltr');
    }
  );

  it('uses Saudi Arabic presentation metadata without changing stored day semantics', () => {
    expect(getHtmlLanguage('ar')).toBe('ar-SA');
    expect(getPresentationLocale('ar')).toBe('ar-SA-u-ca-gregory');
    expect(getHtmlLanguage('en')).toBe('en');
    expect(getPresentationLocale('en')).toBe('en');
  });

  it('starts without a preference in Arabic and always keeps English as the catalog fallback', () => {
    expect(getFallbackLanguages()).toEqual([
      DEFAULT_LANGUAGE,
      FALLBACK_LANGUAGE,
    ]);
    expect(getFallbackLanguages('ar')).toEqual([FALLBACK_LANGUAGE]);
    expect(getFallbackLanguages('en')).toEqual([FALLBACK_LANGUAGE]);
  });
});
