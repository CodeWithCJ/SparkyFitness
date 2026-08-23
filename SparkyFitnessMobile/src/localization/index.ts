export {
  initializeAppLanguage,
  setAppLanguagePreference,
  syncAppLanguageFromSystem,
} from './appLanguage';
export {
  SUPPORTED_LANGUAGES,
  RESOURCE_MAP,
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
export {
  SOURCE_LOCALE,
  FALLBACK_LOCALE,
  SHIPPED_LOCALES,
  metadataForLanguage,
  normalizeRegisteredLocale,
  nativeLanguageTags,
} from './localeRegistry';
