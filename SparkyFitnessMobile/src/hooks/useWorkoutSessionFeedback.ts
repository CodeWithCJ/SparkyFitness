import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMPTY_WORKOUT_FEEDBACK_DRAFT,
  workoutFeedbackDraftFromResponse,
  workoutFeedbackRequestFromDraft,
  type WorkoutFeedbackDraft,
} from '@workspace/shared';
import {
  fetchWorkoutSessionFeedback,
  saveWorkoutSessionFeedback,
} from '../services/api/workoutCoachingApi';
import { addLog } from '../services/LogService';
import { queueWorkoutFeedback } from '../offline/followUps';
import { serverMayBeDown } from '../utils/serverErrors';
import {
  workoutSessionFeedbackQueryKey,
  workoutSuggestionsQueryKeyRoot,
} from './queryKeys';

// Typing a note should not send a request per keystroke.
const SAVE_DEBOUNCE_MS = 600;

/** `queued`: no connection; the answer waits on the phone and is sent later. */
export type FeedbackSaveState =
  'idle' | 'saving' | 'saved' | 'queued' | 'error';

/**
 * Loads and autosaves one session's feedback (issue #1560). Every change
 * replaces the whole session feedback on the server, so saves are queued
 * one after another: the last answer given is always the one that sticks,
 * even if an earlier request is slow.
 */
export function useWorkoutSessionFeedback(presetEntryId: string) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: workoutSessionFeedbackQueryKey(presetEntryId),
    queryFn: () => fetchWorkoutSessionFeedback(presetEntryId),
  });

  const [draft, setDraft] = useState<WorkoutFeedbackDraft>(
    EMPTY_WORKOUT_FEEDBACK_DRAFT
  );
  const [saveState, setSaveState] = useState<FeedbackSaveState>('idle');
  const [touched, setTouched] = useState(false);
  const latestRef = useRef<WorkoutFeedbackDraft>(draft);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed from the server once, unless the user has already started answering.
  const [seededFrom, setSeededFrom] = useState<typeof data>(undefined);
  if (data !== seededFrom && !touched) {
    setSeededFrom(data);
    setDraft(workoutFeedbackDraftFromResponse(data));
  }
  // Saves read the latest answer from here, outside of render.
  useEffect(() => {
    latestRef.current = draft;
  }, [draft]);

  const flush = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const request = workoutFeedbackRequestFromDraft(latestRef.current);
    setSaveState('saving');
    chainRef.current = chainRef.current
      .then(async () => {
        const saved = await saveWorkoutSessionFeedback(presetEntryId, request);
        queryClient.setQueryData(
          workoutSessionFeedbackQueryKey(presetEntryId),
          saved
        );
        queryClient.invalidateQueries({
          queryKey: workoutSuggestionsQueryKeyRoot,
        });
        setSaveState('saved');
      })
      .catch(async (error: unknown) => {
        // No connection (#1983): keep the answer for the upload queue, to
        // be sent after the workout itself.
        if (
          serverMayBeDown(error) &&
          (await queueWorkoutFeedback(presetEntryId, request))
        ) {
          setSaveState('queued');
          return;
        }
        addLog(
          `Saving workout feedback failed: ${(error as Error).message}`,
          'WARNING'
        );
        setSaveState('error');
      });
    return chainRef.current;
  }, [presetEntryId, queryClient]);

  const update = useCallback(
    (
      next:
        | WorkoutFeedbackDraft
        | ((current: WorkoutFeedbackDraft) => WorkoutFeedbackDraft),
      options: { debounce?: boolean } = {}
    ) => {
      setTouched(true);
      const value = typeof next === 'function' ? next(latestRef.current) : next;
      latestRef.current = value;
      setDraft(value);
      if (timerRef.current != null) clearTimeout(timerRef.current);
      if (options.debounce) {
        timerRef.current = setTimeout(() => {
          void flush();
        }, SAVE_DEBOUNCE_MS);
      } else {
        void flush();
      }
    },
    [flush]
  );

  // Leaving the screen mid-debounce still saves the last answer.
  useEffect(
    () => () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        void flush();
      }
    },
    [flush]
  );

  return {
    draft,
    update,
    retry: flush,
    saveState,
    isLoading,
    isError,
    reload: refetch,
  };
}
