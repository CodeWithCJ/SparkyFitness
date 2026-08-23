export {
  initializeAppLanguage,
  setAppLanguagePreference,
  syncAppLanguageFromSystem,
} from './appLanguage';
export {
  SUPPORTED_LANGUAGES,
  SHIPPED_LOCALES,
  formatLocalizedNumber,
  getAppLocale,
  useAppLocale,
  getDeviceLanguage,
  getNativeIOSLanguage,
  initializeI18n,
  normalizeLanguage,
  type LanguagePreference,
  type SupportedLanguage,
} from './i18n';
export { metadataForLanguage, normalizeRegisteredLocale, nativeLanguageTags } from './localeRegistry';
