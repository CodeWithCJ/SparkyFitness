import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export type VoiceCancellationReason = 'background' | 'blur' | 'unmount';

/** Voice capture is foreground-only, including while its permission dialog is pending. */
export function useVoiceInputLifecycle(
  cancel: (reason: VoiceCancellationReason) => void
) {
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => cancel('blur'));
    const subscription = AppState.addEventListener('change', (state) => {
      // iOS permission dialogs can briefly be inactive without leaving the app.
      if (state === 'background') cancel('background');
    });
    return () => {
      unsubscribe();
      subscription.remove();
      cancel('unmount');
    };
  }, [cancel, navigation]);
}
