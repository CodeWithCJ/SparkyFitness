import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';

const LanguageHandler = () => {
  const { i18n } = useTranslation();
  const { language } = usePreferences();

  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  return null;
};

export default LanguageHandler;