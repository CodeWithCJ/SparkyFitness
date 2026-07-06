import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PresetSessionExerciseRequest } from '@workspace/shared';
import { useCreateWorkout } from './useExerciseMutations';
import { serverConnectionQueryKey } from './queryKeys';
import { defaultWorkoutName } from './useWorkoutForm';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { ensureNotificationPermission } from '../services/notifications';
import { getTodayDate } from '../utils/dateUtils';
import type { RootStackParamList } from '../types/navigation';

type StartLiveWorkoutNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList>,
  'replace' | 'isFocused'
>;

interface StartLiveWorkoutArgs {
  /** Session name; defaults to the form path's dated name ("Workout - Jul 6"). */
  name?: string;
  exercises: PresetSessionExerciseRequest[];
}

/**
 * Create a session server-side and enter the live ActiveWorkout screen.
 *
 * Shared by the instant preset start and the empty (first-exercise-first)
 * start. Owns the guard ordering: connection → no-other-workout → non-empty
 * payload → single-flight create → seed the store BEFORE navigating (the
 * ActiveWorkout screen auto-pops when entered without a session) → replace.
 * The replace is skipped when the calling screen lost focus mid-create (a
 * replace dispatched from an unfocused route is an unhandled action); the
 * session and store are already live, so the HUD bar covers re-entry.
 */
export function useStartLiveWorkout(navigation: StartLiveWorkoutNavigation): {
  startLiveWorkout: (args: StartLiveWorkoutArgs) => Promise<void>;
  isStarting: boolean;
} {
  const queryClient = useQueryClient();
  const { createSession, invalidateCache } = useCreateWorkout();
  const inFlightRef = useRef(false);
  const [isStarting, setIsStarting] = useState(false);

  const startLiveWorkout = useCallback(
    async ({ name, exercises }: StartLiveWorkoutArgs) => {
      if (!queryClient.getQueryData(serverConnectionQueryKey)) {
        Alert.alert(
          'No Server Connected',
          'Configure your server connection in Settings to start a workout.',
        );
        return;
      }
      if (useActiveWorkoutStore.getState().sessionId !== null) {
        Alert.alert('Another workout is in progress', 'Finish or clear it first.');
        return;
      }
      if (exercises.length === 0) {
        Toast.show({
          type: 'error',
          text1: 'Nothing to start',
          text2: 'This preset has no exercises.',
        });
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsStarting(true);

      const entryDate = getTodayDate();
      try {
        const session = await createSession({
          name: name ?? defaultWorkoutName(entryDate),
          entry_date: entryDate,
          source: 'sparky',
          exercises,
        });
        invalidateCache(entryDate);
        void ensureNotificationPermission();
        useActiveWorkoutStore.getState().startWorkout(session, { createdByLiveStart: true });
        if (navigation.isFocused()) {
          navigation.replace('ActiveWorkout');
        }
        // The lock stays engaged on success: the replace unmounts the calling
        // screen, and an unfocused caller was already popped by the user.
      } catch {
        // useCrudMutation already showed the failure toast; re-enable the UI.
        inFlightRef.current = false;
        setIsStarting(false);
      }
    },
    [queryClient, createSession, invalidateCache, navigation],
  );

  return { startLiveWorkout, isStarting };
}
