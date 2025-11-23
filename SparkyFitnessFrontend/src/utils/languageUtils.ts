// In a real-world scenario, this list would be fetched dynamically from a server-side endpoint
// that reads the contents of the public/locales directory.
// For this task, we are hardcoding the languages found in the public/locales directory.
export const getSupportedLanguages = (): string[] => {
  return ['da', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pt-BR', 'ro', 'sl', 'sv', 'ta'];
};

export const getLanguageDisplayName = (langCode: string): string => {
  switch (langCode) {
    case 'en':
      return 'English';
    case 'da':
      return 'Dansk';
    case 'de':
      return 'Deutsch';
    case 'es':
      return 'Español';
    case 'fr':
      return 'Français';
    case 'it':
      return 'Italiano';
    case 'nl':
      return 'Nederlands';
    case 'pt-BR':
      return 'Português (Brasil)';
    case 'ro':
      return 'Română';
    case 'sl':
      return 'Slovenščina';
    case 'sv':
      return 'Svenska';
    case 'ta':
      return 'தமிழ்';
    default:
      return langCode;
  }
};