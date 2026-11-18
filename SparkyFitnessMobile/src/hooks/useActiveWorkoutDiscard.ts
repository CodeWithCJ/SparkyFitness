import { queueWorkoutSessionDelete } from '../offline/workoutHandOver';
import { serverMayBeDown } from '../utils/serverErrors';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import type { QueryClient } from '@tanstack/react-query';
import type { PresetSessionResponse } from '@workspace/shared';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { deleteWorkout } from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { normalizeDate } from '../utils/dateUtils';

interface UseActiveWorkoutDiscardArgs {
  sessionId: string | null;
  session: PresetSessionResponse | null;
  createdByLiveStart: boolean;
  queryClient: QueryClient;
  safeGoBack: () => void;
}

export function useActiveWorkoutDiscard({
  sessionId,
  session,
  createdByLiveStart,
  queryClient,
  safeGoBack,
}: UseActiveWorkoutDiscardArgs): {
  handleDiscard: () => void;
} {
  const { t } = useTranslation();

  const handleDiscard = useCallback(() => {
    // Live-start sessions exist on the server only because the user hit Start,
    // so discarding deletes them instead of leaving a stray diary workout.
    // Sessions started from WorkoutDetail keep their keep-server-edits discard.
    if (createdByLiveStart && sessionId != null) {
      const idToDelete = sessionId;
      // entry_date can round-trip as an ISO timestamp; un-normalized it would
      // silently miss the daily-summary cache key on invalidation.
      const entryDate =
        session?.entry_date != null ? normalizeDate(session.entry_date) : null;
      Alert.alert(
        t('workout.discardWorkoutTitle', { defaultValue: 'Discard workout?' }),
        t('workout.discardWorkoutMessage', {
          defaultValue: 'This deletes the workout from your diary.',
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('workout.discard', { defaultValue: 'Discard' }),
            style: 'destructive',
            onPress: () => {
              // Clear and exit first: clearing cancels the pending autosave
              // debounce and frees the user immediately; the delete finishes in
              // the background (a racing autosave 404s harmlessly server-side).
              // Read before the clear wipes it: whether the server can hold
              // this session at all. One started with no connection and never
              // sent exists only on this phone, so there is nothing to delete.
              const { pendingCreate, createAttempted } =
                useActiveWorkoutStore.getState();
              const neverSent = pendingCreate != null && !createAttempted;
              useActiveWorkoutStore
                .getState()
                .clearWorkout({ discarded: true });
              safeGoBack();
              if (neverSent) return;
              deleteWorkout(idToDelete)
                .then(() => {
                  if (entryDate != null)
                    invalidateExerciseCache(queryClient, entryDate);
                })
                .catch(async (error: unknown) => {
                  // The server is away: queue the removal so the workout does
                  // not stay in the diary once it is back.
                  if (
                    serverMayBeDown(error) &&
                    (await queueWorkoutSessionDelete(idToDelete))
                  ) {
                    return;
                  }
                  addLog(
                    `Failed to delete discarded live-start workout: ${error}`,
                    'ERROR'
                  );
                  Toast.show({
                    type: 'error',
                    text1: t('workout.couldntDelete', {
                      defaultValue: "Couldn't delete workout",
                    }),
                    text2: t('workout.remainsInDiary', {
                      defaultValue: 'It remains in your diary.',
                    }),
                  });
                });
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      t('workout.discardWorkoutTitle', { defaultValue: 'Discard workout?' }),
      t('workout.clearWorkoutMessage', {
        defaultValue:
          'Clears your progress on this device and drops unsaved changes. Edits already saved to the server are kept.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('workout.discard', { defaultValue: 'Discard' }),
          style: 'destructive',
          onPress: () => {
            useActiveWorkoutStore.getState().clearWorkout({ discarded: true });
            safeGoBack();
          },
        },
      ]
    );
  }, [createdByLiveStart, sessionId, session, queryClient, safeGoBack, t]);

  return { handleDiscard };
}
