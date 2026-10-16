/**
 * Resolves the app language to a regional locale the platform speech
 * recognizer accepts. iOS rejects bare language codes such as `en`
 * ("Locale en is not supported by the speech recognizer"), so a bare code is
 * expanded using the device's own region for that language, then a default.
 */
const DEFAULT_REGION_BY_LANGUAGE: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
};

export function resolveSpeechLocale(
  language: string,
  deviceLanguageTags: readonly string[]
): string {
  if (language.includes('-')) return language;

  const match = deviceLanguageTags.find((tag) => {
    const [code, ...rest] = tag.split('-');
    return code === language && rest.length > 0;
  });
  if (match) return match;

  return DEFAULT_REGION_BY_LANGUAGE[language] ?? language;
}
