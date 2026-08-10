import { useEffect, useRef } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import i18n from '../localization/i18n';
import type { LanguagePreference } from '../localization';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from '../services/LogService';

const WIDGET_KIND = 'widget';
const MACRO_WIDGET_KIND = 'macroWidget';
const WIDGET_LOCALE_KEY = 'widgetLocale';

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

/**
 * The exact state the WidgetKit layer was last fully synced to. Dedupe only
 * against a state whose override write/remove AND both timeline reloads
 * succeeded — a failure leaves the previous value in place so the next signal
 * retries the whole flow.
 */
type IOSWidgetSyncState = {
  preference: LanguagePreference;
  effectiveLanguage: 'en' | 'pl';
};

/**
 * Keeps the WidgetKit extension in sync with the persisted app-language
 * preference. The extension resolves its own locale from the system / iOS
 * per-app language, which can differ from the in-app language selector, so the
 * shared app group carries an explicit override:
 *
 *   preference "en"    -> write widgetLocale = "en", reload both timelines
 *   preference "pl"    -> write widgetLocale = "pl", reload both timelines
 *   preference "system" -> REMOVE widgetLocale (follow the extension's native
 *                          locale), reload both timelines
 *
 * Both signals trigger a sync:
 *   1. `languagePreference` changes (explicit -> system must remove the key
 *      even when the effective i18n language stays the same);
 *   2. effective i18n language changes (e.g. device language change with
 *      `system` preference).
 *
 * The override write/remove happens first; a failure rejects and stays
 * retryable. The two timeline reloads run independently: a failure in either
 * keeps the state unapplied so the next signal retries. There is no automatic
 * retry timer.
 */
export function useIOSWidgetLanguageRefresh(): void {
  const languagePreference = useAppPreferencesStore((s) => s.languagePreference);
  const lastAppliedRef = useRef<IOSWidgetSyncState | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !iosAppGroup) return;

    const applySync = async (): Promise<void> => {
      const preference = useAppPreferencesStore.getState().languagePreference;
      const effectiveLanguage: 'en' | 'pl' =
        i18n.resolvedLanguage === 'pl' ? 'pl' : 'en';
      const desired: IOSWidgetSyncState = { preference, effectiveLanguage };

      if (
        lastAppliedRef.current !== null &&
        lastAppliedRef.current.preference === desired.preference &&
        lastAppliedRef.current.effectiveLanguage === desired.effectiveLanguage
      ) {
        return;
      }

      try {
        const storage = new ExtensionStorage(iosAppGroup);
        if (desired.preference === 'system') {
          storage.remove(WIDGET_LOCALE_KEY);
        } else {
          storage.set(WIDGET_LOCALE_KEY, desired.preference);
        }
      } catch (error) {
        addLog(
          `[useIOSWidgetLanguageRefresh] Failed to update widget locale: ${error}`,
          'ERROR',
        );
        return;
      }

      let fullyApplied = true;
      try {
        ExtensionStorage.reloadWidget(WIDGET_KIND);
      } catch (error) {
        addLog(
          `[useIOSWidgetLanguageRefresh] Calorie widget reload failed: ${error}`,
          'ERROR',
        );
        fullyApplied = false;
      }
      try {
        ExtensionStorage.reloadWidget(MACRO_WIDGET_KIND);
      } catch (error) {
        addLog(
          `[useIOSWidgetLanguageRefresh] Macro widget reload failed: ${error}`,
          'ERROR',
        );
        fullyApplied = false;
      }
      if (!fullyApplied) return;

      lastAppliedRef.current = desired;
    };

    if (i18n.isInitialized) {
      void applySync();
    }
    const onInitialized = () => {
      void applySync();
    };
    const onLanguageChanged = () => {
      void applySync();
    };
    i18n.on('initialized', onInitialized);
    i18n.on('languageChanged', onLanguageChanged);

    return () => {
      i18n.off('initialized', onInitialized);
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, [languagePreference]);
}
