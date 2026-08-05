import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { syncAppLanguageFromSystem } from '../localization';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

/**
 * Registers an AppState foreground resync for language changes made outside the
 * app. On Android the listener stays active for every preference value so
 * Android App Languages edits are adopted. On iOS the resync only matters while
 * following the system language, so the listener is skipped for explicit values.
 */
export function useAppLanguageForegroundSync(): void {
  const languagePreference = useAppPreferencesStore((s) => s.languagePreference);

  useEffect(() => {
    if (Platform.OS === 'ios' && languagePreference !== 'system') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncAppLanguageFromSystem();
      }
    });
    return () => subscription.remove();
  }, [languagePreference]);
}