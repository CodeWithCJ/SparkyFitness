import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PresetSessionExerciseRequest } from '@workspace/shared';
import { useCreateWorkout } from './useExerciseMutations';
import { flushActiveWorkoutBeforeClear } from './useActiveWorkoutAutosave';
import { serverConnectionQueryKey } from './queryKeys';
import { defaultWorkoutName } from './useWorkoutForm';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import {
  ensureNotificationPermission,
  maybePromptForExactAlarmPermission,
} from '../services/notifications';
import { getTodayDate } from '../utils/dateUtils';
import { extractPlannedSetValues, stripPlannedSetValues } from '../utils/workoutSession';
import type { RootStackParamList } from '../types/navigation';

type StartLiveWorkoutNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList>,
  'replace' | 'isFocused' | 'navigate'
>;

interface StartLiveWorkoutArgs {
  /** Session name; defaults to the form path's dated name ("Workout - Jul 6"). */
  name?: string;
  exercises: PresetSessionExerciseRequest[];
}

/**
 * When another workout is already live, prompt before starting a new one:
 * go to the active workout screen, or clear it and start fresh (with a
 * best-effort save first, mirroring the HUD's Clear action). Returns true
 * when a workout was active — the prompt owns the flow and the caller must
 * bail out; false means no conflict and the caller may start directly.
 */
export function promptForActiveWorkoutConflict(
  queryClient: QueryClient,
  options: {
    /** "Go to Workout": open the ActiveWorkout screen, leaving the session live. */
    onGoToWorkout: () => void;
    /** "Clear & Start": runs after the flush and store clear. */
    onClearAndStart: () => void | Promise<void>;
  },
): boolean {
  if (useActiveWorkoutStore.getState().sessionId === null) return false;
  Alert.alert(
    'Workout in progress',
    'You already have a workout in progress. Starting another clears it here. Any sets already saved stay in your diary.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Go to Workout', onPress: options.onGoToWorkout },
      {
        text: 'Clear & Start',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await flushActiveWorkoutBeforeClear(queryClient);
            useActiveWorkoutStore.getState().clearWorkout();
            await options.onClearAndStart();
          })();
        },
      },
    ],
  );
  return true;
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
  // guard has cleared. Split out so the "Workout in progress" prompt can
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
        // Hevy-style start: sets are created with empty weight/reps — the
        // plan renders as gray placeholders and is only recorded when a set
        // is completed or typed over.
        const plannedSetValues = extractPlannedSetValues(exercises);
        const session = await createSession({
          name: name ?? defaultWorkoutName(entryDate),
          entry_date: entryDate,
          source: 'sparky',
          exercises: stripPlannedSetValues(exercises),
        });
        invalidateCache(entryDate);
        // Chained so the exact-alarm prompt never stacks on top of the OS
        // notification-permission dialog.
        void ensureNotificationPermission().then(() =>
          maybePromptForExactAlarmPermission(),
        );
        useActiveWorkoutStore
          .getState()
          .startWorkout(session, { createdByLiveStart: true, plannedSetValues });
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
      const prompted = promptForActiveWorkoutConflict(queryClient, {
        onGoToWorkout: () => navigation.navigate('ActiveWorkout'),
        onClearAndStart: () => runStart(args),
      });
      if (prompted) return;
      await runStart(args);
    },
    [queryClient, navigation, runStart],
  );

  return { startLiveWorkout, isStarting };
}
