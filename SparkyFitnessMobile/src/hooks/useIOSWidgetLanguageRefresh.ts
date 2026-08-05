import { useEffect, useRef } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import i18n from '../localization/i18n';
import { addLog } from '../services/LogService';

const WIDGET_KIND = 'widget';
const MACRO_WIDGET_KIND = 'macroWidget';
const WIDGET_LOCALE_KEY = 'widgetLocale';

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

/**
 * Keeps the WidgetKit extension in sync with the effective app locale. The
 * extension resolves its own locale from the system / iOS per-app language,
 * which can differ from the in-app language selector, so the effective JS
 * locale is written into the shared app group and both widget timelines are
 * reloaded. Runs only on iOS; no-op on Android.
 */
export function useIOSWidgetLanguageRefresh(): void {
  const lastWrittenLocaleRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !iosAppGroup) return;

    const applyLocale = () => {
      const locale = i18n.resolvedLanguage === 'pl' ? 'pl' : 'en';
      if (lastWrittenLocaleRef.current === locale) return;
      lastWrittenLocaleRef.current = locale;

      try {
        const storage = new ExtensionStorage(iosAppGroup);
        storage.set(WIDGET_LOCALE_KEY, locale);
        ExtensionStorage.reloadWidget(WIDGET_KIND);
        ExtensionStorage.reloadWidget(MACRO_WIDGET_KIND);
      } catch (error) {
        addLog(
          `[useIOSWidgetLanguageRefresh] Failed to refresh widget locale: ${error}`,
          'ERROR',
        );
      }
    };

    if (i18n.isInitialized) {
      applyLocale();
    }
    i18n.on('initialized', applyLocale);
    i18n.on('languageChanged', applyLocale);

    return () => {
      i18n.off('initialized', applyLocale);
      i18n.off('languageChanged', applyLocale);
    };
  }, []);
}
