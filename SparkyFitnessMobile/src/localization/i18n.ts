import { useSyncExternalStore } from 'react';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import { addLog } from '../services/LogService';

import enTranslation from './locales/en/translation.json';
import plTranslation from './locales/pl/translation.json';

export const SUPPORTED_LANGUAGES = ['en', 'pl'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = 'system' | SupportedLanguage;

const i18n = createInstance();

const I18N_INIT_OPTIONS = {
  resources: {
    en: { translation: enTranslation },
    pl: { translation: plTranslation },
  },
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  initImmediate: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
};

export function normalizeLanguage(language: string | null | undefined): SupportedLanguage {
  return language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export function getDeviceLanguage(): SupportedLanguage {
  return normalizeLanguage(getLocales()[0]?.languageCode);
}

export function getAppLocale(): 'pl-PL' | 'en-US' {
  return i18n.resolvedLanguage === 'pl' ? 'pl-PL' : 'en-US';
}

/**
 * Reactive application-locale snapshot backed directly by SparkyFitness's
 * custom i18next instance. This is required by retained portal/bottom-sheet
 * subtrees: an imperative getAppLocale() call alone cannot cause a render when
 * i18n changes language at runtime.
 */
function subscribeToAppLocale(onStoreChange: () => void): () => void {
  const handleLanguageChanged = () => onStoreChange();
  i18n.on('languageChanged', handleLanguageChanged);
  return () => i18n.off('languageChanged', handleLanguageChanged);
}

export function useAppLocale(): 'pl-PL' | 'en-US' {
  return useSyncExternalStore(
    subscribeToAppLocale,
    getAppLocale,
    getAppLocale,
  );
}

export function formatLocalizedNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(getAppLocale(), options);
}

/**
 * iOS exposes the per-app language through expo-localization. The first
 * supported locale is the OS-owned effective value; unsupported locales use
 * the deterministic English fallback.
 */
export function getNativeIOSLanguage(): SupportedLanguage {
  const locales = getLocales();
  for (const locale of locales) {
    const language = locale.languageCode?.toLowerCase().split('-')[0];
    if (language === 'pl' || language === 'en') return language;
  }
  return 'en';
}

async function initI18nLanguage(language: SupportedLanguage): Promise<void> {
  await i18n.use(initReactI18next).init({
    ...I18N_INIT_OPTIONS,
    lng: language,
  });
}

let initPromise: Promise<void> | null = null;

/**
 * Initializes the i18next instance for the given language. The language is
 * always supplied by the caller (appLanguage.ts owns preference resolution);
 * this module never reads persisted preferences itself.
 *
 * Failure is resilient and retryable: if both the requested language and the
 * deterministic English fallback fail, the cached promise is cleared so a later
 * bootstrap/foreground operation can retry instead of permanently poisoning the
 * session with a resolved failed promise.
 */
export function initializeI18n(language: SupportedLanguage): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await initI18nLanguage(language);
  })().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(`[i18n] initializeI18n failed: ${message}`, 'ERROR');
    if (!i18n.isInitialized) {
      try {
        await initI18nLanguage('en');
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        await addLog(`[i18n] Fallback init with en failed: ${fallbackMessage}`, 'ERROR');
        if (!i18n.isInitialized) {
          initPromise = null;
        }
      }
    }
  });

  return initPromise;
}

export default i18n;
