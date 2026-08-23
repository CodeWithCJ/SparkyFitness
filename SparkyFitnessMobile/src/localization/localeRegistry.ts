export const SOURCE_LOCALE = 'en' as const;
export const FALLBACK_LOCALE = SOURCE_LOCALE;

export type LocaleMetadata = {
  languageCode: string;
  intlLocale: string;
  displayNameKey: string;
  nativeLanguageTag: string;
};

/** Authoritative list of locales exposed by the application. Weblate files are not automatically shipped. */
export const SHIPPED_LOCALES = {
  en: { languageCode: 'en', intlLocale: 'en-US', displayNameKey: 'settings.language.english', nativeLanguageTag: 'en' },
  pl: { languageCode: 'pl', intlLocale: 'pl-PL', displayNameKey: 'settings.language.polish', nativeLanguageTag: 'pl' },
} as const satisfies Record<string, LocaleMetadata>;

export type SupportedLanguage = keyof typeof SHIPPED_LOCALES;
export const SUPPORTED_LANGUAGES = Object.keys(SHIPPED_LOCALES) as SupportedLanguage[];
export const SHIPPED_INTL_LOCALES = Object.values(SHIPPED_LOCALES).map(({ intlLocale }) => intlLocale);

function canonical(value: string): string {
  return value.trim().replaceAll('_', '-').toLowerCase();
}

/** Match the most specific registered locale first, then its language family. */
export function normalizeRegisteredLocale(value: string | null | undefined): SupportedLanguage | null {
  if (!value) return null;
  const input = canonical(value);
  const exact = SUPPORTED_LANGUAGES.find((code) => input === canonical(code) || input === canonical(SHIPPED_LOCALES[code].nativeLanguageTag));
  if (exact) return exact;
  const candidates = SUPPORTED_LANGUAGES
    .filter((code) => input === canonical(SHIPPED_LOCALES[code].intlLocale) || input.startsWith(`${canonical(code)}-`))
    .sort((a, b) => canonical(SHIPPED_LOCALES[b].intlLocale).length - canonical(SHIPPED_LOCALES[a].intlLocale).length);
  return candidates[0] ?? null;
}

export function resolveLanguage(value: string | null | undefined): SupportedLanguage {
  return normalizeRegisteredLocale(value) ?? FALLBACK_LOCALE;
}

export function metadataForLanguage(language: SupportedLanguage): LocaleMetadata {
  return SHIPPED_LOCALES[language];
}

export function nativeLanguageTags(): string[] {
  return SUPPORTED_LANGUAGES.map((language) => SHIPPED_LOCALES[language].nativeLanguageTag);
}
