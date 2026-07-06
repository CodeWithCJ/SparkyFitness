import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  ExerciseSessionResponse,
  PresetSessionExerciseRequest,
  PresetSessionResponse,
} from '@workspace/shared';
import type { IconName } from '../components/Icon';
import type { WorkoutDraftExercise } from '../types/drafts';
import type { WorkoutPresetExercisePayload } from '../services/api/workoutPresetsApi';
import { weightToKg, weightFromKg, distanceFromKm } from './unitConversions';
import { parseDecimalInput } from './numericInput';

export const CATEGORY_ICON_MAP: Record<string, IconName> = {
  Strength: 'exercise-weights',
  Cardio: 'exercise-running',
  Running: 'exercise-running',
  Cycling: 'exercise-cycling',
  Swimming: 'exercise-swimming',
  Walking: 'exercise-walking',
  Hiking: 'exercise-hiking',
  Yoga: 'exercise-yoga',
  Pilates: 'exercise-pilates',
  Dance: 'exercise-dance',
  Boxing: 'exercise-boxing',
  Rowing: 'exercise-rowing',
  Tennis: 'exercise-tennis',
  Basketball: 'exercise-basketball',
  Soccer: 'exercise-soccer',
  Elliptical: 'exercise-elliptical',
  'Stair Stepper': 'exercise-stair',
};

// Keyword matching for exercise names that don't exactly match CATEGORY_ICON_MAP keys
// (e.g. HealthKit's "Traditional Strength Training", "Stair Climbing")
const NAME_KEYWORDS: [string, IconName][] = [
  ['cycling', 'exercise-cycling'],
  ['biking', 'exercise-cycling'],
  ['swim', 'exercise-swimming'],
  ['walk', 'exercise-walking'],
  ['hik', 'exercise-hiking'],
  ['yoga', 'exercise-yoga'],
  ['pilates', 'exercise-pilates'],
  ['danc', 'exercise-dance'],
  ['box', 'exercise-boxing'],
  ['row', 'exercise-rowing'],
  ['tennis', 'exercise-tennis'],
  ['basketball', 'exercise-basketball'],
  ['soccer', 'exercise-soccer'],
  ['elliptical', 'exercise-elliptical'],
  ['stair', 'exercise-stair'],
  ['strength', 'exercise-weights'],
  ['weight', 'exercise-weights'],
  ['run', 'exercise-running'],
];

export function getWorkoutIcon(session: ExerciseSessionResponse): IconName {
  if (session.type === 'preset') return 'exercise-weights';

  const name = session.name ?? session.exercise_snapshot?.name ?? '';
  const category = session.exercise_snapshot?.category;

  // Exact name match (handles synced workouts where name is the activity type)
  if (name in CATEGORY_ICON_MAP) return CATEGORY_ICON_MAP[name];

  // Category match (for manually created exercises with proper categories)
  if (category && category !== 'Cardio' && category in CATEGORY_ICON_MAP) {
    return CATEGORY_ICON_MAP[category];
  }

  // Keyword match on name (e.g. "Traditional Strength Training" → strength → weights icon)
  const nameLower = name.toLowerCase();
  for (const [keyword, icon] of NAME_KEYWORDS) {
    if (nameLower.includes(keyword)) return icon;
  }

  // Generic Cardio category fallback
  if (category && category in CATEGORY_ICON_MAP) {
    return CATEGORY_ICON_MAP[category];
  }

  return 'exercise-default';
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  healthkit: 'Apple Health',
  'health connect': 'Health Connect',
  garmin: 'Garmin',
  strava: 'Strava',
  fitbit: 'Fitbit',
  withings: 'Withings',
};

export function getSourceLabel(source: string | null): { label: string; isSparky: boolean } {
  const s = source?.toLowerCase() ?? null;
  if (s == null || s === 'manual' || s === 'sparky' || s === 'workout plan') {
    return { label: 'Sparky', isSparky: true };
  }
  return { label: SOURCE_DISPLAY_NAMES[s] ?? source!, isSparky: false };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function getFirstImage(session: ExerciseSessionResponse): string | null {
  if (session.type === 'individual') {
    return session.exercise_snapshot?.images?.[0] ?? null;
  }
  for (const exercise of session.exercises) {
    const img = exercise.exercise_snapshot?.images?.[0];
    if (img) return img;
  }
  return null;
}

export function getSessionCalories(session: ExerciseSessionResponse): number {
  if (session.type === 'preset') {
    return session.exercises.reduce((sum, e) => sum + e.calories_burned, 0);
  }
  return session.calories_burned || 0;
}

// --- Exercise stats (single-pass over sessions array) ---

export interface ExerciseStats {
  caloriesBurned: number;
  activeCalories: number;
  otherExerciseCalories: number;
  durationMinutes: number;
}

export function calculateExerciseStats(sessions: ExerciseSessionResponse[]): ExerciseStats {
  let caloriesBurned = 0;
  let activeCalories = 0;
  let otherExerciseCalories = 0;
  let durationMinutes = 0;

  for (const session of sessions) {
    const sessionCals = getSessionCalories(session);
    caloriesBurned += sessionCals;

    if (session.type === 'preset') {
      otherExerciseCalories += sessionCals;
      durationMinutes += session.total_duration_minutes;
    } else {
      const isActiveCals = session.exercise_snapshot?.name === 'Active Calories';
      if (isActiveCals) {
        activeCalories += session.calories_burned || 0;
      } else {
        otherExerciseCalories += sessionCals;
        durationMinutes += session.duration_minutes ?? 0;
      }
    }
  }

  return { caloriesBurned, activeCalories, otherExerciseCalories, durationMinutes };
}

/** Total calories across all sessions. */
export const calculateCaloriesBurned = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).caloriesBurned;

/** Calories from "Active Calories" individual entries only (e.g. watch/fitness tracker). */
export const calculateActiveCalories = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).activeCalories;

/** Calories from all sessions except "Active Calories" entries. */
export const calculateOtherExerciseCalories = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).otherExerciseCalories;

/** Total duration in minutes, excluding "Active Calories" entries. */
export const calculateExerciseDuration = (sessions: ExerciseSessionResponse[]): number =>
  calculateExerciseStats(sessions).durationMinutes;

export function getWorkoutSummary(session: ExerciseSessionResponse): {
  name: string;
  duration: number;
  calories: number;
} {
  if (session.type === 'preset') {
    return {
      name: session.name,
      duration: session.total_duration_minutes,
      calories: getSessionCalories(session),
    };
  }
  return {
    name: session.name ?? session.exercise_snapshot?.name ?? 'Unknown exercise',
    duration: session.duration_minutes,
    calories: session.calories_burned,
  };
}

export function buildSessionSubtitle(
  session: ExerciseSessionResponse,
  duration: number,
  calories: number,
  weightUnit: 'kg' | 'lbs' = 'kg',
  distanceUnit: 'km' | 'miles' = 'km',
): string {
  if (session.type === 'preset') {
    const exerciseCount = session.exercises.length;
    const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolumeKg = session.exercises.reduce(
      (sum, ex) => ex.sets.reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), sum),
      0,
    );

    const parts: string[] = [];
    parts.push(`${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}`);
    if (totalSets > 0) parts.push(`${totalSets} sets`);
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${vol.toLocaleString()} ${weightUnit}`);
    }
    return parts.join(' \u00b7 ');
  }

  // Individual with sets: show sets info + duration/calories
  if (session.sets.length > 0) {
    const totalSets = session.sets.length;
    const totalVolumeKg = session.sets.reduce(
      (sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0,
    );
    const parts: string[] = [];
    parts.push(`${totalSets} set${totalSets !== 1 ? 's' : ''}`);
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${vol.toLocaleString()} ${weightUnit}`);
    }
    if (duration > 0) parts.push(formatDuration(duration));
    if (calories > 0) parts.push(`${Math.round(calories)} Cal`);
    return parts.join(' \u00b7 ');
  }

  // Individual activity: duration, distance, calories
  const parts: string[] = [];
  if (duration > 0) parts.push(formatDuration(duration));
  if (session.distance != null && session.distance > 0) {
    const dist = distanceFromKm(session.distance, distanceUnit);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    parts.push(`${dist.toFixed(1)} ${label}`);
  }
  if (calories > 0) parts.push(`${Math.round(calories)} Cal`);
  return parts.join(' \u00b7 ');
}

export function buildExercisesPayload(
  exercises: WorkoutDraftExercise[],
  weightUnit: 'kg' | 'lbs',
) {
  // Server enforces "all or none" for exercise IDs on preset-session update
  // (exerciseService.js ~L1713). If any exercise is new, we strip IDs from all
  // exercises AND all sets so the server takes its delete-and-recreate path.
  // Set IDs within an exercise, by contrast, reconcile correctly with mixed
  // IDs — update for present IDs, insert for absent, delete for omitted.
  const allExercisesHaveServerId =
    exercises.length > 0 && exercises.every(e => e.serverId !== undefined);

  return exercises.map((exercise, index) => ({
    ...(allExercisesHaveServerId && exercise.serverId !== undefined
      ? { id: exercise.serverId }
      : {}),
    exercise_id: exercise.exerciseId,
    sort_order: index,
    duration_minutes: 0,
    sets: exercise.sets.map((set, setIndex) => {
      const weight = parseDecimalInput(set.weight);
      const reps = parseInt(set.reps, 10);
      // The server set UPDATE writes all eight columns with `set.x ?? null`,
      // so fields the form has no UI for must still be round-tripped
      // explicitly — omitting them silently wipes the stored values.
      return {
        ...(allExercisesHaveServerId && set.serverId !== undefined
          ? { id: set.serverId }
          : {}),
        set_number: setIndex + 1,
        set_type: set.setType ?? null,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        reps: isNaN(reps) ? null : reps,
        duration: set.duration ?? null,
        ...(set.restTime != null ? { rest_time: set.restTime } : {}),
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
      };
    }),
  }));
}

// --- Set metrics (active-workout log column + volume summaries) ---

/** Epley estimated one-rep max. Returns 0 when weight or reps are missing/zero. */
export function epley1RmKg(weightKg: number | null, reps: number | null): number {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Estimated weight liftable for `targetReps`, derived from the Epley 1RM. */
export function estimateRepMaxKg(
  weightKg: number | null,
  reps: number | null,
  targetReps: number,
): number {
  const oneRm = epley1RmKg(weightKg, reps);
  if (oneRm === 0 || targetReps <= 0) return 0;
  return oneRm / (1 + targetReps / 30);
}

export function setVolumeKg(set: Pick<ExerciseEntrySetResponse, 'weight' | 'reps'>): number {
  return (set.weight ?? 0) * (set.reps ?? 0);
}

/** Total working volume for an exercise entry. Warmup sets are excluded. */
export function getExerciseVolumeKg(exercise: ExerciseEntryResponse): number {
  return exercise.sets.reduce(
    (total, set) => (set.set_type === 'warmup' ? total : total + setVolumeKg(set)),
    0,
  );
}

export function formatVolume(volumeKg: number, weightUnit: string): string {
  const value = weightFromKg(volumeKg, weightUnit as 'kg' | 'lbs');
  return `${Math.round(value).toLocaleString()} ${weightUnit}`;
}

export type RpeTone = 'easy' | 'moderate' | 'hard' | 'max';

/** Effort bucket for tinting a logged RPE value. */
export function getRpeTone(rpe: number): RpeTone {
  if (rpe <= 7) return 'easy';
  if (rpe < 9) return 'moderate';
  if (rpe < 10) return 'hard';
  return 'max';
}

export const TEMP_EXERCISE_ENTRY_ID_PREFIX = 'temp-';

/** Client-added exercise entries carry `temp-` string ids until saved. */
export function isTempExerciseEntryId(id: string): boolean {
  return id.startsWith(TEMP_EXERCISE_ENTRY_ID_PREFIX);
}

/** Client-added sets carry negative placeholder ids until the server assigns real ones. */
export function isTempSetId(id: number): boolean {
  return id < 0;
}

/**
 * Build the `exercises` payload for a preset-session PUT from a live session
 * snapshot (the active-workout autosave path). Session values are already
 * metric (kg), so unlike the draft builder there is no unit conversion or
 * string parsing.
 *
 * Every set column is emitted explicitly — the server set UPDATE writes all
 * eight columns with `set.x ?? null`, so an omitted field silently wipes it.
 * Exercise-level `notes` behaves the same way.
 *
 * Ids follow the server's "all or none" rule for exercises: if any exercise
 * is client-added (temp id), every exercise AND set id is stripped so the
 * server takes its delete-and-recreate path. Otherwise exercise ids are kept
 * and only real (non-negative) set ids are sent — temp ids must never reach
 * the server, where an unknown id is a 400.
 */
export function buildSessionExercisesPayload(
  session: PresetSessionResponse,
): PresetSessionExerciseRequest[] {
  const allExercisesHaveServerId =
    session.exercises.length > 0 &&
    session.exercises.every((e) => !isTempExerciseEntryId(e.id));

  return session.exercises.map((exercise, index) => ({
    ...(allExercisesHaveServerId ? { id: exercise.id } : {}),
    exercise_id: exercise.exercise_id,
    sort_order: index,
    duration_minutes: exercise.duration_minutes ?? 0,
    notes: exercise.notes ?? null,
    sets: exercise.sets.map((set, setIndex) => ({
      ...(allExercisesHaveServerId && !isTempSetId(set.id) ? { id: set.id } : {}),
      set_number: setIndex + 1,
      set_type: set.set_type ?? null,
      reps: set.reps ?? null,
      weight: set.weight ?? null,
      duration: set.duration ?? null,
      rest_time: set.rest_time ?? null,
      notes: set.notes ?? null,
      rpe: set.rpe ?? null,
    })),
  }));
}

export function buildPresetExercisesPayload(
  exercises: WorkoutDraftExercise[],
  weightUnit: 'kg' | 'lbs',
): WorkoutPresetExercisePayload[] {
  // Preset exercises with zero sets are valid on the server and render as
  // "No sets" in the detail view. Do NOT filter them out — saving an unrelated
  // edit would silently delete the user's zero-set rows from the preset.
  return exercises.map((exercise, index) => ({
    exercise_id: exercise.exerciseId,
    image_url: exercise.images[0] ?? null,
    sort_order: index,
    sets: exercise.sets.map((set, setIndex) => {
      const weight = parseDecimalInput(set.weight);
      const reps = parseInt(set.reps, 10);
      return {
        set_number: setIndex + 1,
        set_type: set.setType ?? 'normal',
        reps: isNaN(reps) ? null : reps,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        duration: set.duration ?? null,
        rest_time: set.restTime ?? null,
        notes: set.notes ?? null,
      };
    }),
  }));
}
