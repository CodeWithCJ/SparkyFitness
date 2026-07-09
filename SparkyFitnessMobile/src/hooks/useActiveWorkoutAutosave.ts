import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { updateWorkout } from '../services/api/exerciseApi';
import { syncExerciseSessionInCache } from './syncExerciseSessionInCache';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { buildSessionExercisesPayload } from '../utils/workoutSession';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { addLog } from '../services/LogService';
import { normalizeDate } from '../utils/dateUtils';

export const AUTOSAVE_DEBOUNCE_MS = 1500;

export type ActiveWorkoutSaveOutcome = 'clean' | 'saved' | 'failed';

/**
 * One-shot save of the live session's unsaved edits. Shared by the autosave
 * hook and by callers that must flush without the hook mounted (the HUD's
 * workout-complete dismiss paths after a cold start).
 */
export async function saveActiveWorkoutSession(
  queryClient: QueryClient,
): Promise<ActiveWorkoutSaveOutcome> {
  const state = useActiveWorkoutStore.getState();
  if (!state.hasUnsavedChanges || state.sessionId == null || state.session == null) {
    return 'clean';
  }
  if (state.session.exercises.length === 0) {
    // The update schema rejects an empty exercises array. Nothing sensible to
    // autosave — the user emptied the session; leave the server copy as is
    // rather than destructively deleting it from a background save.
    addLog('Active workout autosave skipped: session has no exercises', 'WARNING');
    return 'clean';
  }

  const sentRevision = state.sessionRevision;
  // Entry-id order at send time: applyServerSession compares it against the
  // local session so a mid-flight reorder/delete can't be grafted positionally.
  const sentEntryIds = state.session.exercises.map((e) => e.id);
  try {
    const trimmedName = state.session.name.trim();
    const result = await updateWorkout(state.sessionId, {
      // Persist the (possibly renamed) session name; skip an empty string so
      // the server's min(1) name validation isn't tripped.
      ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
      exercises: buildSessionExercisesPayload(
        state.session,
        state.completedSetIds,
        state.prSetIds,
        state.startedAt,
      ),
    });
    useActiveWorkoutStore.getState().applyServerSession(result, sentRevision, sentEntryIds);
    syncExerciseSessionInCache(queryClient, result);
    return 'saved';
  } catch (error) {
    addLog('Active workout autosave failed', 'ERROR', [
      error instanceof Error ? error.message : String(error),
    ]);
    return 'failed';
  }
}

/**
 * Flush-if-dirty used before `clearWorkout()` from outside the active-workout
 * screen. Returns false when unsaved changes could not be saved, so callers
 * can confirm before discarding them. Invalidates date-keyed caches on
 * success — clearing the workout is a flush point.
 */
export async function flushActiveWorkoutBeforeClear(
  queryClient: QueryClient,
): Promise<boolean> {
  const entryDate = useActiveWorkoutStore.getState().session?.entry_date ?? null;
  const outcome = await saveActiveWorkoutSession(queryClient);
  if (outcome === 'saved' && entryDate) {
    invalidateExerciseCache(queryClient, normalizeDate(entryDate));
  }
  return outcome !== 'failed';
}

/**
 * Save-as-you-log for the active workout screen. Debounces on the store's
 * `sessionRevision`, keeps a single request in flight (a revision landing
 * mid-save queues exactly one trailing save), and folds every response back
 * through `applyServerSession` so recreated ids re-attach to completion state.
 *
 * Deliberately not `useCrudMutation`: that toasts on every failure, but
 * background retries must be silent — failures are logged, the store stays
 * dirty, and the user is told only at flush points (once per failure streak).
 * Date-keyed cache invalidation also happens only at flush, not per save.
 */
export function useActiveWorkoutAutosave(): {
  flush: () => Promise<boolean>;
} {
  const queryClient = useQueryClient();
  const sessionRevision = useActiveWorkoutStore((s) => s.sessionRevision);
  const hasUnsavedChanges = useActiveWorkoutStore((s) => s.hasUnsavedChanges);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const trailingRef = useRef(false);
  /** True once any save landed since the last date-cache invalidation. */
  const savedSinceInvalidateRef = useRef(false);
  /** Suppresses repeat flush-failure toasts until a save succeeds again. */
  const failureToastShownRef = useRef(false);

  const performSave = useCallback(async (): Promise<boolean> => {
    const outcome = await saveActiveWorkoutSession(queryClient);
    if (outcome === 'saved') {
      savedSinceInvalidateRef.current = true;
      failureToastShownRef.current = false;
    }
    return outcome !== 'failed';
  }, [queryClient]);

  const runSave = useCallback((): Promise<boolean> => {
    const existing = inFlightRef.current;
    if (existing) {
      trailingRef.current = true;
      return existing;
    }
    const promise = (async () => {
      try {
        let ok = await performSave();
        while (trailingRef.current) {
          trailingRef.current = false;
          ok = await performSave();
        }
        return ok;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [performSave]);

  // Debounced background save: every revision bump restarts the timer.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sessionRevision, hasUnsavedChanges, runSave]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const before = useActiveWorkoutStore.getState();
    const entryDate = before.session?.entry_date ?? null;
    const needsSave = before.hasUnsavedChanges || inFlightRef.current != null;
    const ok = needsSave ? await runSave() : true;

    if (ok) {
      if (savedSinceInvalidateRef.current && entryDate) {
        invalidateExerciseCache(queryClient, normalizeDate(entryDate));
        savedSinceInvalidateRef.current = false;
      }
    } else if (!failureToastShownRef.current) {
      failureToastShownRef.current = true;
      Toast.show({
        type: 'error',
        text1: 'Workout not saved',
        text2: 'Changes are kept on this device and will retry.',
      });
    }
    return ok;
  }, [queryClient, runSave]);

  return { flush };
}
