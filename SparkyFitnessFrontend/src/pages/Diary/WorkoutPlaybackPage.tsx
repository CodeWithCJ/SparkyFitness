import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader } from '@/components/ui/card';
import {
  isPresetSessionConflictError,
  useCreatePresetSessionMutation,
  useUpdatePresetSessionMutation,
} from '@/hooks/Exercises/useExerciseEntries';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  distributeProgressionReps,
  evaluateProgression,
  type ExerciseProgressionConfig,
  type LastExercisePerformance,
} from '@workspace/shared';
import {
  DEFAULT_REST_SECONDS,
  addRoundToWorkoutDraft,
  addDropSetsToWorkoutExercise,
  adaptDraftExerciseSets,
  adaptiveDefaultIncrementKg,
  replaceExerciseInWorkoutDraft,
  setWorkoutAdaptiveDeclined,
  type WorkoutPlaybackExerciseDraft,
  applyWeightRampToDraftExercise,
  decrementRoundFromWorkoutDraft,
  addWorkoutSetToExercise,
  clearWorkoutPlaybackDraftFromStorage,
  buildPresetSessionCreateRequestFromDraft,
  buildPresetSessionUpdateRequestFromDraft,
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
  type WorkoutSetEditableField,
  type WorkoutSetPointer,
  updateWorkoutSetAtPointer,
  listWorkoutSetPointers,
  getSetByPointer,
} from '@/utils/workoutPlayback';
import { formatSecondsClock } from '@/utils/timeFormatters';
import {
  decideAdaptiveAdjustment,
  localDateTimeToUtc,
  shouldSuggestVariation,
} from '@workspace/shared';
import { fetchWorkoutCoachingSignals } from '@/hooks/Exercises/useWorkoutCoaching';
import WorkoutPlaybackDialogs from './WorkoutPlaybackDialogs';
import WorkoutPlaybackExercisesList from './WorkoutPlaybackExercisesList';
import WorkoutPlaybackIntervalHud from './WorkoutPlaybackIntervalHud';
import WorkoutPlaybackGuidedCard from './WorkoutPlaybackGuidedCard';
import WorkoutPlaybackFinishDialog, {
  type WorkoutFinishSummary,
} from './WorkoutPlaybackFinishDialog';
import WorkoutPlaybackSummary from './WorkoutPlaybackSummary';
// Loaded on first Replace: the exercise dialog pulls in the whole search UI,
// which the player otherwise never needs.
const AddExerciseDialog = lazy(
  () => import('@/pages/Exercises/AddExerciseDialog')
);
import type { Exercise } from '@/types/exercises';
import { buildExerciseReplaceContext } from '@/utils/exerciseAlternatives';
import { fetchExerciseProgressionStats } from '@/hooks/Exercises/useExerciseEntries';
import { playIntervalCue } from '@/utils/workoutSounds';
import { useGuidedWorkoutPreferences } from '@/utils/guidedWorkoutPreferences';

function weightFromKg(weightKg: number, unit: string): number {
  if (!weightKg || weightKg <= 0) return 0;
  return unit === 'lbs' || unit === 'st_lbs'
    ? Math.round(weightKg * 2.20462262 * 10) / 10
    : weightKg;
}

function weightToKgLocal(weight: number, unit: string): number {
  if (!weight || weight <= 0) return 0;
  return unit === 'lbs' || unit === 'st_lbs'
    ? Math.round((weight / 2.20462262) * 100) / 100
    : weight;
}

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
  const { enabled: guidedWorkoutEnabled } = useGuidedWorkoutPreferences();
  const [finishSummary, setFinishSummary] =
    useState<WorkoutFinishSummary | null>(null);
  const getDraft = useCallback(() => draftRef.current, []);

  const { mutateAsync: createPresetSession, isPending: isSaving } =
    useCreatePresetSessionMutation();
  const { mutateAsync: updatePresetSession } = useUpdatePresetSessionMutation();
  // Auto-evaluate progression overload and the per-set ramp for uncompleted
  // exercises, once per workout: a reopened draft keeps what the lifter
  // typed (and a heavier set 1 never re-seeds the ramp).
  const progressionCheckedRef = useRef(false);
  useEffect(() => {
    if (!draft || progressionCheckedRef.current) return;
    progressionCheckedRef.current = true;
    if (draft.load_adjustments_applied) return;

    const isWarmup = (setType?: string | null): boolean => {
      if (!setType) return false;
      const lower = setType.toLowerCase();
      return lower === 'warmup' || lower.includes('warm');
    };

    const evaluateDraftProgression = async () => {
      let hasChanges = false;
      const isStandard = (draft.workout_format ?? 'standard') === 'standard';
      // Adaptive coaching (#1560): recent feedback per exercise. A failed
      // fetch just means no adjustments; it never blocks the workout.
      const signalsResponse = isStandard
        ? await fetchWorkoutCoachingSignals(
            [...new Set(draft.exercises.map((e) => e.exercise_id))].filter(
              Boolean
            )
          ).catch(() => null)
        : null;
      const signalById = new Map(
        (signalsResponse?.signals ?? []).map((signal) => [
          signal.exercise_id,
          signal,
        ])
      );

      const evaluateEngine = async (
        exercise: WorkoutPlaybackExerciseDraft
      ): Promise<WorkoutPlaybackExerciseDraft> => {
        {
          if (exercise.sets.some((s) => s.completed)) return exercise;

          try {
            const stats = await fetchExerciseProgressionStats(
              exercise.exercise_id
            );
            if (!stats) return exercise;
            const allPreviousSets = stats?.recentSessions?.[0]?.sets ?? [];

            // Exclude warmup sets from prior session to establish true working baseline
            const workingPreviousSets = allPreviousSets.filter(
              (s: {
                set_type?: string | null;
                reps?: number | null;
                weight?: number | null;
              }) => !isWarmup(s.set_type)
            );

            if (workingPreviousSets.length > 0) {
              const firstWorking = workingPreviousSets[0];
              const rawKg = firstWorking.weight
                ? Number(firstWorking.weight)
                : 0;
              const baseWeightInDisplayUnit =
                rawKg > 0 ? weightFromKg(rawKg, weightUnit) : 0;

              const lastPerf: LastExercisePerformance = {
                baseWeight: baseWeightInDisplayUnit,
                sets: workingPreviousSets.map(
                  (
                    s: {
                      set_number?: number;
                      reps: number | null;
                      weight: number | null;
                    },
                    idx: number
                  ) => ({
                    setNumber: idx + 1,
                    reps: Number(s.reps) || 0,
                    weight: s.weight
                      ? weightFromKg(Number(s.weight), weightUnit)
                      : 0,
                  })
                ),
              };

              const progressionMode =
                exercise.progression_mode === 'fixed' ||
                exercise.progression_mode === 'step_load' ||
                exercise.progression_mode === 'manual'
                  ? exercise.progression_mode
                  : 'rep_goal';

              const incrementType =
                exercise.increment_type === 'reps' ? 'reps' : 'weight';

              // Only count working sets towards targetSets (exclude warmups)
              const workingCurrentSets = exercise.sets.filter(
                (s) => !isWarmup(s.set_type)
              );
              const targetSets = workingCurrentSets.length || 3;
              const effectiveRepGoal = exercise.rep_goal ?? targetSets * 8;

              const config: ExerciseProgressionConfig = {
                progressionMode,
                targetSets,
                repGoal: effectiveRepGoal,
                incrementType,
                // Weight increments are stored kg; the engine works in the
                // display unit like the weights above. Step-load raises reps,
                // so its increment is a count whatever increment_type says.
                incrementValue:
                  incrementType === 'weight' && progressionMode !== 'step_load'
                    ? weightFromKg(
                        Number(exercise.increment_value) || 2.5,
                        weightUnit
                      )
                    : Number(exercise.increment_value) || 2.5,
                equipmentBrand: exercise.equipment_brand ?? undefined,
              };

              const progression = evaluateProgression(config, lastPerf);

              if (progression.goalAchieved) {
                // Case A: Weight Progression -> bump each working set from its
                // own prior weight (preserves pyramid/ascending-weight sets
                // instead of flattening every set to one suggested weight)
                if (
                  config.incrementType === 'weight' &&
                  baseWeightInDisplayUnit > 0
                ) {
                  hasChanges = true;
                  let workingIndex = 0;
                  return {
                    ...exercise,
                    sets: exercise.sets.map((s) => {
                      if (isWarmup(s.set_type)) return s;
                      const previousSet = workingPreviousSets[workingIndex];
                      workingIndex += 1;
                      const previousWeightInDisplayUnit = previousSet?.weight
                        ? weightFromKg(Number(previousSet.weight), weightUnit)
                        : baseWeightInDisplayUnit;
                      const targetKg = weightToKgLocal(
                        previousWeightInDisplayUnit + config.incrementValue,
                        weightUnit
                      );
                      return { ...s, weight: targetKg };
                    }),
                  };
                }

                // Case B: Rep Progression -> Only update working sets (preserve
                // warmups). Fixed mode's target is per set; the other modes
                // split a session total.
                const repTargets = distributeProgressionReps(
                  progression,
                  progressionMode,
                  workingCurrentSets.length
                );
                if (repTargets) {
                  hasChanges = true;
                  let workingSetCounter = 0;

                  return {
                    ...exercise,
                    sets: exercise.sets.map((s) => {
                      if (isWarmup(s.set_type)) return s;
                      const setReps = repTargets[workingSetCounter] ?? s.reps;
                      workingSetCounter++;
                      return { ...s, reps: setReps };
                    }),
                  };
                }
              }
            }
          } catch (e) {
            console.error(
              'Failed checking progression for desktop exercise',
              e
            );
          }
          return exercise;
        }
      };
      const updatedExercises = await Promise.all(
        draft.exercises.map(evaluateEngine)
      );

      // The per-set ramp steps from each exercise's first working set as it
      // now stands (the preset's weight, or the progression-bumped one), so
      // it runs after progression. Standard workouts only: interval/WOD sets
      // are clock-driven.
      const ramp = (exercise: WorkoutPlaybackExerciseDraft) =>
        isStandard && !exercise.sets.some((s) => s.completed)
          ? applyWeightRampToDraftExercise(exercise, weightUnit)
          : exercise;
      const rampedExercises = updatedExercises.map((engineResult, index) => {
        const usual = ramp(engineResult);
        const original = draft.exercises[index];
        if (!original) return usual;
        const signal = signalById.get(original.exercise_id);
        const suggestVariation = shouldSuggestVariation(
          signal,
          original.mechanic
        );
        const withVariation = suggestVariation
          ? { ...usual, suggest_variation: true }
          : usual;
        if (original.sets.some((s) => s.completed)) return usual;
        const adjustment = decideAdaptiveAdjustment(signal);
        const engineChanged = engineResult !== original;
        // Nothing to add when the engine is already stepping up.
        if (!adjustment.reason || (adjustment.addIncrement && engineChanged)) {
          return withVariation;
        }
        const base = adjustment.blockIncrease ? original : engineResult;
        const addIncrementKg = adjustment.addIncrement
          ? original.increment_type !== 'reps' &&
            original.progression_mode !== 'step_load' &&
            Number(original.increment_value) > 0
            ? Number(original.increment_value)
            : adaptiveDefaultIncrementKg(weightUnit)
          : null;
        const adapted = ramp(
          adaptDraftExerciseSets(base, adjustment, addIncrementKg, weightUnit)
        );
        return {
          ...adapted,
          suggest_variation: suggestVariation,
          adaptive: {
            reason: adjustment.reason,
            kind: adjustment.kind,
            suggest_alternative: adjustment.suggestAlternative,
            declined: false,
            usual: {
              sets: usual.sets,
              ramp_base_weight: usual.ramp_base_weight ?? null,
            },
            adapted: {
              sets: adapted.sets,
              ramp_base_weight: adapted.ramp_base_weight ?? null,
            },
          },
        };
      });

      const changed =
        hasChanges ||
        rampedExercises.some((exercise, i) => exercise !== updatedExercises[i]);
      setDraft((current) =>
        current
          ? {
              ...current,
              ...(changed ? { exercises: rampedExercises } : {}),
              load_adjustments_applied: true,
            }
          : current
      );
    };

    void evaluateDraftProgression();
  }, [draft, weightUnit]);

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

  const lastCountdownSecRef = useRef<number | null>(null);

  // Combined interval for both rest timer and elapsed time.
  // Only update draft when the timer expires; remaining time derives from
  // target_end_timestamp_ms. Cues and focus run here in the tick, never inside
  // the setDraft updater (StrictMode double-invokes updaters).
  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedTickMs(Date.now());

      const currentDraft = draftRef.current;
      if (!currentDraft || currentDraft.rest_timer.state !== 'running') {
        lastCountdownSecRef.current = null;
        return;
      }

      const nextRemaining = getWorkoutPlaybackRestRemainingSeconds(
        currentDraft.rest_timer
      );
      const pageVisible = document.visibilityState === 'visible';

      if (
        nextRemaining >= 1 &&
        nextRemaining <= 3 &&
        lastCountdownSecRef.current !== nextRemaining
      ) {
        lastCountdownSecRef.current = nextRemaining;
        if (pageVisible) playIntervalCue('countdown');
      }

      if (nextRemaining > 0) return;

      // The rest ran out on its own (Skip goes through handleSkipRest and
      // never lands here): chime, then put the cursor in the next set.
      lastCountdownSecRef.current = null;
      const expiredEndMs = currentDraft.rest_timer.target_end_timestamp_ms;
      const targetExIdx =
        currentDraft.rest_timer.target_exercise_index ??
        currentDraft.active_exercise_index;
      const targetSetIdx =
        currentDraft.rest_timer.target_set_index ??
        currentDraft.active_set_index;

      setDraft((latest) => {
        if (
          !latest ||
          latest.rest_timer.state !== 'running' ||
          latest.rest_timer.target_end_timestamp_ms !== expiredEndMs
        ) {
          return latest;
        }
        return setWorkoutPlaybackRestTimer(latest, {
          ...latest.rest_timer,
          state: 'idle',
          remaining_seconds: 0,
          target_end_timestamp_ms: null,
        });
      });

      if (!pageVisible) return;
      playIntervalCue('work');
      if (targetExIdx != null && targetSetIdx != null) {
        window.setTimeout(() => {
          // First value cell the set renders: weight, else reps, else duration.
          const el =
            document.getElementById(
              `set-weight-${targetExIdx}-${targetSetIdx}`
            ) ??
            document.getElementById(
              `set-reps-${targetExIdx}-${targetSetIdx}`
            ) ??
            document.getElementById(
              `set-duration-${targetExIdx}-${targetSetIdx}`
            );
          el?.focus();
        }, 50);
      }
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
      field: WorkoutSetEditableField,
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

  const handleLocationChange = useCallback(
    (value: string) => {
      updateDraft((currentDraft) => ({ ...currentDraft, location: value }));
    },
    [updateDraft]
  );

  const handleStartTimeChange = useCallback(
    (timeStr: string) => {
      setDraft((currentDraft) => {
        if (!currentDraft) return null;
        if (!timeStr) {
          return {
            ...currentDraft,
            started_at: '',
          };
        }
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
        addWorkoutSetToExercise(currentDraft, exerciseIndex, weightUnit)
      );
    },
    [updateDraft, weightUnit]
  );

  const handleAddDropSets = useCallback(
    (exerciseIndex: number) => {
      updateDraft((currentDraft) =>
        addDropSetsToWorkoutExercise(
          currentDraft,
          exerciseIndex,
          weightUnit === 'kg' ? 'kg' : 'lbs'
        )
      );
    },
    [updateDraft, weightUnit]
  );

  // Index of the exercise being replaced; null while the dialog is closed.
  const [replaceExerciseIndex, setReplaceExerciseIndex] = useState<
    number | null
  >(null);

  const handleReplaceExercise = useCallback(
    (exercise?: Exercise) => {
      if (exercise && replaceExerciseIndex !== null) {
        const index = replaceExerciseIndex;
        updateDraft((currentDraft) =>
          replaceExerciseInWorkoutDraft(currentDraft, index, exercise)
        );
      }
      setReplaceExerciseIndex(null);
    },
    [replaceExerciseIndex, updateDraft]
  );

  const handleAdaptiveDeclined = useCallback(
    (exerciseIndex: number, declined: boolean) => {
      updateDraft((currentDraft) =>
        setWorkoutAdaptiveDeclined(currentDraft, exerciseIndex, declined)
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

  const handleAddRound = useCallback(() => {
    updateDraft((currentDraft) => addRoundToWorkoutDraft(currentDraft));
  }, [updateDraft]);

  const handleDecrementRound = useCallback(() => {
    updateDraft((currentDraft) => decrementRoundFromWorkoutDraft(currentDraft));
  }, [updateDraft]);

  const handleSetIntervalReps = useCallback(
    (reps: number) => {
      updateDraft((currentDraft) => ({
        ...currentDraft,
        interval_reps_completed: Math.max(0, reps),
      }));
    },
    [updateDraft]
  );

  const handleSetIntervalStatus = useCallback(
    (status: 'rx' | 'scaled') => {
      updateDraft((currentDraft) => ({
        ...currentDraft,
        interval_status: status,
      }));
    },
    [updateDraft]
  );

  const handleCompleteIntervalPhase = useCallback(
    (prevPhase: { kind: string; stepIndex: number | null; round: number }) => {
      if (prevPhase.kind !== 'work') return;

      updateDraft((currentDraft) => {
        const format = currentDraft.workout_format;

        if (format === 'interval') {
          // Custom interval/HIIT steps map directly to the sequential set pointers
          const pointers = listWorkoutSetPointers(currentDraft);
          const stepIdx = prevPhase.stepIndex ?? prevPhase.round - 1;
          const pointer = pointers[stepIdx];
          if (!pointer) return currentDraft;

          const set = getSetByPointer(currentDraft, pointer);
          if (!set || set.completed) return currentDraft;

          return updateWorkoutSetAtPointer(currentDraft, pointer, {
            completed: true,
            completed_at: new Date().toISOString(),
          });
        }

        if (format === 'tabata' || format === 'emom') {
          // In Tabata/EMOM, round maps to setIndex (round - 1) on the exercise (stepIndex ?? 0)
          const exerciseIndex = prevPhase.stepIndex ?? 0;
          let nextDraft = currentDraft;
          let exercise = nextDraft.exercises[exerciseIndex];
          if (!exercise) return currentDraft;

          const setIndex = prevPhase.round - 1;
          while (exercise.sets.length <= setIndex) {
            nextDraft = addWorkoutSetToExercise(nextDraft, exerciseIndex);
            exercise = nextDraft.exercises[exerciseIndex]!;
          }

          const set = exercise.sets[setIndex];
          if (!set || set.completed) return nextDraft;

          return updateWorkoutSetAtPointer(
            nextDraft,
            { exerciseIndex, setIndex },
            {
              completed: true,
              completed_at: new Date().toISOString(),
            }
          );
        }

        return currentDraft;
      });
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
      // A draft resumed from a saved session (#1995 phase 1) updates that
      // session in place, presenting the revision it last saw; a fresh
      // draft creates a new one, born finished.
      const saved = draft.session_id
        ? await updatePresetSession({
            presetEntryId: draft.session_id,
            payload: buildPresetSessionUpdateRequestFromDraft(draft, timezone),
          })
        : await createPresetSession(payload);
      const finalStats = getWorkoutPlaybackStats(draft);
      clearWorkoutPlaybackDraftFromStorage(draft.entry_date);
      // The summary stays up over the cleared player; closing it returns to
      // the diary the way finishing always has.
      setFinishSummary({
        name: draft.name,
        durationSeconds: elapsedSeconds,
        caloriesKcal: (saved?.exercises ?? []).reduce(
          (sum, exercise) => sum + (Number(exercise.calories_burned) || 0),
          0
        ),
        completedSets: finalStats.completedSets,
        totalSets: finalStats.totalSets,
        volume: totalVolume,
        sessionId: saved?.id,
        exercises: (saved?.exercises ?? []).map((exercise) => ({
          id: exercise.id,
          name: exercise.exercise_snapshot?.name ?? '',
        })),
      });
      setDraft(null);
      setSaveError(null);
    } catch (error) {
      if (isPresetSessionConflictError(error)) {
        // Another device or tab saved this session after we last loaded it.
        // The server kept both sides; tell the user instead of overwriting.
        setSaveError(
          t(
            'exercise.workoutPlaybackDialog.sessionConflictError',
            'This workout was updated on another device or tab. Close the player, reload the diary, and resume it again.'
          )
        );
        return;
      }
      setSaveError(
        t(
          'exercise.workoutPlaybackDialog.finishError',
          'Failed to save workout. Your local progress is still preserved, and you can retry.'
        )
      );
    }
  }, [
    createPresetSession,
    draft,
    elapsedSeconds,
    t,
    timezone,
    totalVolume,
    updatePresetSession,
  ]);

  const handleCloseFinishSummary = useCallback(() => {
    setFinishSummary(null);
    navigate(returnPath, { replace: true });
  }, [navigate, returnPath]);

  if (!draft) {
    if (finishSummary) {
      return (
        <WorkoutPlaybackFinishDialog
          summary={finishSummary}
          onClose={handleCloseFinishSummary}
        />
      );
    }
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

  const replaceCandidates = draft.exercises.map((exercise) => ({
    exerciseId: exercise.exercise_id,
    exerciseName: exercise.exercise_name,
  }));

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
        onLocationChange={handleLocationChange}
        onStartTimeChange={handleStartTimeChange}
      />

      {draft.workout_format && draft.workout_format !== 'standard' && (
        <WorkoutPlaybackIntervalHud
          workoutFormat={draft.workout_format}
          timeCapSeconds={draft.time_cap_seconds}
          startedAtIso={draft.started_at}
          roundsCompleted={draft.interval_rounds_completed ?? 0}
          repsCompleted={draft.interval_reps_completed ?? 0}
          status={draft.interval_status ?? 'rx'}
          exercises={draft.exercises}
          onAddRound={handleAddRound}
          onDecrementRound={handleDecrementRound}
          onSetReps={handleSetIntervalReps}
          onSetStatus={handleSetIntervalStatus}
          onCompletePhaseWork={handleCompleteIntervalPhase}
        />
      )}

      {guidedWorkoutEnabled &&
        (!draft.workout_format || draft.workout_format === 'standard') && (
          <WorkoutPlaybackGuidedCard
            draft={draft}
            getDraft={getDraft}
            updateDraft={updateDraft}
            onCompleteSet={handleCompleteSet}
            onToggleRestPause={handlePauseResumeRest}
          />
        )}

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
        onAddDropSets={handleAddDropSets}
        onReplaceExercise={setReplaceExerciseIndex}
        onAdaptiveDeclined={handleAdaptiveDeclined}
        weightUnit={weightUnit}
      />

      {replaceExerciseIndex !== null && (
        <Suspense fallback={null}>
          <AddExerciseDialog
            open
            onOpenChange={(open) => {
              if (!open) setReplaceExerciseIndex(null);
            }}
            onExerciseAdded={handleReplaceExercise}
            mode="preset"
            replaceFor={buildExerciseReplaceContext(
              replaceCandidates[replaceExerciseIndex],
              replaceCandidates
            )}
          />
        </Suspense>
      )}

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
