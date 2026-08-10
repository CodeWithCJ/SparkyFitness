import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { syncAppLanguageFromSystem } from '../localization';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from '../services/LogService';

/**
 * Registers an AppState foreground resync for language changes made outside the
 * app. On Android the listener stays active for every preference value so the
 * platform App Languages edits are adopted. On iOS the resync only matters
 * while following the system language, so the listener is skipped for explicit
 * values.
 *
 * The resync promise is never left floating: every rejection is caught and
 * logged so an AppState callback can never produce an unhandled rejection.
 */
export function useAppLanguageForegroundSync(): void {
  const languagePreference = useAppPreferencesStore((s) => s.languagePreference);

  useEffect(() => {
    if (Platform.OS === 'ios' && languagePreference !== 'system') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncAppLanguageFromSystem().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          void addLog(`[AppLanguage] Foreground resync failed: ${message}`, 'ERROR');
        });
      }
    });
    return () => subscription.remove();
  }, [languagePreference]);
}
