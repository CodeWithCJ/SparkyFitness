import { useSyncExternalStore } from 'react';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import { addLog } from '../services/LogService';
import enTranslation from './locales/en/translation.json';
import plTranslation from './locales/pl/translation.json';
import {
  FALLBACK_LOCALE,
  metadataForLanguage,
  normalizeRegisteredLocale,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './localeRegistry';

export { FALLBACK_LOCALE, SHIPPED_LOCALES, SUPPORTED_LANGUAGES } from './localeRegistry';
export type { SupportedLanguage } from './localeRegistry';
export type LanguagePreference = 'system' | SupportedLanguage;

const resources = {
  en: { translation: enTranslation },
  pl: { translation: plTranslation },
} satisfies Record<SupportedLanguage, { translation: object }>;

const i18n = createInstance();
const I18N_INIT_OPTIONS = {
  resources,
  fallbackLng: FALLBACK_LOCALE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  initImmediate: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
};

export function normalizeLanguage(language: string | null | undefined): SupportedLanguage {
  return resolveLanguage(language);
}

export function getDeviceLanguage(): SupportedLanguage {
  return resolveLanguage(getLocales()[0]?.languageTag ?? getLocales()[0]?.languageCode);
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

export function formatLocalizedNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(getAppLocale(), options);
}

export function getNativeIOSLanguage(): SupportedLanguage {
  for (const locale of getLocales()) {
    const language = normalizeRegisteredLocale(locale.languageTag ?? locale.languageCode);
    if (language) return language;
  }
  return FALLBACK_LOCALE;
}

async function initI18nLanguage(language: SupportedLanguage): Promise<void> {
  await i18n.use(initReactI18next).init({ ...I18N_INIT_OPTIONS, lng: language });
}

let initPromise: Promise<void> | null = null;
export function initializeI18n(language: SupportedLanguage): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => initI18nLanguage(language))().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(`[i18n] initializeI18n failed: ${message}`, 'ERROR');
    if (!i18n.isInitialized) {
      try { await initI18nLanguage(FALLBACK_LOCALE); }
      catch (fallbackError) {
        await addLog(`[i18n] Fallback init with ${FALLBACK_LOCALE} failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`, 'ERROR');
        if (!i18n.isInitialized) initPromise = null;
      }
    }
  });
  return initPromise;
}

export default i18n;
