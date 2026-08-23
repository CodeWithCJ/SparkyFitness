import manifest from './localeRegistry.json';

export const SOURCE_LOCALE = manifest.sourceLocale;
export const FALLBACK_LOCALE = manifest.fallbackLocale;

export type LocaleMetadata = {
  languageCode: string;
  intlLocale: string;
  displayNameKey: string;
  defaultDisplayName: string;
  nativeLanguageTag: string;
};

export const SHIPPED_LOCALES = manifest.locales as Record<string, LocaleMetadata>;
export type SupportedLanguage = keyof typeof SHIPPED_LOCALES;
export const SUPPORTED_LANGUAGES = Object.keys(SHIPPED_LOCALES) as SupportedLanguage[];
export const SHIPPED_INTL_LOCALES = SUPPORTED_LANGUAGES.map((language) => SHIPPED_LOCALES[language].intlLocale);

export function canonicalizeLocaleTag(value: string): string {
  return value.trim().replaceAll('_', '-').toLowerCase();
}

/**
 * Resolves the most specific registered locale without collapsing region
 * variants. Exact tags win; private-use extensions then fall back to the
 * longest registered prefix; language-only fallback is supported for locales
 * whose registry entry is itself language-only.
 */
export function normalizeLocaleFromRegistry(
  value: string | null | undefined,
  registry: Record<string, LocaleMetadata> = SHIPPED_LOCALES,
): string | null {
  if (!value) return null;
  const input = canonicalizeLocaleTag(value);
  const entries = Object.entries(registry);
  const exact = entries.find(([key, metadata]) =>
    [key, metadata.nativeLanguageTag, metadata.languageCode, metadata.intlLocale]
      .some((tag) => canonicalizeLocaleTag(tag) === input),
  );
  if (exact) return exact[0];

  return entries
    .filter(([key, metadata]) => [key, metadata.nativeLanguageTag, metadata.intlLocale]
      .some((tag) => input.startsWith(`${canonicalizeLocaleTag(tag)}-`)))
    .sort((a, b) => Math.max(b[0].length, b[1].nativeLanguageTag.length, b[1].intlLocale.length)
      - Math.max(a[0].length, a[1].nativeLanguageTag.length, a[1].intlLocale.length))[0]?.[0] ?? null;
}

export function normalizeRegisteredLocale(value: string | null | undefined): SupportedLanguage | null {
  return normalizeLocaleFromRegistry(value) as SupportedLanguage | null;
}

export function resolveLanguage(value: string | null | undefined): SupportedLanguage {
  return normalizeRegisteredLocale(value) ?? FALLBACK_LOCALE as SupportedLanguage;
}

export function metadataForLanguage(language: SupportedLanguage): LocaleMetadata {
  return SHIPPED_LOCALES[language];
}

export function nativeLanguageTags(): string[] {
  return SUPPORTED_LANGUAGES.map((language) => SHIPPED_LOCALES[language].nativeLanguageTag);
}
