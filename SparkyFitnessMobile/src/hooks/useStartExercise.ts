import { useCallback } from 'react';
import { Alert } from 'react-native';
import { loadActiveDraft, clearDraft } from '../services/workoutDraftService';
import { queryClient } from './queryClient';
import { serverConnectionQueryKey } from './queryKeys';

interface NavigateFn {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
}

interface UseStartExerciseOptions {
  navigation: NavigateFn;
  /** Optional callback to get a date to pass to ExerciseSearch */
  getDate?: () => string | undefined;
  /** Preferred target when the selected exercise is ambiguous (default: activity) */
  entryTarget?: 'workout' | 'activity';
}

/**
 * Encapsulates the "add exercise" flow: connection check → draft check → navigate.
 * Used by WorkoutsScreen and the AddSheet entry point in App.tsx.
 */
export function useStartExercise({ navigation, getDate, entryTarget }: UseStartExerciseOptions) {
  const startExercise = useCallback(async () => {
    const isConnected = queryClient.getQueryData(serverConnectionQueryKey);
    if (!isConnected) {
      Alert.alert(
        'No Server Connected',
        'Configure your server connection in Settings to add an exercise.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
          },
        ],
      );
      return;
    }

    const date = getDate?.();

    const draft = await loadActiveDraft();
    if (draft) {
      Alert.alert(
        'Draft in Progress',
        `You have an unsaved ${draft.type === 'workout' ? 'workout' : 'activity'} draft. What would you like to do?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Resume Draft',
            onPress: () => {
              if (draft.type === 'workout') {
                navigation.navigate('WorkoutForm');
              } else {
                navigation.navigate('ActivityForm');
              }
            },
          },
          {
            text: 'Discard & Continue',
            style: 'destructive',
            onPress: async () => {
              await clearDraft();
              navigation.navigate('ExerciseSearch', { mode: 'entry', date, entryTarget });
            },
          },
        ],
      );
      return;
    }

    navigation.navigate('ExerciseSearch', { mode: 'entry', date, entryTarget });
  }, [navigation, getDate, entryTarget]);

  return startExercise;
}
