// In a real-world scenario, this list would be fetched dynamically from a server-side endpoint
// that reads the contents of the public/locales directory.
// For this task, we are hardcoding the languages found in the public/locales directory.
export const getSupportedLanguages = (): string[] => {
  return ['de', 'en', 'fr', 'pt-BR', 'ta'];
};

export const getLanguageDisplayName = (langCode: string): string => {
  switch (langCode) {
    case 'en':
      return 'English';
    case 'de':
      return 'Deutsch';
    case 'fr':
      return 'Français';
    case 'pt-BR':
      return 'Português (Brasil)';
    case 'ta':
      return 'தமிழ்';
    default:
      return langCode;
  }
};