export const DEFAULT_LANGUAGE = 'ar';
export const FALLBACK_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'language';

export type LanguageDirection = 'ltr' | 'rtl';

export const SAUDI_DEFAULT_PREFERENCES = Object.freeze({
  language: DEFAULT_LANGUAGE,
  dateFormat: 'dd/MM/yyyy',
  weightUnit: 'kg',
  measurementUnit: 'cm',
  distanceUnit: 'km',
  waterDisplayUnit: 'ml',
  energyUnit: 'kcal',
  firstDayOfWeek: 0,
  timezoneFallback: 'Asia/Riyadh',
} as const);

const RTL_LANGUAGE_CODES = new Set(['ar', 'fa', 'he', 'ur']);

const normalizeLanguageTag = (language: string): string =>
  language.trim().replaceAll('_', '-');

const getBaseLanguage = (language: string): string => {
  const [baseLanguage = ''] = normalizeLanguageTag(language).split('-');
  return baseLanguage.toLowerCase();
};

export const resolveLanguagePreference = (language?: string | null): string => {
  if (!language?.trim()) return DEFAULT_LANGUAGE;
  return normalizeLanguageTag(language);
};

export const getLanguageDirection = (
  language?: string | null
): LanguageDirection => {
  const resolvedLanguage = resolveLanguagePreference(language);
  return RTL_LANGUAGE_CODES.has(getBaseLanguage(resolvedLanguage))
    ? 'rtl'
    : 'ltr';
};

export const getHtmlLanguage = (language?: string | null): string => {
  const resolvedLanguage = resolveLanguagePreference(language);
  return getBaseLanguage(resolvedLanguage) === 'ar'
    ? 'ar-SA'
    : resolvedLanguage;
};

export const getPresentationLocale = (language?: string | null): string => {
  const resolvedLanguage = resolveLanguagePreference(language);
  return getBaseLanguage(resolvedLanguage) === 'ar'
    ? 'ar-SA-u-ca-gregory'
    : resolvedLanguage;
};

export const getFallbackLanguages = (language?: string | null): string[] =>
  language?.trim()
    ? [FALLBACK_LANGUAGE]
    : [DEFAULT_LANGUAGE, FALLBACK_LANGUAGE];
