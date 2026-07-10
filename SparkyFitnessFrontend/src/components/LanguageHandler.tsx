import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  getHtmlLanguage,
  getLanguageDirection,
  resolveLanguagePreference,
} from '@/utils/localePolicy';

const LanguageHandler = (): null => {
  const { i18n } = useTranslation();
  const { language } = usePreferences();

  useEffect(() => {
    const resolvedLanguage = resolveLanguagePreference(language);

    document.documentElement.lang = getHtmlLanguage(resolvedLanguage);
    document.documentElement.dir = getLanguageDirection(resolvedLanguage);
    void i18n.changeLanguage(resolvedLanguage);
  }, [language, i18n]);

  return null;
};

export default LanguageHandler;
