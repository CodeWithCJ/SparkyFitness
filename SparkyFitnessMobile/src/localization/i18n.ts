import { useSyncExternalStore } from 'react';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import { addLog } from '../services/LogService';
import { RESOURCE_MAP } from './generatedLocaleResources';
import {
  FALLBACK_LOCALE,
  metadataForLanguage,
  normalizeRegisteredLocale,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './localeRegistry';

export { RESOURCE_MAP } from './generatedLocaleResources';
export { SUPPORTED_LANGUAGES } from './localeRegistry';
export type { SupportedLanguage } from './localeRegistry';
export type LanguagePreference = 'system' | SupportedLanguage;

const i18n = createInstance();
const I18N_INIT_OPTIONS = {
  resources: RESOURCE_MAP,
  fallbackLng: FALLBACK_LOCALE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  initImmediate: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  react: { useSuspense: false },
};

export function normalizeLanguage(
  language: string | null | undefined
): SupportedLanguage {
  return resolveLanguage(language);
}

export function getDeviceLanguage(): SupportedLanguage {
  return resolveLanguage(
    getLocales()[0]?.languageTag ?? getLocales()[0]?.languageCode
  );
}

export function getAppLocale(): string {
  const language = normalizeLanguage(i18n.resolvedLanguage);
  return metadataForLanguage(language).intlLocale;
}

function subscribeToAppLocale(onStoreChange: () => void): () => void {
  const handleLanguageChanged = () => onStoreChange();
  i18n.on('languageChanged', handleLanguageChanged);
  return () => i18n.off('languageChanged', handleLanguageChanged);
}

export function useAppLocale(): string {
  return useSyncExternalStore(subscribeToAppLocale, getAppLocale, getAppLocale);
}

export function formatLocalizedNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return value.toLocaleString(getAppLocale(), options);
}

export function getNativeIOSLanguage(): SupportedLanguage {
  for (const locale of getLocales()) {
    const language = normalizeRegisteredLocale(
      locale.languageTag ?? locale.languageCode
    );
    if (language) return language;
  }
  return FALLBACK_LOCALE;
}

/**
 * Languages whose catalogs carry one/few/many but no `other` form.
 *
 * Weblate models Polish, Russian and Ukrainian with the three-form gettext
 * plural, so it never emits an `other` translation for them. CLDR gives these
 * languages a fourth category of that name, and it is the one
 * `Intl.PluralRules` -- which i18next uses to choose a key suffix -- returns for
 * a non-integer count such as 1.5. The key therefore never existed and every
 * fractional count fell back to English: "1,5 cups" instead of "1,5 szklanki".
 *
 * The form these languages actually want there is the genitive singular, which
 * is the same string they already use for `few`. Drop this shim only once the
 * catalogs gain real `_other` plurals.
 */
const FRACTIONAL_PLURAL_USES_FEW = new Set(['pl', 'ru', 'uk']);

const OTHER_SUFFIX = 'other';
const FEW_SUFFIX = 'few';

/** The slice of i18next's private plural resolver this shim depends on. */
interface PluralSuffixResolver {
  getSuffix(
    code: string,
    count: number,
    options?: { ordinal?: boolean }
  ): string;
}

let fractionalPluralFallbackInstalled = false;

function installFractionalPluralFallback(): void {
  if (fractionalPluralFallbackInstalled) return;
  const resolver = (
    i18n as unknown as {
      services?: { pluralResolver?: PluralSuffixResolver };
    }
  ).services?.pluralResolver;
  if (!resolver) return;

  const resolveSuffix = resolver.getSuffix.bind(resolver);
  resolver.getSuffix = (code, count, options = {}) => {
    const suffix = resolveSuffix(code, count, options);
    // Ordinals are a separate series and are not affected.
    if (options.ordinal) return suffix;
    if (!suffix.endsWith(OTHER_SUFFIX)) return suffix;
    const language = code.split(/[-_]/)[0]?.toLowerCase() ?? '';
    if (!FRACTIONAL_PLURAL_USES_FEW.has(language)) return suffix;
    return `${suffix.slice(0, -OTHER_SUFFIX.length)}${FEW_SUFFIX}`;
  };

  fractionalPluralFallbackInstalled = true;
}

async function initI18nLanguage(language: SupportedLanguage): Promise<void> {
  await i18n
    .use(initReactI18next)
    .init({ ...I18N_INIT_OPTIONS, lng: language });
  // The resolver only exists once init has built the instance's services.
  installFractionalPluralFallback();
}

let initPromise: Promise<void> | null = null;
export function initializeI18n(language: SupportedLanguage): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => initI18nLanguage(language))().catch(
    async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await addLog(`[i18n] initializeI18n failed: ${message}`, 'ERROR');
      if (!i18n.isInitialized) {
        try {
          await initI18nLanguage(FALLBACK_LOCALE);
        } catch (fallbackError) {
          await addLog(
            `[i18n] Fallback init with ${FALLBACK_LOCALE} failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
            'ERROR'
          );
          if (!i18n.isInitialized) initPromise = null;
        }
      }
    }
  );
  return initPromise;
}

export default i18n;
