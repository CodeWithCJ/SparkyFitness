import React, { createContext, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from './PreferencesContext';

interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string, options?: any) => string;
  i18n: any;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t, i18n } = useTranslation();
  const { language: preferenceLanguage } = usePreferences();
  
  // Sync i18n language with preferences
  useEffect(() => {
    if (preferenceLanguage && i18n.language !== preferenceLanguage) {
      i18n.changeLanguage(preferenceLanguage);
    }
  }, [preferenceLanguage, i18n]);
  
  const setLanguage = (language: string) => {
    i18n.changeLanguage(language);
    localStorage.setItem('i18nextLng', language);
  };

  const value = {
    language: i18n.language,
    setLanguage,
    t,
    i18n
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};