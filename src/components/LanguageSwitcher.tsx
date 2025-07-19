import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';

const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const { setLanguage: setPreferenceLanguage } = usePreferences();

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    setPreferenceLanguage(newLanguage);
  };

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4" />
      <Select value={language} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder={t('header.language')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">{t('languages.english')}</SelectItem>
          <SelectItem value="ru">{t('languages.russian')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default LanguageSwitcher;