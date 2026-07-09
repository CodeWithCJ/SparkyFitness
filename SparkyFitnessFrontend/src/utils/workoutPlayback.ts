import type { CreatePresetSessionRequest } from '@workspace/shared';
import type { WorkoutPreset, WorkoutPresetSet } from '@/types/workout';

export const DEFAULT_REST_SECONDS = 90;
export const WORKOUT_PLAYBACK_SET_GRID_CLASSES =
  'grid w-full min-w-[48rem] grid-cols-4 gap-2 sm:grid-cols-[7rem_10rem_5rem_6rem_6rem_6rem] sm:gap-x-6 sm:gap-y-2';

export type WorkoutPlaybackRestState = 'idle' | 'running' | 'paused';

export interface WorkoutPlaybackRestTimer {
  state: WorkoutPlaybackRestState;
  duration_seconds: number;
  remaining_seconds: number;
  target_end_timestamp_ms?: number | null;
  target_exercise_index?: number;
  target_set_index?: number;
}

export interface WorkoutPlaybackSetDraft extends WorkoutPresetSet {
  completed: boolean;
  /** ISO timestamp of when the set was checked off; null while incomplete. */
  completed_at: string | null;
}

export interface WorkoutPlaybackExerciseDraft {
  exercise_id: string;
  exercise_name: string;
  image_url?: string;
  notes: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  sets: WorkoutPlaybackSetDraft[];
}

export interface WorkoutPlaybackDraft {
  version: 1;
  preset_id: string;
  name: string;
  description: string | null;
  entry_date: string;
  notes: string | null;
  source: 'sparky';
  active_exercise_index: number;
  active_set_index: number;
  rest_timer: WorkoutPlaybackRestTimer;
  exercises: WorkoutPlaybackExerciseDraft[];
  started_at: string;
  updated_at: string;
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

function getSetByPointer(
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
    (exercise, exerciseIndex) => ({
      exercise_id: exercise.exercise_id,
      exercise_name:
        exercise.exercise_name ||
        exercise.exercise?.name ||
        `Exercise ${exerciseIndex + 1}`,
      image_url: exercise.image_url || exercise.exercise?.images?.[0],
      notes: null,
      started_at: null,
      ended_at: null,
      sets: exercise.sets.map((set, setIndex) => ({
        set_number: set.set_number ?? setIndex + 1,
        set_type: set.set_type ?? 'Working Set',
        reps: set.reps ?? null,
        weight: set.weight ?? null,
        duration: set.duration ?? null,
        rest_time: set.rest_time ?? DEFAULT_REST_SECONDS,
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
        completed: false,
        completed_at: null,
      })),
    })
  );

  const draft: WorkoutPlaybackDraft = {
    version: 1,
    preset_id: String(preset.id),
    name: preset.name,
    description: preset.description ?? null,
    entry_date: entryDate,
    notes: null,
    source: 'sparky',
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

export function getNextWorkoutSetPointer(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer = getCurrentWorkoutSetPointer(draft)
): WorkoutSetPointer | null {
  const pointers = listWorkoutSetPointers(draft);
  const currentIndex = getPointerIndex(pointers, pointer);
  if (currentIndex < 0 || currentIndex >= pointers.length - 1) {
    return null;
  }
  return pointers[currentIndex + 1] ?? null;
}

export function getPreviousWorkoutSetPointer(
  draft: WorkoutPlaybackDraft,
  pointer: WorkoutSetPointer = getCurrentWorkoutSetPointer(draft)
): WorkoutSetPointer | null {
  const pointers = listWorkoutSetPointers(draft);
  const currentIndex = getPointerIndex(pointers, pointer);
  if (currentIndex <= 0) {
    return null;
  }
  return pointers[currentIndex - 1] ?? null;
}

export function moveToNextWorkoutSet(
  draft: WorkoutPlaybackDraft
): WorkoutPlaybackDraft {
  const nextPointer = getNextWorkoutSetPointer(draft);
  if (!nextPointer) {
    return draft;
  }
  return setWorkoutPlaybackPointer(draft, nextPointer);
}

export function moveToPreviousWorkoutSet(
  draft: WorkoutPlaybackDraft
): WorkoutPlaybackDraft {
  const previousPointer = getPreviousWorkoutSetPointer(draft);
  if (!previousPointer) {
    return draft;
  }
  return setWorkoutPlaybackPointer(draft, previousPointer);
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

export function addWorkoutSetToExercise(
  draft: WorkoutPlaybackDraft,
  exerciseIndex: number
): WorkoutPlaybackDraft {
  const exercise = draft.exercises[exerciseIndex];
  if (!exercise) {
    return draft;
  }

  const lastSet = exercise.sets[exercise.sets.length - 1];
  const newSet: WorkoutPlaybackSetDraft = {
    set_number: exercise.sets.length + 1,
    set_type: lastSet?.set_type ?? 'Working Set',
    reps: lastSet?.reps ?? null,
    weight: lastSet?.weight ?? null,
    duration: lastSet?.duration ?? null,
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

function deriveDurationMinutes(sets: WorkoutPlaybackSetDraft[]): number {
  return sets.reduce((sum, set) => {
    const duration = set.duration ?? 0;
    const rest = (set.rest_time ?? 0) / 60;
    return sum + duration + rest;
  }, 0);
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

  return deriveDurationMinutes(exercise.sets);
}

export function buildPresetSessionCreateRequestFromDraft(
  draft: WorkoutPlaybackDraft
): CreatePresetSessionRequest {
  const exercises = draft.exercises
    .map((exercise, exerciseIndex) => {
      const completedSets = exercise.sets.filter((set) => set.completed);
      if (completedSets.length === 0) {
        return null;
      }

      return {
        exercise_id: exercise.exercise_id,
        sort_order: exerciseIndex,
        duration_minutes: deriveExerciseDurationMinutes(exercise),
        notes: exercise.notes ?? null,
        sets: completedSets.map((set, setIndex) => ({
          set_number: setIndex + 1,
          set_type: set.set_type ?? null,
          reps: toNullableNumber(set.reps),
          weight: toNullableNumber(set.weight),
          duration: toNullableNumber(set.duration),
          rest_time: toNullableNumber(set.rest_time),
          notes: set.notes ?? null,
          rpe: toNullableNumber(set.rpe),
          // `?? null` also covers persisted drafts that predate the field.
          completed_at: set.completed_at ?? null,
          // Web playback makes no PR claims — drafts never carry PRs, and the
          // server owns PR detection. Always false on create.
          is_pr: false,
        })),
      };
    })
    .filter((exercise): exercise is NonNullable<typeof exercise> => !!exercise);

  return {
    name: draft.name,
    description: draft.description,
    notes: draft.notes,
    entry_date: draft.entry_date,
    source: draft.source,
    exercises,
  };
}
