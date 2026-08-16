import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncAppLanguageFromSystem } from '../localization';
import { addLog } from '../services/LogService';

/**
 * Registers an AppState foreground resync for language changes made outside the
 * app. Android adopts external App Languages edits. iOS re-reads the OS-owned
 * per-app locale defensively, but an iOS language change takes effect after the
 * OS restarts the app; this hook is not a live language switch mechanism.
 *
 * The resync promise is never left floating: every rejection is caught and
 * logged so an AppState callback can never produce an unhandled rejection.
 */
export function useAppLanguageForegroundSync(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncAppLanguageFromSystem().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          void addLog(`[AppLanguage] Foreground resync failed: ${message}`, 'ERROR');
        });
      }
    });
    return () => subscription.remove();
  }, []);
}
