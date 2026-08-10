import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import i18n from '../localization/i18n';
import type { LanguagePreference } from '../localization';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { CalorieWidgetBridge } from '../services/CalorieWidgetBridge';
import { addLog } from '../services/LogService';

/**
 * The exact state the widget layer was last fully synced to. Dedupe only
 * against a state whose override write/remove AND both widget reloads
 * succeeded — a failure leaves the previous value in place so the next signal
 * retries the whole flow.
 */
type WidgetSyncState = {
  preference: LanguagePreference;
  effectiveLanguage: 'en' | 'pl';
};

/**
 * Keeps the Android Glance widgets in sync with the app language model.
 *
 * Glance is a separate native surface: on Android 13+ the platform per-app
 * language (LocaleManager) drives widget resources natively, but on Android
 * <=12 the explicit app language is local to the RN app, so the widgets need
 * a widget-only locale override (see WidgetLocale.kt). `system` means NO
 * override — the key is removed and the widgets follow the native/device
 * locale.
 *
 * Both signals trigger a sync:
 *   1. `languagePreference` changes (explicit -> system must clear the
 *      override even when the effective i18n language stays the same);
 *   2. effective i18n language changes (e.g. device language change with
 *      `system` preference).
 *
 * The override write/remove happens first; a failure rejects and stays
 * retryable. Reloads run independently: a failure in one widget never blocks
 * the other, never rejects out of the hook, and never marks the state applied,
 * so a later signal retries the failed widget too.
 */
export function useWidgetLanguageRefresh(): void {
  const languagePreference = useAppPreferencesStore((s) => s.languagePreference);
  const lastAppliedRef = useRef<WidgetSyncState | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const syncWidgets = async (): Promise<void> => {
      const preference = useAppPreferencesStore.getState().languagePreference;
      const effectiveLanguage: 'en' | 'pl' =
        i18n.resolvedLanguage === 'pl' ? 'pl' : 'en';
      const desired: WidgetSyncState = { preference, effectiveLanguage };

      if (
        lastAppliedRef.current !== null &&
        lastAppliedRef.current.preference === desired.preference &&
        lastAppliedRef.current.effectiveLanguage === desired.effectiveLanguage
      ) {
        return;
      }

      try {
        await CalorieWidgetBridge.setWidgetLocale(
          desired.preference === 'system' ? null : desired.preference,
        );
      } catch {
        void addLog('[useWidgetLanguageRefresh] Widget locale override write failed', 'ERROR');
        return;
      }

      const results = await Promise.allSettled([
        CalorieWidgetBridge.reloadWidget(),
        CalorieWidgetBridge.reloadMacroWidget(),
      ]);

      const [calorieResult, macroResult] = results;
      let fullyApplied = true;
      if (calorieResult.status === 'rejected') {
        void addLog('[useWidgetLanguageRefresh] Calorie widget reload failed', 'ERROR');
        fullyApplied = false;
      }
      if (macroResult.status === 'rejected') {
        void addLog('[useWidgetLanguageRefresh] Macro widget reload failed', 'ERROR');
        fullyApplied = false;
      }
      if (!fullyApplied) return;

      lastAppliedRef.current = desired;
    };

    // Cold start: apply the persisted preference to already-placed instances
    // that may have been rendered before the language state was set.
    void syncWidgets();

    const onLanguageChanged = () => {
      void syncWidgets();
    };
    i18n.on('languageChanged', onLanguageChanged);

    return () => {
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, [languagePreference]);
}
