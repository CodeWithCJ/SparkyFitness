import manifest from './localeRegistry.json';

export type LocaleMetadata = {
  languageCode: string;
  intlLocale: string;
  displayNameKey: string;
  defaultDisplayName: string;
};

type ManifestLocaleKey = keyof typeof manifest.locales;
const manifestLocales = manifest.locales satisfies Record<ManifestLocaleKey, LocaleMetadata>;

export const SOURCE_LOCALE = manifest.sourceLocale as ManifestLocaleKey;
export const FALLBACK_LOCALE = manifest.fallbackLocale as ManifestLocaleKey;

if (!Object.hasOwn(manifestLocales, SOURCE_LOCALE)) {
  throw new Error(`SOURCE_LOCALE "${SOURCE_LOCALE}" is not registered`);
}
if (!Object.hasOwn(manifestLocales, FALLBACK_LOCALE)) {
  throw new Error(`FALLBACK_LOCALE "${FALLBACK_LOCALE}" is not registered`);
}

/** Authoritative application-shipped locales. Weblate directories are not automatically shipped. */
export const SHIPPED_LOCALES = manifestLocales;
export type CanonicalLocaleRegistry = Record<string, LocaleMetadata>;
export type SupportedLanguage = keyof typeof manifestLocales;
export const SUPPORTED_LANGUAGES = Object.keys(manifestLocales) as SupportedLanguage[];

export function canonicalizeLocaleTag(value: string): string {
  return value.trim().replaceAll('_', '-').toLowerCase();
}

/** Resolve exact registered tags, including private-use extensions, without ambiguous family matching. */
export function normalizeLocaleFromRegistry(
  value: string | null | undefined,
  registry: Record<string, LocaleMetadata> = SHIPPED_LOCALES,
): string | null {
  if (!value) return null;
  const input = canonicalizeLocaleTag(value);
  const entries = Object.entries(registry);
  const exact = entries.find(([key, metadata]) =>
    [key, metadata.intlLocale]
      .some((tag) => canonicalizeLocaleTag(tag) === input),
  );
  if (exact) return exact[0];

  return entries
    .filter(([key, metadata]) => [key, metadata.intlLocale]
      .some((tag) => input.startsWith(`${canonicalizeLocaleTag(tag)}-`)))
    .sort((a, b) => Math.max(b[0].length, b[1].intlLocale.length)
      - Math.max(a[0].length, a[1].intlLocale.length))[0]?.[0] ?? null;
}

export function normalizeRegisteredLocale(value: string | null | undefined): SupportedLanguage | null {
  return normalizeLocaleFromRegistry(value) as SupportedLanguage | null;
}

export function resolveLanguage(value: string | null | undefined): SupportedLanguage {
  return normalizeRegisteredLocale(value) ?? FALLBACK_LOCALE;
}

export function metadataForLanguage(language: SupportedLanguage): LocaleMetadata {
  return SHIPPED_LOCALES[language];
}

export function nativeLanguageTags(): string[] {
  return [...SUPPORTED_LANGUAGES];
}
