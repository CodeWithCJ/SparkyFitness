import { useEffect } from 'react';
import { Platform } from 'react-native';

import i18n from '../localization/i18n';
import { CalorieWidgetBridge } from '../services/CalorieWidgetBridge';
import { addLog } from '../services/LogService';

/**
 * Re-renders all Android Glance widget instances whenever the effective app
 * locale changes. Widget labels and units are resolved from Android resources
 * at render time, so a reload after `i18n.resolvedLanguage` changes picks up
 * the new language without writing any business data. Runs only on Android.
 *
 * Reloads run independently: a failure in one widget is logged in isolation and
 * never blocks the other widget, never rejects out of `reloadAllWidgets` (so the
 * hook cannot throw into React), and never loops language state.
 */
export function useWidgetLanguageRefresh(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const reloadAllWidgets = async (): Promise<void> => {
      const results = await Promise.allSettled([
        CalorieWidgetBridge.reloadWidget(),
        CalorieWidgetBridge.reloadMacroWidget(),
      ]);

      const [calorieResult, macroResult] = results;
      if (calorieResult.status === 'rejected') {
        void addLog('[useWidgetLanguageRefresh] Calorie widget reload failed', 'ERROR');
      }
      if (macroResult.status === 'rejected') {
        void addLog('[useWidgetLanguageRefresh] Macro widget reload failed', 'ERROR');
      }
    };

    // Cold start: apply the current AppCompat locale to already-placed
    // instances that may have been rendered before a language change.
    void reloadAllWidgets();

    const onLanguageChanged = () => {
      void reloadAllWidgets();
    };
    i18n.on('languageChanged', onLanguageChanged);

    return () => {
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, []);
}
