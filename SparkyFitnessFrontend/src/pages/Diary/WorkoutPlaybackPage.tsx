import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader } from '@/components/ui/card';
import { useCreatePresetSessionMutation } from '@/hooks/Exercises/useExerciseEntries';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  DEFAULT_REST_SECONDS,
  addWorkoutSetToExercise,
  clearWorkoutPlaybackDraftFromStorage,
  buildPresetSessionCreateRequestFromDraft,
  completeCurrentWorkoutSet,
  getCurrentWorkoutSetPointer,
  getWorkoutPlaybackRestRemainingSeconds,
  getWorkoutPlaybackStats,
  isWorkoutPlaybackComplete,
  loadWorkoutPlaybackDraftFromStorage,
  removeWorkoutSetFromExercise,
  saveWorkoutPlaybackDraftToStorage,
  setWorkoutPlaybackPointer,
  setWorkoutPlaybackRestTimer,
  toggleWorkoutSetCompletion,
  type WorkoutPlaybackRouteState,
  type WorkoutPlaybackDraft,
  type WorkoutSetPointer,
  updateWorkoutSetAtPointer,
} from '@/utils/workoutPlayback';
import { formatSecondsClock } from '@/utils/timeFormatters';
import { localDateTimeToUtc } from '@workspace/shared';
import WorkoutPlaybackDialogs from './WorkoutPlaybackDialogs';
import WorkoutPlaybackExercisesList from './WorkoutPlaybackExercisesList';
import WorkoutPlaybackSummary from './WorkoutPlaybackSummary';

const MIN_REST_SECONDS = 15;
const MAX_REST_SECONDS = 900;

function clampRestSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return DEFAULT_REST_SECONDS;
  }

  const clamped = Math.max(
    MIN_REST_SECONDS,
    Math.min(MAX_REST_SECONDS, seconds)
  );
  return Math.round(clamped / 5) * 5;
}

function getInitialDraft(
  requestedDate: string | null,
  routeState: WorkoutPlaybackRouteState | null
): WorkoutPlaybackDraft | null {
  const existingDraft = routeState?.draft ?? null;
  if (existingDraft) {
    if (requestedDate && existingDraft.entry_date !== requestedDate) {
      return null;
    }

    return existingDraft;
  }

  if (!requestedDate) {
    return null;
  }

  return loadWorkoutPlaybackDraftFromStorage(requestedDate);
}

function getReturnPath(
  requestedDate: string | null,
  routeState: WorkoutPlaybackRouteState | null
): string {
  if (routeState?.returnTo) {
    return routeState.returnTo;
  }

  if (requestedDate) {
    return `/?date=${requestedDate}`;
  }

  return '/';
}

function startRestTimer(
  draft: WorkoutPlaybackDraft,
  restSeconds: number,
  targetPointer?: WorkoutSetPointer
): WorkoutPlaybackDraft {
  const normalizedRestSeconds = Math.max(0, restSeconds);

  if (normalizedRestSeconds === 0) {
    return setWorkoutPlaybackRestTimer(draft, {
      state: 'idle',
      duration_seconds: 0,
      remaining_seconds: 0,
      target_exercise_index: undefined,
      target_set_index: undefined,
    });
  }

  return setWorkoutPlaybackRestTimer(draft, {
    state: 'running',
    duration_seconds: normalizedRestSeconds,
    remaining_seconds: normalizedRestSeconds,
    target_end_timestamp_ms: Date.now() + normalizedRestSeconds * 1000,
    target_exercise_index: targetPointer?.exerciseIndex,
    target_set_index: targetPointer?.setIndex,
  });
}

const WorkoutPlaybackPage = () => {
  const { t } = useTranslation();
  const { weightUnit, timezone } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get('date');
  const routeState =
    (location.state as WorkoutPlaybackRouteState | null) ?? null;
  const returnPath = getReturnPath(requestedDate, routeState);

  const scrubbedRouteStateRef = useRef(false);
  const persistedDraftDateRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<WorkoutPlaybackDraft | null>(() =>
    getInitialDraft(requestedDate, routeState)
  );
  const draftRef = useRef<WorkoutPlaybackDraft | null>(draft);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsedTickMs, setElapsedTickMs] = useState(() => Date.now());
  const [setNotesVisibility, setSetNotesVisibility] = useState<
    Record<string, boolean>
  >({});
  const [restEditorPointer, setRestEditorPointer] =
    useState<WorkoutSetPointer | null>(null);
  const [restEditorCustomValue, setRestEditorCustomValue] = useState('');
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

  const { mutateAsync: createPresetSession, isPending: isSaving } =
    useCreatePresetSessionMutation();

  useEffect(() => {
    if (scrubbedRouteStateRef.current || !routeState?.draft) {
      return;
    }

    scrubbedRouteStateRef.current = true;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: routeState.returnTo
        ? { returnTo: routeState.returnTo }
        : undefined,
    });
  }, [
    location.pathname,
    location.search,
    navigate,
    routeState,
    routeState?.draft,
    routeState?.returnTo,
  ]);

  // Debounce draft saves to avoid excessive localStorage writes on timer ticks
  useEffect(() => {
    if (!draft) {
      if (persistedDraftDateRef.current) {
        clearWorkoutPlaybackDraftFromStorage(persistedDraftDateRef.current);
        persistedDraftDateRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (
        persistedDraftDateRef.current &&
        persistedDraftDateRef.current !== draft.entry_date
      ) {
        clearWorkoutPlaybackDraftFromStorage(persistedDraftDateRef.current);
      }

      saveWorkoutPlaybackDraftToStorage(draft);
      persistedDraftDateRef.current = draft.entry_date;
    }, 500);

    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Combined interval for both rest timer and elapsed time
  // Only update draft when timer expires; remaining time derives from target_end_timestamp_ms
  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedTickMs(Date.now());

      setDraft((currentDraft) => {
        if (!currentDraft || currentDraft.rest_timer.state !== 'running') {
          return currentDraft;
        }

        const nextRemaining = getWorkoutPlaybackRestRemainingSeconds(
          currentDraft.rest_timer
        );

        // Only update draft state when timer expires to avoid triggering localStorage saves
        if (nextRemaining <= 0) {
          return setWorkoutPlaybackRestTimer(currentDraft, {
            ...currentDraft.rest_timer,
            state: 'idle',
            remaining_seconds: 0,
            target_end_timestamp_ms: null,
          });
        }

        // Don't update draft; remaining time is derived from target_end_timestamp_ms in render
        return currentDraft;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    if (!draft) return null;
    return getWorkoutPlaybackStats(draft);
  }, [draft]);

  const totalVolume = useMemo(() => {
    if (!draft) return 0;

    return draft.exercises.reduce(
      (exerciseSum, exercise) =>
        exerciseSum +
        exercise.sets.reduce(
          (setSum, set) =>
            set.completed
              ? setSum + (Number(set.weight) || 0) * (Number(set.reps) || 0)
              : setSum,
          0
        ),
      0
    );
  }, [draft]);

  const startedAtMs = useMemo(() => {
    if (!draft) {
      return NaN;
    }

    return Date.parse(draft.started_at);
  }, [draft]);

  const elapsedSeconds = useMemo(() => {
    if (!draft || Number.isNaN(startedAtMs)) return 0;
    return Math.max(0, Math.floor((elapsedTickMs - startedAtMs) / 1000));
  }, [draft, elapsedTickMs, startedAtMs]);

  const updateDraft = useCallback(
    (updater: (currentDraft: WorkoutPlaybackDraft) => WorkoutPlaybackDraft) => {
      setDraft((currentDraft) => {
        if (!currentDraft) return currentDraft;
        return updater(currentDraft);
      });
    },
    []
  );

  const handleCompleteSet = useCallback(
    (pointer: WorkoutSetPointer) => {
      updateDraft((currentDraft) => {
        const set =
          currentDraft.exercises[pointer.exerciseIndex]?.sets[pointer.setIndex];
        if (!set || set.completed) {
          return currentDraft;
        }

        let nextDraft = setWorkoutPlaybackPointer(currentDraft, pointer);
        nextDraft = completeCurrentWorkoutSet(nextDraft);

        if (!isWorkoutPlaybackComplete(nextDraft)) {
          const restSeconds = set.rest_time ?? DEFAULT_REST_SECONDS;
          const targetPointer = getCurrentWorkoutSetPointer(nextDraft);
          nextDraft = startRestTimer(nextDraft, restSeconds, targetPointer);
        }

        return nextDraft;
      });
    },
    [updateDraft]
  );

  const handleUncompleteSet = useCallback(
    (pointer: WorkoutSetPointer) => {
      updateDraft((currentDraft) => {
        const updated = toggleWorkoutSetCompletion(
          setWorkoutPlaybackPointer(currentDraft, pointer),
          pointer
        );

        if (
          updated.rest_timer.target_exercise_index === pointer.exerciseIndex &&
          updated.rest_timer.target_set_index === pointer.setIndex &&
          updated.rest_timer.state !== 'idle'
        ) {
          return setWorkoutPlaybackRestTimer(updated, {
            ...updated.rest_timer,
            state: 'idle',
            remaining_seconds: 0,
          });
        }

        return updated;
      });
    },
    [updateDraft]
  );

  const handleSetFieldChange = useCallback(
    (
      pointer: WorkoutSetPointer,
      field: 'reps' | 'weight' | 'rest_time' | 'set_type' | 'notes',
      value: number | string | null
    ) => {
      updateDraft((currentDraft) =>
        updateWorkoutSetAtPointer(currentDraft, pointer, { [field]: value })
      );
    },
    [updateDraft]
  );

  const handleSessionNotesChange = useCallback(
    (value: string) => {
      updateDraft((currentDraft) => ({ ...currentDraft, notes: value }));
    },
    [updateDraft]
  );

  const handleStartTimeChange = useCallback(
    (timeStr: string) => {
      setDraft((currentDraft) => {
        if (!currentDraft) return null;
        try {
          const utcDate = localDateTimeToUtc(
            `${currentDraft.entry_date}T${timeStr}`,
            timezone
          );
          return {
            ...currentDraft,
            started_at: utcDate.toISOString(),
          };
        } catch (e) {
          console.error('Error changing start time:', e);
          return currentDraft;
        }
      });
    },
    [timezone]
  );

  const toggleSetNotesVisibility = useCallback((setKey: string) => {
    setSetNotesVisibility((current) => ({
      ...current,
      [setKey]: !current[setKey],
    }));
  }, []);

  const handleAddSet = useCallback(
    (exerciseIndex: number) => {
      updateDraft((currentDraft) =>
        addWorkoutSetToExercise(currentDraft, exerciseIndex)
      );
    },
    [updateDraft]
  );

  const handleRemoveSet = useCallback(
    (pointer: WorkoutSetPointer) => {
      updateDraft((currentDraft) =>
        removeWorkoutSetFromExercise(currentDraft, pointer)
      );
    },
    [updateDraft]
  );

  const handlePauseResumeRest = useCallback(() => {
    updateDraft((currentDraft) => {
      if (currentDraft.rest_timer.state === 'running') {
        const remainingSeconds = getWorkoutPlaybackRestRemainingSeconds(
          currentDraft.rest_timer
        );
        return setWorkoutPlaybackRestTimer(currentDraft, {
          ...currentDraft.rest_timer,
          state: 'paused',
          remaining_seconds: remainingSeconds,
          target_end_timestamp_ms: null,
        });
      }

      if (currentDraft.rest_timer.state === 'paused') {
        return setWorkoutPlaybackRestTimer(currentDraft, {
          ...currentDraft.rest_timer,
          state: 'running',
          target_end_timestamp_ms:
            Date.now() + currentDraft.rest_timer.remaining_seconds * 1000,
        });
      }

      return currentDraft;
    });
  }, [updateDraft]);

  const handleSkipRest = useCallback(() => {
    updateDraft((currentDraft) =>
      setWorkoutPlaybackRestTimer(currentDraft, {
        ...currentDraft.rest_timer,
        state: 'idle',
        remaining_seconds: currentDraft.rest_timer.duration_seconds,
        target_end_timestamp_ms: null,
        target_exercise_index: undefined,
        target_set_index: undefined,
      })
    );
  }, [updateDraft]);

  const handleOpenRestEditor = useCallback((pointer: WorkoutSetPointer) => {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const selectedSet =
      currentDraft.exercises[pointer.exerciseIndex]?.sets[pointer.setIndex];
    if (!selectedSet) return;
    setRestEditorPointer(pointer);
    setRestEditorCustomValue(
      String(selectedSet.rest_time ?? DEFAULT_REST_SECONDS)
    );
  }, []);

  const closeRestEditor = useCallback(() => {
    setRestEditorPointer(null);
    setRestEditorCustomValue('');
  }, []);

  const updateRestForPointer = useCallback(
    (seconds: number) => {
      if (!restEditorPointer) return;
      const normalized = clampRestSeconds(seconds);
      updateDraft((currentDraft) =>
        updateWorkoutSetAtPointer(currentDraft, restEditorPointer, {
          rest_time: normalized,
        })
      );
      closeRestEditor();
    },
    [closeRestEditor, restEditorPointer, updateDraft]
  );

  const handleSaveCustomRest = useCallback(() => {
    const parsed = Number(restEditorCustomValue);
    updateRestForPointer(
      Number.isFinite(parsed) ? parsed : DEFAULT_REST_SECONDS
    );
  }, [restEditorCustomValue, updateRestForPointer]);

  const handleSelectSet = useCallback(
    (pointer: WorkoutSetPointer) => {
      updateDraft((currentDraft) =>
        setWorkoutPlaybackPointer(currentDraft, pointer)
      );
    },
    [updateDraft]
  );

  const handleCloseKeepDraft = useCallback(() => {
    navigate(returnPath);
  }, [navigate, returnPath]);

  const handleDiscard = useCallback(() => {
    setIsDiscardDialogOpen(true);
  }, []);

  const handleConfirmDiscard = useCallback(() => {
    if (draft) {
      clearWorkoutPlaybackDraftFromStorage(draft.entry_date);
    }
    setDraft(null);
    setSaveError(null);
    setIsDiscardDialogOpen(false);
    navigate(returnPath);
  }, [draft, navigate, returnPath]);

  const handleFinishWorkout = useCallback(async () => {
    if (!draft) return;

    const payload = buildPresetSessionCreateRequestFromDraft(draft, timezone);
    if (!payload.exercises || payload.exercises.length === 0) {
      setSaveError(
        t(
          'exercise.workoutPlaybackDialog.completeAtLeastOneSet',
          'Complete at least one set before finishing.'
        )
      );
      return;
    }

    try {
      await createPresetSession(payload);
      clearWorkoutPlaybackDraftFromStorage(draft.entry_date);
      setDraft(null);
      setSaveError(null);
      navigate(returnPath, { replace: true });
    } catch {
      setSaveError(
        t(
          'exercise.workoutPlaybackDialog.finishError',
          'Failed to save workout. Your local progress is still preserved, and you can retry.'
        )
      );
    }
  }, [createPresetSession, draft, navigate, returnPath, t, timezone]);

  if (!draft) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Button
          type="button"
          variant="ghost"
          className="gap-2"
          onClick={() => navigate(returnPath)}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back', 'Back')}
        </Button>
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {t('exercise.workoutPlaybackDialog.title', 'Live Workout')}
            </h2>
            <CardDescription>
              {t(
                'exercise.workoutPlaybackDialog.noDraft',
                'No active workout draft was found for this date.'
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isRestActive = draft && draft.rest_timer.state !== 'idle';
  const restRemaining = formatSecondsClock(
    draft ? getWorkoutPlaybackRestRemainingSeconds(draft.rest_timer) : 0
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <WorkoutPlaybackSummary
        draft={draft}
        elapsedSeconds={elapsedSeconds}
        totalVolume={totalVolume}
        stats={stats}
        restRemaining={restRemaining}
        isRestActive={!!isRestActive}
        saveError={saveError}
        isSaving={isSaving}
        timezone={timezone}
        onCloseKeepDraft={handleCloseKeepDraft}
        onDiscard={handleDiscard}
        onFinishWorkout={handleFinishWorkout}
        onPauseResumeRest={handlePauseResumeRest}
        onSkipRest={handleSkipRest}
        onSessionNotesChange={handleSessionNotesChange}
        onStartTimeChange={handleStartTimeChange}
      />

      <WorkoutPlaybackExercisesList
        exercises={draft.exercises}
        setNotesVisibility={setNotesVisibility}
        onToggleSetNotesVisibility={toggleSetNotesVisibility}
        onSelectSet={handleSelectSet}
        onCompleteSet={handleCompleteSet}
        onUncompleteSet={handleUncompleteSet}
        onSetFieldChange={handleSetFieldChange}
        onOpenRestEditor={handleOpenRestEditor}
        onRemoveSet={handleRemoveSet}
        onAddSet={handleAddSet}
        weightUnit={weightUnit}
      />

      <WorkoutPlaybackDialogs
        restEditorPointer={restEditorPointer}
        restEditorCustomValue={restEditorCustomValue}
        onCloseRestEditor={closeRestEditor}
        onUpdateRestForPointer={updateRestForPointer}
        onSetRestEditorCustomValue={setRestEditorCustomValue}
        onSaveCustomRest={handleSaveCustomRest}
        isDiscardDialogOpen={isDiscardDialogOpen}
        onDiscardDialogChange={setIsDiscardDialogOpen}
        onConfirmDiscard={handleConfirmDiscard}
      />
    </div>
  );
};

export default WorkoutPlaybackPage;
