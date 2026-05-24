// In a real-world scenario, this list would be fetched dynamically from a server-side endpoint
// that reads the contents of the public/locales directory.
// For this task, we are hardcoding the languages found in the public/locales directory.
export const getSupportedLanguages = (): string[] => {
  return [
    'ar',
    'cs',
    'da',
    'de',
    'en',
    'es',
    'fi',
    'fr',
    'hr',
    'hu',
    'id',
    'it',
    'ja',
    'kk',
    'ko',
    'lv',
    'nl',
    'pl',
    'pt-BR',
    'ro',
    'ru',
    'sk',
    'sl',
    'sv',
    'ta',
    'uk',
    'zh-Hans',
  ];
};

export const getLanguageDisplayName = (langCode: string): string => {
  switch (langCode) {
    case 'ar':
      return 'العربية';
    case 'cs':
      return 'Čeština';
    case 'da':
      return 'Dansk';
    case 'de':
      return 'Deutsch';
    case 'en':
      return 'English';
    case 'es':
      return 'Español';
    case 'fi':
      return 'Suomi';
    case 'fr':
      return 'Français';
    case 'hr':
      return 'Hrvatski';
    case 'hu':
      return 'Magyar';
    case 'id':
      return 'Bahasa Indonesia';
    case 'it':
      return 'Italiano';
    case 'ja':
      return '日本語';
    case 'kk':
      return 'Қазақ тілі';
    case 'ko':
      return '한국어';
    case 'lv':
      return 'Latviešu';
    case 'nl':
      return 'Nederlands';
    case 'pl':
      return 'Polski';
    case 'pt-BR':
      return 'Português (Brasil)';
    case 'ro':
      return 'Română';
    case 'ru':
      return 'Русский';
    case 'sk':
      return 'Slovenčina';
    case 'sl':
      return 'Slovenščina';
    case 'sv':
      return 'Svenska';
    case 'ta':
      return 'தமிழ்';
    case 'uk':
      return 'Українська';
    case 'zh-Hans':
      return '简体中文';
    default:
      return langCode;
  }
};
