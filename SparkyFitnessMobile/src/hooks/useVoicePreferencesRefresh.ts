import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** Pick up voice choices made on another client when returning to the screen/app. */
export function useVoicePreferencesRefresh(
  refetch: () => void,
  enabled = true
) {
  useRefetchOnFocus(refetch, enabled, 0);
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => subscription.remove();
  }, [enabled, refetch]);
}
