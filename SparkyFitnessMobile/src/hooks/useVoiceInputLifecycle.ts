import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuiEvent } from '@assistant-ui/react-native';

export type VoiceCancellationReason =
  'background' | 'blur' | 'unmount' | 'run-start';

/** Voice capture is foreground-only, including while its permission dialog is pending. */
export function useVoiceInputLifecycle(
  cancel: (reason: VoiceCancellationReason) => void
) {
  const navigation = useNavigation();
  // Quick replies and retries bypass the composer Send button.
  useAuiEvent('thread.runStart', () => cancel('run-start'));
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
