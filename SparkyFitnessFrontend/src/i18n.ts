import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';
import { getSupportedLanguages } from './utils/languageUtils';
import {
  LANGUAGE_STORAGE_KEY,
  getFallbackLanguages,
} from './utils/localePolicy';

i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: getSupportedLanguages(),
    fallbackLng: (languageCode) => getFallbackLanguages(languageCode),
    detection: {
      order: [
        'localStorage',
        'querystring',
        'cookie',
        'sessionStorage',
        'navigator',
        'htmlTag',
      ],
      caches: ['localStorage', 'cookie'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
