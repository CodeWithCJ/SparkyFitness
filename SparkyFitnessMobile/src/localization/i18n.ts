import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import webEnglish from '../../../SparkyFitnessFrontend/public/locales/en/translation.json';
import webPolish from '../../../SparkyFitnessFrontend/public/locales/pl/translation.json';
import mobilePolish from './mobile.pl.json';
import mobilePolishOverrides from './mobile.pl.overrides.json';

export const SUPPORTED_LANGUAGES = ['en', 'pl'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = 'system' | SupportedLanguage;

type TranslationTree = Record<string, unknown>;
type TranslationMap = Record<string, string>;
const i18n = createInstance();

function flattenTranslations(
  value: TranslationTree,
  prefix = '',
  result: TranslationMap = {},
): TranslationMap {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      result[path] = child;
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenTranslations(child as TranslationTree, path, result);
    }
  }
  return result;
}

function buildSafeReverseMap(
  english: TranslationTree,
  translated: TranslationTree,
): TranslationMap {
  const flatEnglish = flattenTranslations(english);
  const flatTranslated = flattenTranslations(translated);
  const candidates = new Map<string, Set<string>>();

  for (const [key, englishValue] of Object.entries(flatEnglish)) {
    const translatedValue = flatTranslated[key];
    if (!translatedValue || translatedValue === englishValue) continue;
    const values = candidates.get(englishValue) ?? new Set<string>();
    values.add(translatedValue);
    candidates.set(englishValue, values);
  }

  return Object.fromEntries(
    [...candidates.entries()]
      .filter(([, values]) => values.size === 1)
      .map(([englishValue, values]) => [englishValue, [...values][0]]),
  );
}

const polishTranslations: TranslationMap = {
  ...buildSafeReverseMap(webEnglish as TranslationTree, webPolish as TranslationTree),
  ...(mobilePolish as TranslationMap),
  ...(mobilePolishOverrides as TranslationMap),
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

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: webEnglish },
    pl: { translation: webPolish },
  },
  lng: getDeviceLanguage(),
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

export async function applyLanguagePreference(
  preference: LanguagePreference,
): Promise<SupportedLanguage> {
  const language = resolveLanguagePreference(preference);
  if (i18n.resolvedLanguage !== language) {
    await i18n.changeLanguage(language);
  }
  return language;
}

export function formatLocalizedNumber(value: number): string {
  const locale = i18n.resolvedLanguage === 'pl' ? 'pl-PL' : 'en-US';
  return value.toLocaleString(locale);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type TemplateTranslation = {
  source: string;
  translation: string;
  pattern: RegExp;
  placeholders: string[];
};

const templateTranslations: TemplateTranslation[] = Object.entries(polishTranslations)
  .filter(([source]) => /\{\{value\d+\}\}/.test(source))
  .map(([source, translation]) => {
    const placeholders: string[] = [];
    const markerPattern = /\{\{(value\d+)\}\}/g;
    let cursor = 0;
    let expression = '^';
    for (const match of source.matchAll(markerPattern)) {
      expression += escapeRegExp(source.slice(cursor, match.index));
      expression += '(.+?)';
      placeholders.push(match[1]);
      cursor = (match.index ?? 0) + match[0].length;
    }
    expression += `${escapeRegExp(source.slice(cursor))}$`;
    return {
      source,
      translation,
      pattern: new RegExp(expression, 'u'),
      placeholders,
    };
  })
  .sort((left, right) => right.source.length - left.source.length);

function interpolate(
  translation: string,
  values: Readonly<Record<string, string>>,
): string {
  return translation.replace(/\{\{(value\d+)\}\}/g, (placeholder, name) => {
    return values[name] ?? placeholder;
  });
}

export function localizeText(value: string): string {
  if (i18n.resolvedLanguage !== 'pl') return value;

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return value;

  const direct = polishTranslations[normalized];
  if (direct) return direct;

  for (const template of templateTranslations) {
    const match = normalized.match(template.pattern);
    if (!match) continue;
    const values = Object.fromEntries(
      template.placeholders.map((placeholder, index) => [
        placeholder,
        match[index + 1],
      ]),
    );
    return interpolate(template.translation, values);
  }

  return value;
}

export function localizeTemplate(
  template: string,
  values: readonly unknown[],
): string {
  const translated = localizeText(template);
  const replacements = Object.fromEntries(
    values.map((value, index) => [`value${index + 1}`, String(value)]),
  );
  return interpolate(translated, replacements);
}

export default i18n;
