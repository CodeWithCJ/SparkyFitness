import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import enTranslation from './locales/en/translation.json';
import plTranslation from './locales/pl/translation.json';

export const SUPPORTED_LANGUAGES = ['en', 'pl'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = 'system' | SupportedLanguage;

const STORE_KEY = '@SparkyFitness/app-preferences';
const i18n = createInstance();

function normalizeLanguage(language: string | null | undefined): SupportedLanguage {
  return language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export function getDeviceLanguage(): SupportedLanguage {
  return normalizeLanguage(getLocales()[0]?.languageCode);
}

export function resolveLanguagePreference(
  preference: LanguagePreference,
): SupportedLanguage {
  return preference === 'system' ? getDeviceLanguage() : preference;
}

let initPromise: Promise<void> | null = null;

export async function initializeI18n(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let initialLanguage: SupportedLanguage;
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { languagePreference?: LanguagePreference } };
        const stored = parsed?.state?.languagePreference;
        initialLanguage = stored ? resolveLanguagePreference(stored) : getDeviceLanguage();
      } else {
        initialLanguage = getDeviceLanguage();
      }
    } catch {
      initialLanguage = getDeviceLanguage();
    }

    await i18n.use(initReactI18next).init({
      resources: {
        en: { translation: enTranslation },
        pl: { translation: plTranslation },
      },
      lng: initialLanguage,
      fallbackLng: 'en',
      supportedLngs: [...SUPPORTED_LANGUAGES],
      initImmediate: false,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
  })();

  return initPromise;
}

export async function applyLanguagePreference(
  preference: LanguagePreference,
): Promise<SupportedLanguage> {
  await initializeI18n();
  const language = resolveLanguagePreference(preference);
  if (i18n.resolvedLanguage !== language) {
    await i18n.changeLanguage(language);
  }
  return language;
}

export function formatLocalizedNumber(value: number): string {
  const locale = getAppLocale();
  return value.toLocaleString(locale);
}

export function getAppLocale(): 'pl-PL' | 'en-US' {
  return i18n.resolvedLanguage === 'pl' ? 'pl-PL' : 'en-US';
}

export default i18n;
