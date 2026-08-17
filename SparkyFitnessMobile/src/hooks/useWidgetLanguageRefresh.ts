import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import i18n from '../localization/i18n';
import type { LanguagePreference } from '../localization';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { CalorieWidgetBridge } from '../services/CalorieWidgetBridge';
import { addLog } from '../services/LogService';

type WidgetSyncState = {
  preference: LanguagePreference;
  effectiveLanguage: 'en' | 'pl';
};

/**
 * Keeps Android Glance widgets synchronized with the app language model.
 *
 * On Android 13+ LocaleManager/PR3 remains authoritative. The native bridge
 * also receives the effective i18next language and commits it as a rendering
 * cache before reload. That cache is not a preference or locale authority; it
 * only bridges the live-process configuration-change window deterministically.
 * Android <=12 continues to use the widget-only en/pl override.
 *
 * Runs are serialized and deduped by {preference, effectiveLanguage}. Locale
 * preparation must complete before either widget reload. Any preparation or
 * partial reload failure leaves the state unapplied so a later signal retries.
 */
export function useWidgetLanguageRefresh(): void {
  const languagePreference = useAppPreferencesStore((s) => s.languagePreference);
  const lastAppliedRef = useRef<WidgetSyncState | null>(null);
  const inFlightRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const runSync = async (): Promise<void> => {
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
        await CalorieWidgetBridge.prepareWidgetLocale(
          desired.preference,
          desired.effectiveLanguage,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void addLog(
          `[useWidgetLanguageRefresh] Widget locale preparation failed: ${message}`,
          'ERROR',
        );
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

    const syncWidgets = (): void => {
      inFlightRef.current = inFlightRef.current.then(runSync, runSync);
    };

    syncWidgets();

    const onLanguageChanged = () => {
      syncWidgets();
    };
    i18n.on('languageChanged', onLanguageChanged);

    return () => {
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, [languagePreference]);
}
