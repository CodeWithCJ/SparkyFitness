import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type { PresetSessionResponse } from '@workspace/shared';
import { updateWorkout } from '../services/api/exerciseApi';
import { ApiError } from '../services/api/errors';
import { syncExerciseSessionInCache } from './syncExerciseSessionInCache';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { buildSessionExercisesPayload } from '../utils/workoutSession';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { addLog } from '../services/LogService';
import { normalizeDate } from '../utils/dateUtils';
import { runAfterKeyboardSettles } from '../utils/keyboardFocus';

export const AUTOSAVE_DEBOUNCE_MS = 1500;

export type ActiveWorkoutSaveOutcome = 'clean' | 'saved' | 'failed';

/** The latest save; each save waits for it so two never overlap. */
let saveQueue: Promise<unknown> = Promise.resolve();

/**
 * A save response held back because it landed while a set was being edited.
 * Adopting it swaps in the server's copy of the session, which re-renders
 * every card under the open keyboard. It carries the ids the server assigned,
 * so it is adopted before any later save builds its payload, and otherwise
 * once editing ends or the app leaves the foreground (see
 * `useActiveWorkoutAutosave`): it lives only in memory, and an app killed in
 * the background must come back with those ids in the persisted store.
 *
 * A single slot is only safe because `saveNow` adopts it before every save
 * and saves are serialized through `saveQueue`, so a second response can
 * never land while one is still held.
 */
let heldResponse: {
  result: PresetSessionResponse;
  sentRevision: number;
  sentEntryIds: string[];
  sentSetIds: string[][];
  sessionId: string;
  startedAt: number | null;
} | null = null;

/**
 * Fold a held response into the store. The store already drops a response for
 * another session, and keeps newer local edits (grafting only the ids) when
 * the revision moved on. A held response from an earlier live run of the same
 * session (discarded and started again) is dropped here: that store is still
 * dirty, so the next save resends everything it holds.
 */
function adoptHeldServerSession(): void {
  const held = heldResponse;
  if (held == null) return;
  heldResponse = null;
  const state = useActiveWorkoutStore.getState();
  if (state.sessionId !== held.sessionId || state.startedAt !== held.startedAt)
    return;
  state.applyServerSession(
    held.result,
    held.sentRevision,
    held.sentEntryIds,
    held.sentSetIds
  );
}

/**
 * One-shot save of the live session's unsaved edits. Shared by the autosave
 * hook and by callers that must flush without the hook mounted (the HUD's
 * workout-complete dismiss paths after a cold start, the watch bridge's
 * per-set flush).
 *
 * Saves run one at a time across all callers. Two in flight would each send
 * the same new sets without ids; the later request replaces the rows the
 * earlier one inserted, and if the earlier response lands last it hands the
 * store set ids that no longer exist, so every later save is rejected with
 * "Set does not belong to this exercise entry". A queued save re-reads the
 * store when its turn comes, so it sends the ids the previous response
 * assigned (or finds nothing left to save).
 */
export function saveActiveWorkoutSession(
  queryClient: QueryClient,
  options?: {
    /**
     * Read when the response lands: true holds it back instead of adopting
     * it (the screen, while a set is being edited).
     */
    holdAdoption?: () => boolean;
  }
): Promise<ActiveWorkoutSaveOutcome> {
  const run = saveQueue.then(() => saveNow(queryClient, options?.holdAdoption));
  saveQueue = run.catch(() => undefined);
  return run;
}

async function saveNow(
  queryClient: QueryClient,
  holdAdoption?: () => boolean
): Promise<ActiveWorkoutSaveOutcome> {
  // A held response carries the ids the server assigned to new sets; a payload
  // built without them would make the server insert those sets again.
  adoptHeldServerSession();
  const state = useActiveWorkoutStore.getState();
  if (
    !state.hasUnsavedChanges ||
    state.sessionId == null ||
    state.session == null
  ) {
    return 'clean';
  }
  if (state.session.exercises.length === 0) {
    // The update schema rejects an empty exercises array. Nothing sensible to
    // autosave — the user emptied the session; leave the server copy as is
    // rather than destructively deleting it from a background save.
    addLog(
      'Active workout autosave skipped: session has no exercises',
      'WARNING'
    );
    return 'clean';
  }

  const sentRevision = state.sessionRevision;
  // Entry-id order at send time: applyServerSession compares it against the
  // local session so a mid-flight reorder/delete can't be grafted positionally.
  const sentEntryIds = state.session.exercises.map((e) => e.id);
  // Set-id order at send time. A warm-up insert changes both the count and
  // the order, which a positional id graft would assign to the wrong sets.
  const sentSetIds = state.session.exercises.map((e) =>
    e.sets.map((s) => String(s.id))
  );
  // Captured before the request: the user may end or swap the session while
  // it is in flight, so the failure log must describe the session that was
  // being saved, not whatever the store holds at catch time.
  const sessionId = state.sessionId;
  const sessionSource = state.session.source ?? 'unknown';
  try {
    const trimmedName = state.session.name.trim();
    const activityDetails =
      state.workoutFormat !== 'standard'
        ? [
            {
              detail_type: 'wod_score' as const,
              detail_data: {
                // Shared-schema key (read by web and the AI), plus the legacy
                // `format` key older mobile builds read.
                workout_format: state.workoutFormat,
                format: state.workoutFormat,
                rounds_completed: state.intervalRoundsCompleted,
                reps_completed: state.intervalRepsCompleted,
                time_cap_seconds: state.timeCapSeconds ?? undefined,
                elapsed_seconds: state.startedAt
                  ? Math.floor((Date.now() - state.startedAt) / 1000)
                  : undefined,
                status: state.intervalStatus,
                scaling_notes: state.intervalScalingNotes || undefined,
              },
            },
          ]
        : undefined;

    const result = await updateWorkout(sessionId, {
      // Persist the (possibly renamed) session name; skip an empty string so
      // the server's min(1) name validation isn't tripped.
      ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
      location: state.session.location ?? null,
      exercises: buildSessionExercisesPayload(
        state.session,
        state.completedSetIds,
        state.prSetIds,
        state.startedAt,
        state.resumedDurationMinutes
      ),
      activity_details: activityDetails,
    });
    if (holdAdoption?.() === true) {
      heldResponse = {
        result,
        sentRevision,
        sentEntryIds,
        sentSetIds,
        sessionId,
        startedAt: state.startedAt,
      };
    } else {
      useActiveWorkoutStore
        .getState()
        .applyServerSession(result, sentRevision, sentEntryIds, sentSetIds);
    }
    syncExerciseSessionInCache(queryClient, result);
    return 'saved';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const statusCode = error instanceof ApiError ? error.statusCode : undefined;

    const responseBody = error instanceof ApiError ? error.body : undefined;

    addLog('Active workout autosave failed', 'ERROR', [
      `sessionId: ${sessionId}`,
      `session source: ${sessionSource}`,
      `status: ${statusCode ?? 'unknown'}`,
      `server response: ${responseBody ?? errorMessage}`,
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
  queryClient: QueryClient
): Promise<boolean> {
  const entryDate =
    useActiveWorkoutStore.getState().session?.entry_date ?? null;
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
 * `editing` (a set cell is focused) keeps the response away from the
 * keyboard: saves still go out on the usual debounce, but a response landing
 * while editing is held and adopted once editing ends and the keyboard has
 * closed (or by the next save, a flush, or the app leaving the foreground,
 * whichever comes first). A response that lands while the app is not in the
 * foreground (iOS reports inactive before background) is never held. Local
 * edits are never touched by the hold: the store stays dirty until the held
 * response is adopted.
 *
 * Deliberately not `useCrudMutation`: that toasts on every failure, but
 * background retries must be silent — failures are logged, the store stays
 * dirty, and the user is told only at flush points (once per failure streak).
 * Date-keyed cache invalidation also happens only at flush, not per save.
 */
export function useActiveWorkoutAutosave(options?: { editing?: boolean }): {
  flush: () => Promise<boolean>;
} {
  const editing = options?.editing ?? false;
  const { t } = useTranslation();
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
  /** `editing` for responses that land after the render that set it. */
  const editingRef = useRef(editing);

  useEffect(() => {
    editingRef.current = editing;
    if (editing) return;
    // Editing ended: take in a response held meanwhile, after the keyboard
    // has finished closing so the re-render does not land mid-animation.
    return runAfterKeyboardSettles(adoptHeldServerSession, 0);
  }, [editing]);

  // Leaving the screen mid-edit releases the hold too.
  useEffect(
    () => () => {
      editingRef.current = false;
      adoptHeldServerSession();
    },
    []
  );

  // So does leaving the foreground: the app may be killed in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') adoptHeldServerSession();
    });
    return () => subscription.remove();
  }, []);

  const performSave = useCallback(async (): Promise<boolean> => {
    const outcome = await saveActiveWorkoutSession(queryClient, {
      holdAdoption: () =>
        editingRef.current && AppState.currentState === 'active',
    });
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
    // A flush is a sync point (leaving the screen, finishing): whatever the
    // server sent back is taken in now, even mid-edit.
    adoptHeldServerSession();

    if (ok) {
      if (savedSinceInvalidateRef.current && entryDate) {
        invalidateExerciseCache(queryClient, normalizeDate(entryDate));
        savedSinceInvalidateRef.current = false;
      }
    } else if (!failureToastShownRef.current) {
      failureToastShownRef.current = true;
      Toast.show({
        type: 'error',
        text1: t('activeWorkoutAutosave.failedTitle', {
          defaultValue: 'Workout not saved',
        }),
        text2: t('activeWorkoutAutosave.failedMessage', {
          defaultValue: 'Changes are kept on this device and will retry.',
        }),
      });
    }
    return ok;
  }, [queryClient, runSave, t]);

  return { flush };
}
