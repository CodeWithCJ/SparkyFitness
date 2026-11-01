import {
  adaptiveWeightStepKg,
  applyAdaptiveLoadFactorKg,
  calculateDropSetWeightsKg,
  calculateRampedWeightKg,
  findDropSetBaseIndex,
  instantHourMinute,
  isWeightRampActive,
  resolveExerciseModality,
  setsDurationMinutes,
  weightRampStepIndexes,
  type AdaptiveAdjustment,
  type AdaptiveAdjustmentKind,
  type AdaptiveReason,
  type CreatePresetSessionRequest,
  type ExerciseModality,
  type WorkoutFormat,
} from '@workspace/shared';
import type { WorkoutPreset, WorkoutPresetSet } from '@/types/workout';
import type { Exercise } from '@/types/exercises';
import { defaultSetForModality } from '@/constants/exercises';
import { generateClientId } from '@/utils/generateClientId';

export const DEFAULT_REST_SECONDS = 90;
export const WORKOUT_PLAYBACK_SET_GRID_CLASSES =
  'grid w-full min-w-[48rem] grid-cols-4 gap-2 sm:grid-cols-[7rem_10rem_5rem_6rem_6rem_8rem] sm:gap-x-6 sm:gap-y-2';

export type WorkoutPlaybackRestState = 'idle' | 'running' | 'paused';

export interface WorkoutPlaybackRestTimer {
  state: WorkoutPlaybackRestState;
  duration_seconds: number;
  remaining_seconds: number;
  target_end_timestamp_ms?: number | null;
  target_exercise_index?: number;
  target_set_index?: number;
}
export interface WorkoutPlaybackExerciseDraft {
  exercise_id: string;
  exercise_name: string;
  modality?: ExerciseModality;
  image_url?: string;
  /** All of the exercise's library images, for the full-screen viewer. */
  images?: string[];
  /**
   * The exercise's library instruction lines, read aloud in guided mode.
   * Optional so drafts saved before it existed still load.
   */
  instructions?: string[];
  notes: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  workout_plan_assignment_id?: string | number | null;
  // Progression fields
  progression_mode?:
    'rep_goal' | 'fixed' | 'step_load' | 'manual' | string | null;
  rep_goal?: number | null;
  increment_type?: 'weight' | 'reps' | string | null;
  increment_value?: number | null;
  equipment_brand?: string | null;
  /** Within-session per-set ramp, kg (negative ramps down). Null = off. */
  ramp_increment?: number | null;
  /**
   * The first working set's weight when the ramp was applied (kg). Sets added
   * later continue the ramp from it, never from a weight typed today.
   */
  ramp_base_weight?: number | null;
  round_sets_count?: number;
  sets: WorkoutPlaybackSetDraft[];
  /** Library mechanic (compound/isolation), for variation hints. */
  mechanic?: string | null;
  /** Library equipment, for the plate calculator. */
  equipment?: string[];
  /** Adaptive coaching applied at load (#1560); null/absent = none. */
  adaptive?: WorkoutPlaybackAdaptiveInfo | null;
  /** Done in most recent sessions; suggest a variation (#1560). */
  suggest_variation?: boolean;
}

/** One version of an exercise's prescribed sets (usual or adapted). */
export interface WorkoutPlaybackAdaptiveVariant {
  sets: WorkoutPlaybackSetDraft[];
  ramp_base_weight: number | null;
}

/**
 * Why and how today's sets differ from the usual suggestion, with both
 * versions kept so "use my usual" can switch back (and forth) without
 * recomputing anything.
 */
export interface WorkoutPlaybackAdaptiveInfo {
  reason: AdaptiveReason;
  kind: AdaptiveAdjustmentKind;
  suggest_alternative: boolean;
  declined: boolean;
  usual: WorkoutPlaybackAdaptiveVariant;
  adapted: WorkoutPlaybackAdaptiveVariant;
}

export interface WorkoutPlaybackSetDraft extends WorkoutPresetSet {
  completed: boolean;
  /** ISO timestamp of when the set was checked off; null while incomplete. */
  completed_at: string | null;
  /**
   * Epoch ms a timed/hold set's stopwatch was started. Lives on the draft so a
   * running stopwatch survives re-renders and a page reload; never sent to
   * the server.
   */
  timer_started_at_ms?: number | null;
}

/** Set fields the playback rows edit in place. */
export type WorkoutSetEditableField =
  | 'reps'
  | 'weight'
  | 'duration'
  | 'rest_time'
  | 'set_type'
  | 'notes'
  | 'timer_started_at_ms';

export interface WorkoutPlaybackDraft {
  version: 1;
  preset_id: string;
  name: string;
  description: string | null;
  entry_date: string;
  notes: string | null;
  location?: string | null;
  source: 'sparky';
  workout_format?: WorkoutFormat;
  time_cap_seconds?: number | null;
  interval_rounds_completed?: number;
  interval_reps_completed?: number;
  interval_status?: 'rx' | 'scaled';
  interval_scaling_notes?: string | null;
  active_exercise_index: number;
  active_set_index: number;
  rest_timer: WorkoutPlaybackRestTimer;
  exercises: WorkoutPlaybackExerciseDraft[];
  started_at: string;
  updated_at: string;
  workout_plan_assignment_id?: string | number | null;
  /**
   * Set once the load-time progression and ramp pass has run, so reopening a
   * saved draft doesn't re-apply them over the lifter's edits. Absent on
   * drafts saved before it existed (they get one pass).
   */
  load_adjustments_applied?: boolean;
}

export interface WorkoutSetPointer {
  exerciseIndex: number;
  setIndex: number;
}

export interface WorkoutPlaybackStats {
  totalSets: number;
  completedSets: number;
  completionRate: number;
}

export interface WorkoutPlaybackRouteState {
  returnTo?: string;
  draft?: WorkoutPlaybackDraft | null;
}

const WORKOUT_PLAYBACK_STORAGE_PREFIX = 'sparky.workoutPlaybackDraft.v1';

const DEFAULT_REST_TIMER: WorkoutPlaybackRestTimer = {
  state: 'idle',
  duration_seconds: DEFAULT_REST_SECONDS,
  remaining_seconds: DEFAULT_REST_SECONDS,
  target_end_timestamp_ms: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

export function getWorkoutPlaybackDraftStorageKey(entryDate: string): string {
  return `${WORKOUT_PLAYBACK_STORAGE_PREFIX}:${entryDate}`;
}

function isWorkoutPlaybackDraft(value: unknown): value is WorkoutPlaybackDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as WorkoutPlaybackDraft;
  return (
    draft.version === 1 &&
    typeof draft.preset_id === 'string' &&
    typeof draft.entry_date === 'string' &&
    typeof draft.started_at === 'string' &&
    Array.isArray(draft.exercises)
  );
}

export function loadWorkoutPlaybackDraftFromStorage(
  entryDate: string
): WorkoutPlaybackDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storageKey = getWorkoutPlaybackDraftStorageKey(entryDate);

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isWorkoutPlaybackDraft(parsed)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Failed to load workout playback draft from storage', error);
    return null;
  }
}

export function saveWorkoutPlaybackDraftToStorage(
  draft: WorkoutPlaybackDraft
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const storageKey = getWorkoutPlaybackDraftStorageKey(draft.entry_date);

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch (error) {
    console.error('Failed to save workout playback draft to storage', error);
  }
}

export function clearWorkoutPlaybackDraftFromStorage(entryDate: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(
      getWorkoutPlaybackDraftStorageKey(entryDate)
    );
  } catch (error) {
    console.error('Failed to clear workout playback draft from storage', error);
  }
}

function touchDraft(draft: WorkoutPlaybackDraft): WorkoutPlaybackDraft {
  return { ...draft, updated_at: nowIso() };
}

function syncActiveExerciseTiming(
  draft: WorkoutPlaybackDraft,
  previousExerciseIndex: number,
  nextExerciseIndex: number
): WorkoutPlaybackDraft {
  if (previousExerciseIndex === nextExerciseIndex) {
    const timestamp = nowIso();
    const exercises = draft.exercises.map((exercise, index) => {
      if (index !== nextExerciseIndex) {
        return exercise;
      }

      return {
        ...exercise,
        started_at: exercise.started_at ?? timestamp,
        ended_at: null,
      };
    });

    return touchDraft({ ...draft, exercises });
  }

  const timestamp = nowIso();
  const exercises = draft.exercises.map((exercise, index) => {
    if (index === previousExerciseIndex) {
      return {
        ...exercise,
        ended_at: timestamp,
      };
    }

    if (index === nextExerciseIndex) {
      return {
        ...exercise,
        started_at: exercise.started_at ?? timestamp,
        ended_at: null,
      };
    }

    return exercise;
  });

  return touchDraft({ ...draft, exercises });
}

function isValidPointer(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer
): boolean {
  const exercise = draft.exercises[pointer.exerciseIndex];
  if (!exercise) return false;
  return pointer.setIndex >= 0 && pointer.setIndex < exercise.sets.length;
}

function fallbackPointer(draft: WorkoutPlaybackDraft): WorkoutSetPointer {
  for (
    let exerciseIndex = 0;
    exerciseIndex < draft.exercises.length;
    exerciseIndex += 1
  ) {
    const exercise = draft.exercises[exerciseIndex];
    if (exercise && exercise.sets.length > 0) {
      return { exerciseIndex, setIndex: 0 };
    }
  }

  return { exerciseIndex: 0, setIndex: 0 };
}

export function getSetByPointer(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer
): WorkoutPlaybackSetDraft | null {
  const exercise = draft.exercises[pointer.exerciseIndex];
  if (!exercise) return null;
  return exercise.sets[pointer.setIndex] ?? null;
}

export function listWorkoutSetPointers(
  draft: WorkoutPlaybackDraft
): WorkoutSetPointer[] {
  const pointers: WorkoutSetPointer[] = [];
  draft.exercises.forEach((exercise, exerciseIndex) => {
    exercise.sets.forEach((_, setIndex) => {
      pointers.push({ exerciseIndex, setIndex });
    });
  });
  return pointers;
}

export function getCurrentWorkoutSetPointer(
  draft: WorkoutPlaybackDraft
): WorkoutSetPointer {
  const pointer = {
    exerciseIndex: draft.active_exercise_index,
    setIndex: draft.active_set_index,
  };
  if (isValidPointer(draft, pointer)) {
    return pointer;
  }
  return fallbackPointer(draft);
}

export function getWorkoutPlaybackStats(
  draft: WorkoutPlaybackDraft
): WorkoutPlaybackStats {
  let totalSets = 0;
  let completedSets = 0;

  draft.exercises.forEach((exercise) => {
    totalSets += exercise.sets.length;
    completedSets += exercise.sets.filter((set) => set.completed).length;
  });

  return {
    totalSets,
    completedSets,
    completionRate: totalSets > 0 ? completedSets / totalSets : 0,
  };
}

export function isWorkoutPlaybackComplete(
  draft: WorkoutPlaybackDraft
): boolean {
  const stats = getWorkoutPlaybackStats(draft);
  return stats.totalSets > 0 && stats.completedSets === stats.totalSets;
}

export function createWorkoutPlaybackDraftFromPreset(
  preset: WorkoutPreset,
  entryDate: string
): WorkoutPlaybackDraft {
  const createdAt = nowIso();

  const exercises: WorkoutPlaybackExerciseDraft[] = preset.exercises.map(
    (exercise, exerciseIndex) => {
      return {
        exercise_id: exercise.exercise_id,
        exercise_name:
          exercise.exercise_name ||
          exercise.exercise?.name ||
          `Exercise ${exerciseIndex + 1}`,
        image_url: exercise.image_url || exercise.exercise?.images?.[0],
        images: exercise.exercise?.images ?? undefined,
        instructions: exercise.exercise?.instructions ?? undefined,
        mechanic: exercise.exercise?.mechanic ?? null,
        equipment: exercise.exercise?.equipment ?? undefined,
        modality: resolveExerciseModality(
          exercise.modality ?? exercise.exercise?.modality,
          exercise.category ?? exercise.exercise?.category
        ),
        notes:
          'notes' in exercise
            ? ((exercise as { notes?: string | null }).notes ?? null)
            : null,
        started_at: null,
        ended_at: null,
        workout_plan_assignment_id:
          'workout_plan_assignment_id' in exercise
            ? ((exercise as { workout_plan_assignment_id?: number | null })
                .workout_plan_assignment_id ?? null)
            : null,
        // Preserve progression settings
        ...('progression_mode' in exercise
          ? {
              progression_mode: (exercise as { progression_mode?: string })
                .progression_mode,
            }
          : {}),
        ...('rep_goal' in exercise
          ? { rep_goal: (exercise as { rep_goal?: number }).rep_goal }
          : {}),
        ...('increment_type' in exercise
          ? {
              increment_type: (
                exercise as { increment_type?: 'weight' | 'reps' }
              ).increment_type,
            }
          : {}),
        ...('increment_value' in exercise
          ? {
              increment_value: Number(
                (exercise as { increment_value?: number }).increment_value
              ),
            }
          : {}),
        ...('equipment_brand' in exercise
          ? {
              equipment_brand: (exercise as { equipment_brand?: string })
                .equipment_brand,
            }
          : {}),
        ramp_increment:
          exercise.ramp_increment != null
            ? Number(exercise.ramp_increment)
            : null,
        sets: (() => {
          let baseSets = exercise.sets;
          if (baseSets.length > 0) {
            if (preset.workout_format === 'tabata' && baseSets.length < 8) {
              baseSets = Array.from({ length: 8 }, (_, i) => {
                const templateSet = baseSets[i % baseSets.length]!;
                return {
                  ...templateSet,
                  set_number: i + 1,
                  duration: templateSet.duration ?? 20,
                  rest_time: templateSet.rest_time ?? 10,
                };
              });
            } else if (
              preset.workout_format === 'emom' &&
              preset.time_cap_seconds != null &&
              preset.time_cap_seconds >= 60
            ) {
              const emomRounds = Math.floor(preset.time_cap_seconds / 60);
              if (emomRounds > baseSets.length) {
                baseSets = Array.from({ length: emomRounds }, (_, i) => {
                  const templateSet = baseSets[i % baseSets.length]!;
                  return {
                    ...templateSet,
                    set_number: i + 1,
                  };
                });
              }
            }
          }

          return baseSets.map((set, setIndex) => {
            const initialWeight = set.weight ?? null;
            const initialReps = set.reps;

            return {
              set_number: set.set_number ?? setIndex + 1,
              set_type: set.set_type ?? 'Working Set',
              reps: initialReps,
              weight: initialWeight,
              duration: set.duration ?? null,
              distance: set.distance ?? null,
              rest_time: set.rest_time ?? DEFAULT_REST_SECONDS,
              notes: set.notes ?? null,
              rpe: set.rpe ?? null,
              completed: false,
              completed_at: null,
            };
          });
        })(),
        round_sets_count: Math.max(1, exercise.sets.length),
      };
    }
  );

  const draft: WorkoutPlaybackDraft = {
    version: 1,
    preset_id: String(preset.id),
    name: preset.name,
    description: preset.description ?? null,
    entry_date: entryDate,
    notes: null,
    source: 'sparky',
    workout_format: preset.workout_format ?? 'standard',
    time_cap_seconds: preset.time_cap_seconds ?? null,
    interval_rounds_completed: 0,
    interval_reps_completed: 0,
    interval_status: 'rx',
    interval_scaling_notes: null,
    active_exercise_index: 0,
    active_set_index: 0,
    rest_timer: DEFAULT_REST_TIMER,
    exercises,
    started_at: createdAt,
    updated_at: createdAt,
  };

  const pointer = fallbackPointer(draft);
  draft.active_exercise_index = pointer.exerciseIndex;
  draft.active_set_index = pointer.setIndex;
  draft.exercises = draft.exercises.map((exercise, index) =>
    index === pointer.exerciseIndex
      ? { ...exercise, started_at: createdAt, ended_at: null }
      : exercise
  );

  return draft;
}

export function createWorkoutPlaybackRouteState(
  preset: WorkoutPreset,
  entryDate: string,
  returnTo?: string
): WorkoutPlaybackRouteState {
  return {
    returnTo,
    draft: createWorkoutPlaybackDraftFromPreset(preset, entryDate),
  };
}

export function createWorkoutPlaybackDraftFromExercise(
  exercise: Exercise,
  entryDate: string
): WorkoutPlaybackDraft {
  const modality = resolveExerciseModality(
    exercise.modality,
    exercise.category
  );
  const preset: WorkoutPreset = {
    id: `quick-exercise-${exercise.id}`,
    user_id: exercise.user_id || '',
    name: exercise.name,
    description: exercise.description || undefined,
    exercises: [
      {
        id: generateClientId(),
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        exercise,
        category: exercise.category ?? undefined,
        modality,
        superset_group: null,
        sets: [defaultSetForModality(modality)],
      },
    ],
  };

  return createWorkoutPlaybackDraftFromPreset(preset, entryDate);
}

export function createWorkoutPlaybackRouteStateFromExercise(
  exercise: Exercise,
  entryDate: string,
  returnTo?: string
): WorkoutPlaybackRouteState {
  return {
    returnTo,
    draft: createWorkoutPlaybackDraftFromExercise(exercise, entryDate),
  };
}

export function getWorkoutPlaybackRestRemainingSeconds(
  restTimer: WorkoutPlaybackRestTimer,
  nowMs: number = Date.now()
): number {
  if (restTimer.state !== 'running') {
    return Math.max(0, restTimer.remaining_seconds);
  }

  if (typeof restTimer.target_end_timestamp_ms !== 'number') {
    return Math.max(0, restTimer.remaining_seconds);
  }

  return Math.max(
    0,
    Math.ceil((restTimer.target_end_timestamp_ms - nowMs) / 1000)
  );
}

export function setWorkoutPlaybackPointer(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer
): WorkoutPlaybackDraft {
  if (!isValidPointer(draft, pointer)) {
    return draft;
  }

  return syncActiveExerciseTiming(
    {
      ...draft,
      active_exercise_index: pointer.exerciseIndex,
      active_set_index: pointer.setIndex,
    },
    draft.active_exercise_index,
    pointer.exerciseIndex
  );
}

function getPointerIndex(
  pointers: WorkoutSetPointer[],
  pointer: WorkoutSetPointer
): number {
  return pointers.findIndex(
    (p) =>
      p.exerciseIndex === pointer.exerciseIndex &&
      p.setIndex === pointer.setIndex
  );
}

function updateSetAtPointer(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer,
  updater: (set: WorkoutPlaybackSetDraft) => WorkoutPlaybackSetDraft
): WorkoutPlaybackDraft {
  if (!isValidPointer(draft, pointer)) {
    return draft;
  }

  const exercises = draft.exercises.map((exercise, exerciseIndex) => {
    if (exerciseIndex !== pointer.exerciseIndex) {
      return exercise;
    }

    const sets = exercise.sets.map((set, setIndex) =>
      setIndex === pointer.setIndex ? updater(set) : set
    );
    return { ...exercise, sets };
  });

  return touchDraft({ ...draft, exercises });
}

export function toggleWorkoutSetCompletion(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer
): WorkoutPlaybackDraft {
  return updateSetAtPointer(draft, pointer, (set) => ({
    ...set,
    completed: !set.completed,
    completed_at: set.completed ? null : new Date().toISOString(),
  }));
}

export function updateWorkoutSetAtPointer(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer,
  updates: Partial<WorkoutPlaybackSetDraft>
): WorkoutPlaybackDraft {
  return updateSetAtPointer(draft, pointer, (set) => ({
    ...set,
    ...updates,
  }));
}

/**
 * The weight a set added at the end of the exercise takes from the per-set
 * ramp: the next step from the base captured when the workout opened. Null
 * when no ramp applies (off, non-standard format, no base, or the new set is
 * a warm-up/drop set), in which case the set copies the one above.
 */
function nextRampedWeight(
  draft: WorkoutPlaybackDraft,
  exercise: WorkoutPlaybackExerciseDraft,
  newSetType: string | null | undefined,
  weightUnit: string | undefined
): number | null {
  const ramp = exercise.ramp_increment;
  const base = exercise.ramp_base_weight;
  if (
    weightUnit === undefined ||
    (draft.workout_format ?? 'standard') !== 'standard' ||
    !isWeightRampActive(ramp) ||
    base == null ||
    base <= 0
  ) {
    return null;
  }
  const step = weightRampStepIndexes([
    ...exercise.sets,
    { set_type: newSetType },
  ]).at(-1);
  if (step == null || step === 0) {
    return null;
  }
  return calculateRampedWeightKg(
    base,
    step,
    ramp,
    weightUnit === 'kg' ? 'kg' : 'lbs'
  );
}

/**
 * Append a set that copies the last one. With a per-set ramp (and the
 * lifter's `weightUnit` for rounding), a working set instead continues the
 * ramp: 10 / 12 → a new set at 14.
 */
export function addWorkoutSetToExercise(
  draft: WorkoutPlaybackDraft,
  exerciseIndex: number,
  weightUnit?: string
): WorkoutPlaybackDraft {
  const exercise = draft.exercises[exerciseIndex];
  if (!exercise) {
    return draft;
  }

  const lastSet = exercise.sets[exercise.sets.length - 1];
  const setType = lastSet?.set_type ?? 'Working Set';
  const newSet: WorkoutPlaybackSetDraft = {
    set_number: exercise.sets.length + 1,
    set_type: setType,
    reps: lastSet?.reps ?? null,
    weight:
      nextRampedWeight(draft, exercise, setType, weightUnit) ??
      lastSet?.weight ??
      null,
    duration: lastSet?.duration ?? null,
    distance: lastSet?.distance ?? null,
    rest_time: lastSet?.rest_time ?? DEFAULT_REST_SECONDS,
    notes: lastSet?.notes ?? null,
    rpe: lastSet?.rpe ?? null,
    completed: false,
    completed_at: null,
  };

  const exercises = draft.exercises.map((currentExercise, index) => {
    if (index !== exerciseIndex) {
      return currentExercise;
    }
    return {
      ...currentExercise,
      sets: [...currentExercise.sets, newSet].map((set, setIndex) => ({
        ...set,
        set_number: setIndex + 1,
      })),
    };
  });

  const nextDraft: WorkoutPlaybackDraft = {
    ...draft,
    exercises,
  };

  if (exercise.sets.length === 0) {
    nextDraft.active_exercise_index = exerciseIndex;
    nextDraft.active_set_index = 0;
  }

  return touchDraft(nextDraft);
}

/**
 * Pre-fill the exercise's per-set ramp: the first working set keeps its
 * weight (the preset's, or the progression-bumped one) and each later working
 * set steps by `ramp_increment` kg from it, rounded to a loadable weight in
 * the lifter's unit. Warm-up and drop sets are skipped, completed sets are
 * never rewritten, and the base is never what was lifted today — this runs
 * once when the draft loads, not as sets are logged. Returns the same object
 * when nothing changes.
 */
export function applyWeightRampToDraftExercise(
  exercise: WorkoutPlaybackExerciseDraft,
  weightUnit: string
): WorkoutPlaybackExerciseDraft {
  const ramp = exercise.ramp_increment;
  if (!isWeightRampActive(ramp)) {
    return exercise;
  }
  const steps = weightRampStepIndexes(exercise.sets);
  const baseWeight = exercise.sets[steps.indexOf(0)]?.weight;
  if (baseWeight == null || baseWeight <= 0) {
    return exercise;
  }
  const unit = weightUnit === 'kg' ? 'kg' : 'lbs';
  let changed = exercise.ramp_base_weight !== baseWeight;
  const sets = exercise.sets.map((set, index) => {
    const step = steps[index];
    if (step == null || step === 0 || set.completed) {
      return set;
    }
    const weight = calculateRampedWeightKg(baseWeight, step, ramp, unit);
    if (weight === set.weight) {
      return set;
    }
    changed = true;
    return { ...set, weight };
  });
  return changed
    ? { ...exercise, sets, ramp_base_weight: baseWeight }
    : exercise;
}

/**
 * Append drop sets after the exercise's last working set with a weight
 * (warm-up and earlier drop sets are skipped), rounded in the lifter's
 * display unit. Weights stay editable like any other set.
 */
export function addDropSetsToWorkoutExercise(
  draft: WorkoutPlaybackDraft,
  exerciseIndex: number,
  weightUnit: 'kg' | 'lbs'
): WorkoutPlaybackDraft {
  const exercise = draft.exercises[exerciseIndex];
  if (!exercise) {
    return draft;
  }
  const baseSet = exercise.sets[findDropSetBaseIndex(exercise.sets)];
  if (!baseSet) {
    return draft;
  }
  const dropWeights = calculateDropSetWeightsKg(
    Number(baseSet.weight),
    weightUnit
  );

  const lastSet = exercise.sets[exercise.sets.length - 1];
  const newSets: WorkoutPlaybackSetDraft[] = dropWeights.map((w, idx) => ({
    set_number: exercise.sets.length + idx + 1,
    set_type: 'Drop Set',
    reps: lastSet?.reps ?? null,
    weight: w,
    duration: null,
    distance: null,
    rest_time: lastSet?.rest_time ?? DEFAULT_REST_SECONDS,
    notes: null,
    rpe: null,
    rir: null,
    completed: false,
    completed_at: null,
  }));

  const exercises = draft.exercises.map((currentExercise, index) => {
    if (index !== exerciseIndex) {
      return currentExercise;
    }
    return {
      ...currentExercise,
      sets: [...currentExercise.sets, ...newSets].map((set, setIndex) => ({
        ...set,
        set_number: setIndex + 1,
      })),
    };
  });

  return touchDraft({
    ...draft,
    exercises,
  });
}

export function removeWorkoutSetFromExercise(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer
): WorkoutPlaybackDraft {
  const exercise = draft.exercises[pointer.exerciseIndex];
  if (!exercise || exercise.sets.length <= 1) {
    return draft;
  }

  const exercises = draft.exercises.map((currentExercise, exerciseIndex) => {
    if (exerciseIndex !== pointer.exerciseIndex) {
      return currentExercise;
    }

    return {
      ...currentExercise,
      sets: currentExercise.sets
        .filter((_, setIndex) => setIndex !== pointer.setIndex)
        .map((set, setIndex) => ({
          ...set,
          set_number: setIndex + 1,
        })),
    };
  });

  const nextDraft: WorkoutPlaybackDraft = {
    ...draft,
    exercises,
  };

  if (nextDraft.active_exercise_index === pointer.exerciseIndex) {
    if (nextDraft.active_set_index > pointer.setIndex) {
      nextDraft.active_set_index -= 1;
    } else if (nextDraft.active_set_index === pointer.setIndex) {
      const remainingSets =
        nextDraft.exercises[pointer.exerciseIndex]?.sets.length ?? 0;
      nextDraft.active_set_index = Math.max(
        0,
        Math.min(pointer.setIndex, remainingSets - 1)
      );
    }
  }

  const nextPointer = getCurrentWorkoutSetPointer(nextDraft);
  const previousActiveExerciseIndex = draft.active_exercise_index;
  nextDraft.active_exercise_index = nextPointer.exerciseIndex;
  nextDraft.active_set_index = nextPointer.setIndex;

  if (nextDraft.rest_timer.target_exercise_index === pointer.exerciseIndex) {
    const targetSetIndex = nextDraft.rest_timer.target_set_index;

    if (targetSetIndex === pointer.setIndex) {
      nextDraft.rest_timer = {
        ...nextDraft.rest_timer,
        state: 'idle',
        remaining_seconds: nextDraft.rest_timer.duration_seconds,
        target_end_timestamp_ms: null,
        target_exercise_index: undefined,
        target_set_index: undefined,
      };
    } else if (
      typeof targetSetIndex === 'number' &&
      targetSetIndex > pointer.setIndex
    ) {
      nextDraft.rest_timer = {
        ...nextDraft.rest_timer,
        target_set_index: targetSetIndex - 1,
      };
    }
  }

  return syncActiveExerciseTiming(
    nextDraft,
    previousActiveExerciseIndex,
    nextPointer.exerciseIndex
  );
}

function getNextIncompletePointer(
  draft: WorkoutPlaybackDraft,
  fromPointer: WorkoutSetPointer
): WorkoutSetPointer | null {
  const pointers = listWorkoutSetPointers(draft);
  const currentIndex = getPointerIndex(pointers, fromPointer);
  if (currentIndex < 0) {
    return null;
  }

  for (let i = currentIndex + 1; i < pointers.length; i += 1) {
    const pointer = pointers[i];
    if (pointer && !getSetByPointer(draft, pointer)?.completed) {
      return pointer;
    }
  }

  for (let i = 0; i < currentIndex; i += 1) {
    const pointer = pointers[i];
    if (pointer && !getSetByPointer(draft, pointer)?.completed) {
      return pointer;
    }
  }

  return null;
}

function isWarmupSet(setType: string | null | undefined): boolean {
  return !!setType && setType.toLowerCase().includes('warm');
}

/**
 * The adapted working-set weights for one exercise (#1560), in kg: one step
 * heavier for a "too easy twice" increase the engine didn't already make,
 * and a load factor (rounded down to a loadable step in the lifter's unit)
 * for a lighter day. Warm-ups, completed sets and unweighted sets are left
 * alone.
 */
export function adaptDraftExerciseSets(
  exercise: WorkoutPlaybackExerciseDraft,
  adjustment: AdaptiveAdjustment,
  addIncrementKg: number | null,
  weightUnit: string
): WorkoutPlaybackExerciseDraft {
  const unit = weightUnit === 'kg' ? 'kg' : 'lbs';
  let changed = false;
  const sets = exercise.sets.map((set) => {
    if (set.completed || isWarmupSet(set.set_type)) return set;
    if (set.weight == null || set.weight <= 0) return set;
    let weightKg = set.weight;
    if (addIncrementKg != null && addIncrementKg > 0) {
      weightKg += addIncrementKg;
    }
    weightKg = applyAdaptiveLoadFactorKg(weightKg, adjustment.loadFactor, unit);
    if (weightKg === set.weight) return set;
    changed = true;
    return { ...set, weight: weightKg };
  });
  return changed ? { ...exercise, sets } : exercise;
}

/** The kg a "too easy twice" increase adds when the preset sets none. */
export function adaptiveDefaultIncrementKg(weightUnit: string): number {
  return adaptiveWeightStepKg(weightUnit === 'kg' ? 'kg' : 'lbs');
}

/**
 * Switch one exercise between its adapted and usual sets ("use my usual").
 * Only sets not yet completed change; a completed set keeps what was done.
 */
export function setWorkoutAdaptiveDeclined(
  draft: WorkoutPlaybackDraft,
  exerciseIndex: number,
  declined: boolean
): WorkoutPlaybackDraft {
  const exercise = draft.exercises[exerciseIndex];
  const adaptive = exercise?.adaptive;
  if (!exercise || !adaptive || adaptive.declined === declined) return draft;
  const variant = declined ? adaptive.usual : adaptive.adapted;
  const sets = exercise.sets.map((set, index) => {
    const target = variant.sets[index];
    if (set.completed || !target) return set;
    return { ...set, weight: target.weight, reps: target.reps };
  });
  const exercises = draft.exercises.map((entry, index) =>
    index === exerciseIndex
      ? {
          ...entry,
          sets,
          ramp_base_weight: variant.ramp_base_weight,
          adaptive: { ...adaptive, declined },
        }
      : entry
  );
  return touchDraft({ ...draft, exercises });
}

/**
 * Swap the exercise at `exerciseIndex` for `exercise` in place, keeping its
 * position and notes. Mirrors mobile's `replaceExercise`: the
 * old sets described a different movement, so they reset to one default set
 * for the new exercise's modality, and the replaced exercise's progression
 * and ramp settings are dropped rather than applied to the new one.
 */
export function replaceExerciseInWorkoutDraft(
  draft: WorkoutPlaybackDraft,
  exerciseIndex: number,
  exercise: Exercise
): WorkoutPlaybackDraft {
  const current = draft.exercises[exerciseIndex];
  if (!current) return draft;
  const modality = resolveExerciseModality(
    exercise.modality,
    exercise.category
  );
  const defaultSet = defaultSetForModality(modality);
  const replaced: WorkoutPlaybackExerciseDraft = {
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    modality,
    image_url: exercise.images?.[0],
    images: exercise.images ?? undefined,
    instructions: exercise.instructions ?? undefined,
    notes: current.notes,
    started_at: current.started_at,
    ended_at: current.ended_at,
    workout_plan_assignment_id: current.workout_plan_assignment_id,
    ramp_increment: null,
    ramp_base_weight: null,
    mechanic: exercise.mechanic ?? null,
    equipment: exercise.equipment ?? undefined,
    adaptive: null,
    suggest_variation: false,
    round_sets_count: 1,
    sets: [
      {
        ...defaultSet,
        set_number: 1,
        set_type: defaultSet.set_type ?? 'Working Set',
        duration: defaultSet.duration ?? null,
        distance: null,
        rest_time: current.sets[0]?.rest_time ?? DEFAULT_REST_SECONDS,
        notes: null,
        rpe: null,
        completed: false,
        completed_at: null,
      },
    ],
  };
  const exercises = draft.exercises.map((entry, index) =>
    index === exerciseIndex ? replaced : entry
  );
  const isActive = draft.active_exercise_index === exerciseIndex;
  return touchDraft({
    ...draft,
    exercises,
    active_set_index: isActive ? 0 : draft.active_set_index,
  });
}

export function completeCurrentWorkoutSet(
  draft: WorkoutPlaybackDraft
): WorkoutPlaybackDraft {
  const currentPointer = getCurrentWorkoutSetPointer(draft);
  const currentSet = getSetByPointer(draft, currentPointer);
  if (!currentSet || currentSet.completed) {
    return draft;
  }

  let nextDraft = updateSetAtPointer(draft, currentPointer, (set) => ({
    ...set,
    completed: true,
    completed_at: new Date().toISOString(),
  }));

  const nextPointer = getNextIncompletePointer(nextDraft, currentPointer);
  if (!nextPointer) {
    return nextDraft;
  }

  nextDraft = setWorkoutPlaybackPointer(nextDraft, nextPointer);
  return nextDraft;
}

export function setWorkoutPlaybackRestTimer(
  draft: WorkoutPlaybackDraft,
  restTimer: WorkoutPlaybackRestTimer
): WorkoutPlaybackDraft {
  return touchDraft({ ...draft, rest_timer: restTimer });
}

function toNullableNumber(value: number | null | undefined): number | null {
  return value === undefined ? null : value;
}

function deriveExerciseDurationMinutes(
  exercise: WorkoutPlaybackExerciseDraft,
  nowMs: number = Date.now()
): number {
  const startMs = exercise.started_at ? Date.parse(exercise.started_at) : NaN;
  if (!Number.isNaN(startMs)) {
    const endMs = exercise.ended_at ? Date.parse(exercise.ended_at) : nowMs;
    if (!Number.isNaN(endMs) && endMs >= startMs) {
      return (endMs - startMs) / 60000;
    }
  }

  return setsDurationMinutes(exercise.sets);
}

export function addRoundToWorkoutDraft(
  draft: WorkoutPlaybackDraft
): WorkoutPlaybackDraft {
  const exercises = draft.exercises.map((exercise) => {
    const roundSetsCount = Math.max(1, exercise.round_sets_count || 1);
    const templateSets = exercise.sets.slice(-roundSetsCount);
    const fallbackSet: WorkoutPlaybackSetDraft = {
      set_number: 1,
      set_type: 'Working Set',
      reps: 10,
      weight: 0,
      duration: null,
      distance: null,
      rest_time: null,
      notes: null,
      rpe: null,
      completed: false,
      completed_at: null,
    };

    const sources = templateSets.length > 0 ? templateSets : [fallbackSet];
    const newSets: WorkoutPlaybackSetDraft[] = sources.map((set, idx) => ({
      ...set,
      set_number: exercise.sets.length + idx + 1,
      completed: false,
      completed_at: null,
    }));

    return {
      ...exercise,
      sets: [...exercise.sets, ...newSets],
    };
  });

  const nextRounds = (draft.interval_rounds_completed ?? 0) + 1;

  return touchDraft({
    ...draft,
    exercises,
    interval_rounds_completed: nextRounds,
  });
}

export function decrementRoundFromWorkoutDraft(
  draft: WorkoutPlaybackDraft
): WorkoutPlaybackDraft {
  const currentRounds = draft.interval_rounds_completed ?? 0;
  if (currentRounds <= 0) return draft;

  const exercises = draft.exercises.map((exercise) => {
    const roundSetsCount = Math.max(1, exercise.round_sets_count || 1);
    if (exercise.sets.length > roundSetsCount) {
      return {
        ...exercise,
        sets: exercise.sets.slice(0, -roundSetsCount),
      };
    }
    return exercise;
  });

  const nextDraft: WorkoutPlaybackDraft = {
    ...draft,
    exercises,
    interval_rounds_completed: Math.max(0, currentRounds - 1),
  };

  const nextPointer = getCurrentWorkoutSetPointer(nextDraft);
  nextDraft.active_exercise_index = nextPointer.exerciseIndex;
  nextDraft.active_set_index = nextPointer.setIndex;

  return touchDraft(nextDraft);
}

export function buildPresetSessionCreateRequestFromDraft(
  draft: WorkoutPlaybackDraft,
  timezone: string
): CreatePresetSessionRequest {
  const exercises = draft.exercises
    .map((exercise, exerciseIndex) => {
      const completedSets = exercise.sets.filter((set) => set.completed);
      if (completedSets.length === 0) {
        return null;
      }

      let entryTime: string | null = null;
      const startTimestamp = draft.started_at;
      if (startTimestamp) {
        try {
          const hm = instantHourMinute(startTimestamp, timezone);
          entryTime = `${String(hm.hour).padStart(2, '0')}:${String(hm.minute).padStart(2, '0')}`;
        } catch (e) {
          console.error('Failed to parse draft started_at:', e);
        }
      }

      return {
        exercise_id: exercise.exercise_id,
        sort_order: exerciseIndex,
        duration_minutes: deriveExerciseDurationMinutes(exercise),
        notes: exercise.notes ?? null,
        entry_time: entryTime,
        workout_plan_assignment_id: exercise.workout_plan_assignment_id ?? null,
        sets: completedSets.map((set, setIndex) => ({
          set_number: setIndex + 1,
          set_type: set.set_type ?? null,
          reps: toNullableNumber(set.reps),
          weight: toNullableNumber(set.weight),
          duration: toNullableNumber(set.duration),
          distance: toNullableNumber(set.distance),
          rest_time: toNullableNumber(set.rest_time),
          notes: set.notes ?? null,
          rpe: toNullableNumber(set.rpe),
          rir: toNullableNumber(set.rir),
          // `?? null` also covers persisted drafts that predate the field.
          completed_at: set.completed_at ?? null,
          // Web playback makes no PR claims — drafts never carry PRs, and the
          // server owns PR detection. Always false on create.
          is_pr: false,
        })),
      };
    })
    .filter((exercise): exercise is NonNullable<typeof exercise> => !!exercise);

  const primaryPlanAssignmentId =
    draft.workout_plan_assignment_id ||
    draft.exercises.find((e) => e.workout_plan_assignment_id)
      ?.workout_plan_assignment_id ||
    null;

  const numericPresetId =
    draft.preset_id && !Number.isNaN(Number(draft.preset_id))
      ? Number(draft.preset_id)
      : null;

  const activityDetails: NonNullable<
    CreatePresetSessionRequest['activity_details']
  > = [];
  if (draft.workout_format && draft.workout_format !== 'standard') {
    const elapsedSeconds = draft.started_at
      ? Math.max(
          0,
          Math.floor((Date.now() - Date.parse(draft.started_at)) / 1000)
        )
      : 0;

    let scoreType: 'time' | 'rounds_reps' | 'total_reps' | 'completion' =
      'completion';
    if (draft.workout_format === 'amrap') {
      scoreType = 'rounds_reps';
    } else if (draft.workout_format === 'for_time') {
      scoreType = 'time';
    } else if (
      draft.workout_format === 'emom' ||
      draft.workout_format === 'tabata'
    ) {
      scoreType = 'rounds_reps';
    }

    activityDetails.push({
      provider_name: 'sparky',
      detail_type: 'wod_score',
      detail_data: {
        workout_format: draft.workout_format,
        time_cap_seconds: draft.time_cap_seconds ?? null,
        score_type: scoreType,
        rounds_completed: draft.interval_rounds_completed ?? 0,
        reps_completed: draft.interval_reps_completed ?? 0,
        elapsed_seconds: elapsedSeconds,
        status: draft.interval_status ?? 'rx',
        scaling_notes: draft.interval_scaling_notes ?? null,
      },
    });
  }

  return {
    workout_preset_id: numericPresetId,
    name: draft.name,
    description: draft.description,
    notes: draft.notes,
    location: draft.location?.trim().slice(0, 255) || null,
    entry_date: draft.entry_date,
    source: draft.source,
    exercises,
    workoutPlanAssignmentId: primaryPlanAssignmentId,
    activity_details: activityDetails.length > 0 ? activityDetails : undefined,
  };
}
