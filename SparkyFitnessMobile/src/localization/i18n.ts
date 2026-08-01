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

function normalizePreference(value: unknown): LanguagePreference {
  if (value === 'system' || value === 'en' || value === 'pl') {
    return value;
  }
  return 'system';
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function initI18nLanguage(language: SupportedLanguage): Promise<void> {
  await i18n.use(initReactI18next).init({
    ...I18N_INIT_OPTIONS,
    lng: language,
  });
}

let initPromise: Promise<void> | null = null;

export async function initializeI18n(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let initialLanguage: SupportedLanguage = 'en';

    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = safeJsonParse(raw);
        const storedPreference = (
          parsed as { state?: { languagePreference?: unknown } } | null
        )?.state?.languagePreference;
        const preference = normalizePreference(storedPreference);
        initialLanguage = resolveLanguagePreference(preference);
      } else {
        initialLanguage = getDeviceLanguage();
      }
    } catch {
      initialLanguage = 'en';
    }

    await initI18nLanguage(initialLanguage);
  })().catch(async (error) => {
    console.error(
      '[i18n] initializeI18n failed:',
      error instanceof Error ? error.message : String(error),
    );
    if (!i18n.isInitialized) {
      try {
        await initI18nLanguage('en');
      } catch (fallbackError) {
        console.error(
          '[i18n] Fallback init with en failed:',
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        );
      }
    }
  });

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

export function formatLocalizedNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  const locale = getAppLocale();
  return value.toLocaleString(locale, options);
}

export function getAppLocale(): 'pl-PL' | 'en-US' {
  return i18n.resolvedLanguage === 'pl' ? 'pl-PL' : 'en-US';
}

export default i18n;
