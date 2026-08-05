import { useEffect } from 'react';
import { Platform } from 'react-native';

import i18n from '../localization/i18n';
import { CalorieWidgetBridge } from '../services/CalorieWidgetBridge';

/**
 * Re-renders all Android Glance widget instances whenever the effective app
 * locale changes. Widget labels and units are resolved from Android resources
 * at render time, so a reload after `i18n.resolvedLanguage` changes picks up
 * the new language without writing any business data. Runs only on Android.
 */
export function useWidgetLanguageRefresh(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const reloadAllWidgets = () => {
      void CalorieWidgetBridge.reloadWidget();
      void CalorieWidgetBridge.reloadMacroWidget();
    };

    // Cold start: apply the current AppCompat locale to already-placed
    // instances that may have been rendered before a language change.
    reloadAllWidgets();

    const onLanguageChanged = () => {
      reloadAllWidgets();
    };
    i18n.on('languageChanged', onLanguageChanged);

    return () => {
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, []);
}
