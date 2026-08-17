import { useEffect, useRef } from 'react';

import { ExtensionStorage } from '@bacons/apple-targets';
import { Platform } from 'react-native';

import i18n from '../localization/i18n';
import { addLog } from '../services/LogService';

const WIDGET_KIND = 'widget';
const MACRO_WIDGET_KIND = 'macroWidget';

/**
 * The exact state the WidgetKit layer was last fully synced to. Dedupe only
 * against a state whose timeline reloads succeeded — a failure leaves the
 * previous value in place so the next signal retries the whole flow.
 */
type IOSWidgetSyncState = {
  effectiveLanguage: 'en' | 'pl';
};

/**
 * Keeps the WidgetKit extension in sync with the effective app language.
 *
 * Final PR3 model: iOS per-app language is OS-authoritative — the app reads
 * the locale from iOS and never persists a competing widget-only override.
 * WidgetKit resolves its own localized resources and number formatting from
 * its native locale, so this hook only reloads the existing widget timelines
 * after the app language is initialized or changes (e.g. the user changes the
 * per-app language in iOS Settings and returns to the app).
 *
 * Signals:
 *   1. `initialized` (or already-initialized i18n on mount) — cold start;
 *   2. `languageChanged` — effective language changed.
 *
 * Reloads are deduped by the effective en/pl language, serialized so a later
 * signal can never lose to an in-flight run, and independent per timeline: a
 * failure in one widget never blocks the other, never rejects out of the hook,
 * and never marks the state applied, so the next signal retries.
 */
export function useIOSWidgetLanguageRefresh(): void {
  const lastAppliedRef = useRef<IOSWidgetSyncState | null>(null);
  // Serializes sync runs so a later language change can never lose to an
  // in-flight reload (two overlapping runs could otherwise reload timelines
  // out of order while the ref claims the newer state, with no retry path
  // because the dedupe check would then short-circuit). Each queued run
  // recomputes the desired state when it actually executes, so the last run
  // always lands on the newest effective language.
  const inFlightRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const runSync = async (): Promise<void> => {
      const effectiveLanguage: 'en' | 'pl' =
        i18n.resolvedLanguage === 'pl' ? 'pl' : 'en';
      const desired: IOSWidgetSyncState = { effectiveLanguage };

      if (
        lastAppliedRef.current !== null &&
        lastAppliedRef.current.effectiveLanguage === desired.effectiveLanguage
      ) {
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

    const enqueueSync = (): void => {
      inFlightRef.current = inFlightRef.current.then(runSync, runSync);
    };

    if (i18n.isInitialized) {
      enqueueSync();
    }
    const onInitialized = () => {
      enqueueSync();
    };
    const onLanguageChanged = () => {
      enqueueSync();
    };
    i18n.on('initialized', onInitialized);
    i18n.on('languageChanged', onLanguageChanged);

    return () => {
      i18n.off('initialized', onInitialized);
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, []);
}
