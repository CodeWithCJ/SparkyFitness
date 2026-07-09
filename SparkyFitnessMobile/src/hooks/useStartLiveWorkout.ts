import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PresetSessionExerciseRequest } from '@workspace/shared';
import { useCreateWorkout } from './useExerciseMutations';
import { flushActiveWorkoutBeforeClear } from './useActiveWorkoutAutosave';
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

  // The actual create → seed store → navigate flow, run once the active-session
  // guard has cleared. Split out so the "replace current workout?" prompt can
  // clear the in-progress session and then call straight through.
  const runStart = useCallback(
    async ({ name, exercises }: StartLiveWorkoutArgs) => {
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
          // The lock stays engaged: the replace unmounts the calling screen.
        } else {
          // The caller may still be mounted under a pushed screen — release
          // the lock so it isn't stuck on "Starting…" forever. (A popped
          // caller is unmounted and the resets are harmless no-ops.)
          inFlightRef.current = false;
          setIsStarting(false);
        }
      } catch {
        // useCrudMutation already showed the failure toast; re-enable the UI.
        inFlightRef.current = false;
        setIsStarting(false);
      }
    },
    [createSession, invalidateCache, navigation],
  );

  const startLiveWorkout = useCallback(
    async (args: StartLiveWorkoutArgs) => {
      if (!queryClient.getQueryData(serverConnectionQueryKey)) {
        Alert.alert(
          'No Server Connected',
          'Configure your server connection in Settings to start a workout.',
        );
        return;
      }
      if (useActiveWorkoutStore.getState().sessionId !== null) {
        Alert.alert(
          'Replace current workout?',
          'You already have a workout in progress. Starting a new one clears it here — any sets already saved stay in your diary.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear & Start',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  // Best-effort save of the in-progress session before dropping
                  // it locally, mirroring the HUD's Clear action.
                  await flushActiveWorkoutBeforeClear(queryClient);
                  useActiveWorkoutStore.getState().clearWorkout();
                  await runStart(args);
                })();
              },
            },
          ],
        );
        return;
      }
      await runStart(args);
    },
    [queryClient, runStart],
  );

  return { startLiveWorkout, isStarting };
}
