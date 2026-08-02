import type {
  ExerciseEntrySetRequest,
  ExerciseEntrySetResponse,
  ExerciseModality,
  ExerciseRecentSessionSet,
  ExerciseSessionResponse,
  ExerciseSnapshotResponse,
  PresetSessionExerciseRequest,
  PresetSessionResponse,
} from '@workspace/shared';
import {
  isCardioModality,
  isExerciseModality,
  resolveExerciseModality,
  setsDurationMinutes,
} from '@workspace/shared';
import type { IconName } from '../components/Icon';
// Type-only, so the store's runtime import of this module stays acyclic.
import type { CompletedSetMap, PrSetMap } from '../stores/activeWorkoutStore';
import type { WorkoutDraftExercise, WorkoutDraftSet } from '../types/drafts';
import type { Exercise } from '../types/exercise';
import type { ExternalExerciseItem } from '../types/externalExercises';
import type {
  WorkoutPreset,
  WorkoutPresetExercise,
  WorkoutPresetSet,
} from '../types/workoutPresets';
import type { WorkoutPresetExercisePayload } from '../services/api/workoutPresetsApi';
import type { CreateExerciseEntryPayload } from '../services/api/exerciseApi';
import { weightToKg, weightFromKg, distanceFromKm, distanceToKm } from './unitConversions';
import { parseDecimalInput } from './numericInput';
import { getDefaultRestSec } from './workoutSupersets';

// The superset/reorder algebra lives in its own module; re-exported here so
// the many existing import sites keep working.
export * from './workoutSupersets';

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
  manual: 'Sparky',
  sparky: 'Sparky',
  'workout plan': 'Sparky',
  healthkit: 'Apple Health',
  'health connect': 'Health Connect',
  garmin: 'Garmin',
  garmin_fit: 'Garmin',
  strava: 'Strava',
  fitbit: 'Fitbit',
  withings: 'Withings',
};

/**
 * Present a human-readable label for a workout session source. This function
 * is purely presentational — editability is decided by
 * `canEditGroupedWorkout` from `@workspace/shared`, never by this label map.
 */
export function getSourceLabel(
  source: string | null | undefined
): string {
  if (source == null) {
    return 'Sparky';
  }

  const trimmed = source.trim();
  const normalized = trimmed.toLowerCase();

  return SOURCE_DISPLAY_NAMES[normalized] ?? trimmed;
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
    // A cardio effort's backing set is an implementation detail (every read
    // surface renders it as duration+distance), so cardio exercises stay out
    // of the set count and contribute their distance instead \u2014 the cardio
    // analog of strength volume.
    let totalSets = 0;
    let totalVolumeKg = 0;
    let totalDistanceKm = 0;
    for (const ex of session.exercises) {
      if (isCardioModality(resolveSnapshotModality(ex.exercise_snapshot))) {
        totalDistanceKm += ex.distance ?? 0;
        continue;
      }
      totalSets += ex.sets.length;
      for (const set of ex.sets) totalVolumeKg += (set.weight ?? 0) * (set.reps ?? 0);
    }

    const parts: string[] = [];
    parts.push(`${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}`);
    if (totalSets > 0) parts.push(`${totalSets} sets`);
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${vol.toLocaleString()} ${weightUnit}`);
    }
    if (totalDistanceKm > 0) {
      const dist = distanceFromKm(totalDistanceKm, distanceUnit);
      parts.push(`${dist.toFixed(1)} ${distanceUnit === 'miles' ? 'mi' : 'km'}`);
    }
    if (calories > 0) parts.push(`${Math.round(calories)} Cal`);
    return parts.join(' \u00b7 ');
  }

  // Individual with sets: show sets info + duration/calories. Cardio is
  // excluded even though it is set-backed \u2014 "1 set" would hide the run;
  // its entry totals render through the activity branch below instead.
  const cardio = isCardioModality(resolveSnapshotModality(session.exercise_snapshot));
  if (!cardio && session.sets.length > 0) {
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

  // Individual activity (and set-backed cardio): duration, distance, calories
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
  distanceUnit: 'km' | 'miles',
) {
  // Server enforces "all or none" for exercise IDs on preset-session update
  // (exerciseService.js ~L1713). If any exercise is new, we strip IDs from all
  // exercises AND all sets so the server takes its delete-and-recreate path.
  // Set IDs within an exercise, by contrast, reconcile correctly with mixed
  // IDs — update for present IDs, insert for absent, delete for omitted.
  const allExercisesHaveServerId =
    exercises.length > 0 && exercises.every(e => e.serverId !== undefined);

  return exercises.map((exercise, index) => {
    // The server recomputes calories from duration and sets whenever
    // calories_burned is omitted; a user-edited value is sent as a manual
    // override for this save only.
    const caloriesOverride = exercise.caloriesManuallySet
      ? parseDecimalInput(exercise.calories ?? '')
      : NaN;

    const sets = exercise.sets.map((set, setIndex) => {
      const weight = parseDecimalInput(set.weight);
      const reps = parseInt(set.reps, 10);
      const distance = parseDecimalInput(set.distance ?? '');
      // The server set UPDATE writes every column with `set.x ?? null`, so
      // fields the form has no UI for must still be round-tripped
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
        distance: isNaN(distance) ? null : distanceToKm(distance, distanceUnit),
        ...(set.restTime != null ? { rest_time: set.restTime } : {}),
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
        completed_at: set.completedAt ?? null,
        is_pr: set.isPr ?? false,
      };
    });

    const modality = resolveSnapshotModality({
      modality: exercise.exerciseModality,
      category: exercise.exerciseCategory,
    });

    return {
      ...(allExercisesHaveServerId && exercise.serverId !== undefined
        ? { id: exercise.serverId }
        : {}),
      exercise_id: exercise.exerciseId,
      sort_order: index,
      // Cardio duration is the sum of its set durations — the sets are the
      // source of truth, and an explicit entry value would beat the server's
      // own derivation. Elsewhere the value round-trips from the session (the
      // form has no duration UI); sending 0 would zero the stored duration
      // and the calories derived from it.
      duration_minutes: isCardioModality(modality)
        ? setsDurationMinutes(sets)
        : (exercise.durationMinutes ?? 0),
      ...(!isNaN(caloriesOverride) && caloriesOverride >= 0
        ? { calories_burned: caloriesOverride }
        : {}),
      // The server nulls omitted entry fields, so the note must always be
      // sent — otherwise an edit-save wipes notes recorded during a live
      // workout.
      notes: exercise.notes ?? null,
      // The form has no superset UI; round-trip the value opaquely so manual
      // edits don't flatten grouping (the server nulls omitted fields).
      superset_group: exercise.supersetGroup ?? null,
      sets,
    };
  });
}

// --- Set metrics (active-workout log column + volume summaries) ---

/**
 * Snap a set weight to the server's storage precision (`exercise_entry_sets.weight`
 * is DECIMAL(10,2)) so a saved session echoes back value-identical. Storing an
 * unrounded lbs→kg conversion would make the autosave echo differ, and
 * ActiveWorkoutSetRow re-seeds its drafts from stored values.
 */
export function quantizeSetWeightKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

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
export function getExerciseVolumeKg(exercise: { sets: WorkoutCardSet[] }): number {
  return exercise.sets.reduce(
    (total, set) => (set.set_type === 'warmup' ? total : total + setVolumeKg(set)),
    0,
  );
}

// --- Exercise modality ---
//
// The modality decides which per-set cells a table renders (issue #1903).
// Every mobile read of `modality` funnels through `resolveSnapshotModality`
// so old-server responses (no modality field) degrade to the category-derived
// value everywhere at once.

/**
 * Resolve an exercise's modality from any snapshot-shaped source — an
 * `exercise_snapshot`, a full `Exercise`, or a preset exercise row. Explicit
 * valid modality wins; otherwise derived from category (old servers, legacy
 * rows).
 */
export function resolveSnapshotModality(
  snapshot: { modality?: string | null; category?: string | null } | null | undefined,
): ExerciseModality {
  return resolveExerciseModality(snapshot?.modality, snapshot?.category ?? null);
}

/** True for the modalities whose set tables render a single duration cell. */
export function isDurationModality(modality: ExerciseModality): boolean {
  return modality === 'duration' || modality === 'duration_distance';
}

export { isCardioModality };

/**
 * True when a workout card renders the Duration+Distance cardio form in place
 * of a set table: a cardio exercise with at most one set. Multi-set cardio
 * (imports, future intervals) keeps the duration-style table so no set is
 * hidden. Surfaces that can disable the form entirely (the preset editor)
 * AND this with their own `cardioFormEnabled` gate.
 */
export function rendersCardioEffortForm(
  snapshot: { modality?: string | null; category?: string | null } | null | undefined,
  setCount: number,
): boolean {
  return isCardioModality(resolveSnapshotModality(snapshot)) && setCount <= 1;
}

/**
 * Duration in seconds a set displays/fills/adopts. Legacy isometric rows hold
 * their seconds in `reps` (they predate the duration column), so `duration`
 * modality — and ONLY that modality — falls back to reps-as-seconds. The
 * fallback must never widen to `duration_distance`: backfilled cardio presets
 * carry seeded `reps: 10` that would otherwise render as 10-second sets.
 */
export function effectiveSetDurationSec(
  set: { duration?: number | null; reps?: number | null },
  modality: ExerciseModality,
): number | null {
  return set.duration ?? (modality === 'duration' && set.reps != null ? set.reps : null);
}

/** Read-only duration prose: `45s` under a minute, `1:30` from there up. */
export function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

// --- Card-stack input shapes ---
//
// The active-workout card and set row accept these narrow structural
// interfaces so one card stack serves live sessions (`ExerciseEntryResponse`
// satisfies them as-is), form drafts, and preset templates. Do NOT fabricate
// `ExerciseEntryResponse` objects with synthetic ids for the form surfaces —
// map through the adapters below instead.

export interface WorkoutCardSet {
  /** Server set id (number) or `WorkoutDraftSet.clientId` (string). */
  id: string | number;
  set_number: number;
  set_type?: string | null;
  /** ALWAYS kg — display conversion happens in the row. */
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  rest_time?: number | null;
  notes?: string | null;
  duration?: number | null;
  /** ALWAYS km — display conversion happens in the cardio form. */
  distance?: number | null;
  /** Raw draft strings backing the edit-mode controlled inputs (draft mapper only). */
  editWeightText?: string;
  editRepsText?: string;
}

export interface WorkoutCardExercise {
  /** Entry id or `WorkoutDraftExercise.clientId`. */
  id: string;
  exercise_id: string;
  superset_group?: number | null;
  /** Per-exercise note. Present on live/session entries and workout drafts; absent on preset sources. */
  notes?: string | null;
  /** Present on session entries; absent on draft/preset sources. */
  calories_burned?: number | null;
  exercise_snapshot: {
    name?: string | null;
    category?: string | null;
    modality?: string | null;
    images?: string[] | null;
  } | null;
  sets: WorkoutCardSet[];
  /** Raw draft string backing the edit-mode calories input (draft mapper only). */
  editCaloriesText?: string;
}

/**
 * Adapt a form-draft exercise for the card stack. Weight parsing matches
 * `buildExercisesPayload` exactly (parseDecimalInput → weightToKg, NaN → null)
 * so what the card displays is what a save would persist.
 */
export function draftExerciseToCardExercise(
  exercise: WorkoutDraftExercise,
  weightUnit: 'kg' | 'lbs',
  distanceUnit: 'km' | 'miles' = 'km',
): WorkoutCardExercise {
  return {
    id: exercise.clientId,
    exercise_id: exercise.exerciseId,
    superset_group: exercise.supersetGroup ?? null,
    notes: exercise.notes ?? null,
    editCaloriesText: exercise.calories ?? '',
    exercise_snapshot: exercise.snapshot ?? {
      name: exercise.exerciseName,
      category: exercise.exerciseCategory,
      modality: exercise.exerciseModality ?? null,
      images: exercise.images,
    },
    sets: exercise.sets.map((set, index) => {
      const weight = parseDecimalInput(set.weight);
      const reps = parseInt(set.reps, 10);
      const distance = parseDecimalInput(set.distance ?? '');
      return {
        id: set.clientId,
        set_number: index + 1,
        set_type: set.setType ?? null,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        reps: isNaN(reps) ? null : reps,
        rpe: set.rpe ?? null,
        rest_time: set.restTime ?? null,
        notes: set.notes ?? null,
        duration: set.duration ?? null,
        distance: isNaN(distance) ? null : distanceToKm(distance, distanceUnit),
        editWeightText: set.weight,
        editRepsText: set.reps,
      };
    }),
  };
}

/** Adapt a saved preset exercise for the card stack (weights already kg). */
export function presetExerciseToCardExercise(
  exercise: WorkoutPresetExercise,
): WorkoutCardExercise {
  return {
    id: String(exercise.id),
    exercise_id: exercise.exercise_id,
    superset_group: exercise.superset_group ?? null,
    exercise_snapshot: {
      name: exercise.exercise_name,
      category: exercise.category ?? null,
      modality: exercise.modality ?? null,
      images: exercise.image_url ? [exercise.image_url] : [],
    },
    sets: exercise.sets.map((set, index) => ({
      id: set.id,
      set_number: index + 1,
      set_type: set.set_type ?? null,
      weight: set.weight ?? null,
      reps: set.reps ?? null,
      rpe: null,
      rest_time: set.rest_time ?? null,
      notes: set.notes ?? null,
      duration: set.duration ?? null,
      distance: set.distance ?? null,
    })),
  };
}

export function formatVolume(volumeKg: number, weightUnit: string): string {
  const value = weightFromKg(volumeKg, weightUnit as 'kg' | 'lbs');
  return `${Math.round(value).toLocaleString()} ${weightUnit}`;
}

/** Compact historical-set text, e.g. `W 60 × 8`, `100 × 5`, `12 reps`, `45s`, or `30:00 · 5.2 km`; weight is unitless display units. */
export function formatRecentSessionSet(
  set: ExerciseRecentSessionSet,
  weightUnit: 'kg' | 'lbs',
  modality?: ExerciseModality,
  distanceUnit: 'km' | 'miles' = 'km',
): string {
  const prefix = set.setType === 'warmup' ? 'W ' : '';
  if (modality != null && isDurationModality(modality)) {
    const seconds = effectiveSetDurationSec(
      { duration: set.duration ?? null, reps: set.reps },
      modality,
    );
    const parts: string[] = [];
    if (seconds != null) parts.push(formatDurationSeconds(seconds));
    if (isCardioModality(modality) && set.distance != null) {
      const dist = parseFloat(distanceFromKm(set.distance, distanceUnit).toFixed(2));
      parts.push(`${dist} ${distanceUnit === 'miles' ? 'mi' : 'km'}`);
    }
    return parts.length > 0 ? `${prefix}${parts.join(' · ')}` : '–';
  }
  const w =
    set.weight != null
      ? String(parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1)))
      : null;
  if (w != null && set.reps != null) return `${prefix}${w} × ${set.reps}`;
  if (w != null) return `${prefix}${w}`; // weight-only
  if (set.reps != null) return `${prefix}${set.reps} reps`; // reps-only set in a mixed history
  if (set.duration != null) return `${prefix}${formatDurationSeconds(set.duration)}`;
  return '–';
}

/**
 * Structured description of the set the active-workout cursor points at.
 * Shared by the workout HUD, the active-workout screen, and the rest-complete
 * notification so their labels can't drift apart; each consumer applies its
 * own name fallback and formatting.
 */
export interface ActiveSetDescription {
  /** Snapshot name; null when the exercise carries no snapshot name. */
  exerciseName: string | null;
  setNumber: number;
  setCount: number;
  reps: number | null;
  weightKg: number | null;
  /** Effective duration in seconds; non-null only for duration-modality sets. */
  durationSec: number | null;
}

/** Look up the session set matching the active-set cursor id. */
export function describeActiveSet(
  session: PresetSessionResponse | null,
  setId: string | null,
): ActiveSetDescription | null {
  if (session == null || setId == null) return null;
  for (const exercise of session.exercises) {
    const set = exercise.sets.find((s) => String(s.id) === setId);
    if (!set) continue;
    const modality = resolveSnapshotModality(exercise.exercise_snapshot);
    const durationLike = isDurationModality(modality);
    return {
      exerciseName: exercise.exercise_snapshot?.name ?? null,
      setNumber: set.set_number,
      setCount: exercise.sets.length,
      reps: durationLike ? null : set.reps ?? null,
      weightKg: durationLike ? null : set.weight ?? null,
      durationSec: durationLike ? effectiveSetDurationSec(set, modality) : null,
    };
  }
  return null;
}

/**
 * Assumed weight/reps for a set whose fields are still empty — the gray
 * Hevy-style placeholder the live row renders, and the values a completion
 * adopts when the user logs the set without typing. Weight is kg. A `null`
 * field means nothing can be assumed (a brand-new exercise with no history,
 * plan, or earlier entries).
 */
export interface AssumedSetValues {
  weight: number | null;
  reps: number | null;
  /**
   * Integer seconds. Optional: `plannedSetValues` entries persisted before the
   * modality upgrade rehydrate without the key; read through `?? null`.
   */
  duration?: number | null;
  /**
   * Km, meaningful on cardio sets only. Optional for the same persisted-entry
   * reason as `duration`; read through `?? null`.
   */
  distance?: number | null;
}

type AssumableSet = Pick<
  WorkoutCardSet,
  'id' | 'set_type' | 'weight' | 'reps' | 'duration' | 'distance'
>;

/**
 * Resolve the assumed (placeholder) weight/reps for every set of one exercise
 * in a live workout. Each field resolves independently, first match wins:
 *
 *   1. The same-position set from the exercise's most recent prior session
 *      (what the PREVIOUS column shows).
 *   2. The planned value captured at live start (the preset's programmed set).
 *   3. The preceding row's effective value — its entered value, else its
 *      resolved placeholder.
 *
 * A set with history or a plan stays pinned to its own numbers no matter what
 * is typed above it, so last session's progression (100/95/90) reproduces
 * set-for-set. Only sets with neither — added beyond last time's count, or a
 * never-done exercise — mirror the rows above (rule 3), which is why typing
 * into one row of a new exercise updates every empty row below it at once.
 *
 * The rule-3 cascade runs in two tiers: warmup sets only mirror warmups and
 * everything else mirrors the non-warmup pool, so a light warmup can't become
 * a working set's target. Values are resolved for every set regardless of
 * what it already holds — consumers only apply a field when the set's own
 * value is null.
 */
export function resolveAssumedSetValues(
  sets: readonly AssumableSet[],
  previousSets: readonly ExerciseRecentSessionSet[] | undefined,
  plannedBySetId?: Record<string, AssumedSetValues>,
): AssumedSetValues[] {
  const lastEffective = {
    warmup: { weight: null, reps: null, duration: null, distance: null } as AssumedSetValues,
    working: { weight: null, reps: null, duration: null, distance: null } as AssumedSetValues,
  };
  return sets.map((set, index) => {
    const tier = set.set_type === 'warmup' ? 'warmup' : 'working';
    const previous = previousSets?.[index];
    const planned = plannedBySetId?.[String(set.id)];
    const assumed: AssumedSetValues = {
      weight: previous?.weight ?? planned?.weight ?? lastEffective[tier].weight,
      reps: previous?.reps ?? planned?.reps ?? lastEffective[tier].reps,
      duration:
        previous?.duration ?? planned?.duration ?? lastEffective[tier].duration ?? null,
      distance:
        previous?.distance ?? planned?.distance ?? lastEffective[tier].distance ?? null,
    };
    lastEffective[tier].weight = set.weight ?? assumed.weight;
    lastEffective[tier].reps = set.reps ?? assumed.reps;
    lastEffective[tier].duration = set.duration ?? assumed.duration;
    lastEffective[tier].distance = set.distance ?? assumed.distance;
    return assumed;
  });
}

/**
 * {@link describeActiveSet} with empty weight/reps backfilled from
 * {@link resolveAssumedSetValues}, so the HUD bar and the rest-complete
 * notification describe the set the user is assumed to perform — matching the
 * gray placeholders the live row shows — instead of dropping the load text.
 */
export function describeActiveSetAssumed(
  session: PresetSessionResponse | null,
  setId: string | null,
  previousSetsByExerciseId: Record<string, ExerciseRecentSessionSet[]>,
  plannedBySetId: Record<string, AssumedSetValues>,
): ActiveSetDescription | null {
  const desc = describeActiveSet(session, setId);
  if (desc == null || session == null) return desc;
  for (const exercise of session.exercises) {
    const setIndex = exercise.sets.findIndex((s) => String(s.id) === setId);
    if (setIndex < 0) continue;
    const modality = resolveSnapshotModality(exercise.exercise_snapshot);
    if (isDurationModality(modality)) {
      if (desc.durationSec != null) return desc;
    } else if (desc.weightKg != null && desc.reps != null) {
      return desc;
    }
    const assumed = resolveAssumedSetValues(
      exercise.sets,
      previousSetsByExerciseId[exercise.exercise_id],
      plannedBySetId,
    )[setIndex];
    // Only the fields the modality renders are backfilled, so a duration set
    // can't inherit legacy reps and a weighted set can't inherit a duration.
    if (isDurationModality(modality)) {
      return { ...desc, durationSec: assumed.duration ?? null };
    }
    return {
      ...desc,
      weightKg: desc.weightKg ?? assumed.weight,
      reps: desc.reps ?? assumed.reps,
    };
  }
  return desc;
}

/**
 * Collapse the three-way preference unit to the two display units the workout
 * formatters understand: `st_lbs` (and anything unexpected) renders as lbs,
 * while a missing preference defaults to kg (the server-side storage unit).
 */
export function normalizeWeightUnit(unit: string | undefined): 'kg' | 'lbs' {
  if (unit == null || unit === 'kg') return 'kg';
  return 'lbs';
}

/** Elapsed workout clock as `MM:SS`, growing to `HH:MM:SS` past an hour. */
export function formatElapsed(startedAt: number | null, now: number): string {
  const totalSeconds = startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  // Drop the hours segment until the workout actually crosses an hour, so a
  // one-minute set reads "01:00" rather than "00:01:00".
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Rest countdown as `M:SS`, rounding partial seconds up and clamping at zero. */
export function formatRestCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Target-load text for a set, e.g. `135 lbs × 8`, `8 reps`, `60 kg`, or `45s`;
 * null when the set has no weight, reps, or duration.
 */
export function formatSetLoad(
  set: Pick<ActiveSetDescription, 'weightKg' | 'reps'> & { durationSec?: number | null },
  weightUnit: 'kg' | 'lbs',
): string | null {
  if (set.durationSec != null) return formatDurationSeconds(set.durationSec);
  const w =
    set.weightKg != null
      ? `${parseFloat(weightFromKg(set.weightKg, weightUnit).toFixed(1))} ${weightUnit}`
      : null;
  if (w != null && set.reps != null) return `${w} × ${set.reps}`;
  if (set.reps != null) return `${set.reps} reps`;
  return w;
}

export type RpeTone = 'easy' | 'moderate' | 'hard' | 'max';

/** Effort bucket for tinting a logged RPE value. */
export function getRpeTone(rpe: number): RpeTone {
  if (rpe <= 7) return 'easy';
  if (rpe < 9) return 'moderate';
  if (rpe < 10) return 'hard';
  return 'max';
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
 * nine columns with `set.x ?? null`, so an omitted field silently wipes it.
 * Exercise-level `notes` behaves the same way.
 *
 * `completed_at` comes from `completedSetIds` (the store's completion map,
 * the local source of truth during a live workout), not from the session's
 * set objects — an unmapped set deliberately sends `null` so unchecking a
 * set propagates as a clear. `is_pr` is derived the same way from
 * `prSetIds` — a missing key sends `false`, so unchecking a PR set clears it.
 *
 * Every exercise carries a real uuid from birth (client-minted on add), so the
 * entry `id` is always sent and the server always takes its reconcile path,
 * creating a client-added entry from its uuid rather than delete-and-recreating
 * the whole session. Set ids stay server-assigned: a just-added set's negative
 * temp id is omitted so the server INSERTs it (an unknown id is a 400), and its
 * real id arrives on the next save.
 *
 * `startedAtMs` (the store's `startedAt`) turns on duration stamping: when a
 * set has been completed after it, each exercise's `duration_minutes` becomes
 * its share of the wall-clock span from workout start to the LAST completed
 * set, split proportionally by completed-set count. The server derives
 * calories from duration, so this is also what makes live workouts earn
 * calories. Anchoring on the last completion (not "now") keeps a
 * flushed-hours-later abandoned session from claiming hours of exercise.
 * Without `startedAtMs`, or before anything is completed, existing durations
 * round-trip unchanged.
 */
export function buildSessionExercisesPayload(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  prSetIds: PrSetMap,
  startedAtMs?: number | null,
): PresetSessionExerciseRequest[] {
  const durationByEntryId = buildSessionDurationMinutes(session, completedSetIds, startedAtMs);

  return session.exercises.map((exercise, index) => ({
    id: exercise.id,
    exercise_id: exercise.exercise_id,
    sort_order: index,
    // Cardio duration is always the sum of its set durations; the wall-clock
    // split below deliberately excludes cardio entries.
    duration_minutes: isCardioModality(resolveSnapshotModality(exercise.exercise_snapshot))
      ? setsDurationMinutes(exercise.sets)
      : (durationByEntryId?.get(exercise.id) ?? exercise.duration_minutes ?? 0),
    notes: exercise.notes ?? null,
    // `?? null` also normalizes `undefined` from sessions persisted before
    // the superset upgrade.
    superset_group: exercise.superset_group ?? null,
    sets: exercise.sets.map((set, setIndex) => {
      const completedMs = completedSetIds[String(set.id)];
      return {
        ...(!isTempSetId(set.id) ? { id: set.id } : {}),
        set_number: setIndex + 1,
        set_type: set.set_type ?? null,
        reps: set.reps ?? null,
        weight: set.weight ?? null,
        duration: set.duration ?? null,
        distance: set.distance ?? null,
        rest_time: set.rest_time ?? null,
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
        completed_at: completedMs != null ? new Date(completedMs).toISOString() : null,
        is_pr: prSetIds[String(set.id)] === true,
      };
    }),
  }));
}

/**
 * Wall-clock live-workout durations: the span from `startedAtMs` to the last
 * completed set, split across exercises proportionally by completed-set count
 * (an exercise with nothing completed gets 0). Returns null — "leave existing
 * durations alone" — when `startedAtMs` is absent or nothing at all has been
 * completed after it (e.g. a resumed session whose seeded completions predate
 * this start). When only cardio completed after start, the session is still
 * live and authoritative: strength entries that logged nothing are stamped 0
 * so a stale duration (say, from a completion that was later un-checked)
 * can't survive to the diary and the completion screen.
 */
export function buildSessionDurationMinutes(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  startedAtMs?: number | null,
): Map<string, number> | null {
  if (startedAtMs == null) return null;

  let lastCompletedMs = 0;
  let totalCompleted = 0;
  let anyCompletedAfterStart = false;
  const completedCountByEntryId = new Map<string, number>();
  for (const exercise of session.exercises) {
    // Cardio entries own their duration (the sum of their set durations) and
    // stay out of the split entirely — counting their sets would siphon
    // wall-clock minutes away from the strength entries. Their completions
    // still prove the session is live.
    const cardio = isCardioModality(resolveSnapshotModality(exercise.exercise_snapshot));
    let count = 0;
    for (const s of exercise.sets) {
      const ms = completedSetIds[String(s.id)];
      if (ms == null) continue;
      if (ms > startedAtMs) anyCompletedAfterStart = true;
      if (cardio) continue;
      count++;
      totalCompleted++;
      if (ms > lastCompletedMs) lastCompletedMs = ms;
    }
    if (!cardio) completedCountByEntryId.set(exercise.id, count);
  }
  if (totalCompleted === 0 || lastCompletedMs <= startedAtMs) {
    if (!anyCompletedAfterStart) return null;
    // Cardio-only session: zero the never-completed strength entries; one
    // with (pre-start) completions keeps its existing duration by staying
    // out of the map.
    const zeroed = new Map<string, number>();
    for (const [entryId, count] of completedCountByEntryId) {
      if (count === 0) zeroed.set(entryId, 0);
    }
    return zeroed;
  }

  const totalMinutes = (lastCompletedMs - startedAtMs) / 60_000;
  const byEntryId = new Map<string, number>();
  for (const exercise of session.exercises) {
    const count = completedCountByEntryId.get(exercise.id) ?? 0;
    const share = (totalMinutes * count) / totalCompleted;
    byEntryId.set(exercise.id, Math.round(share * 10) / 10);
  }
  return byEntryId;
}

/** A gap between set completions longer than this reads as a break, not workout time. */
export const WORKOUT_LONG_GAP_MINUTES = 30;

export interface WorkoutSpanSummary {
  /** Wall-clock minutes from workout start to the last completed set. */
  totalMinutes: number;
  /**
   * `totalMinutes` with every long gap removed — the duration the workout
   * plausibly took, offered by the end-of-workout adjust prompt. At least 1.
   */
  activeMinutes: number;
  /** True when any completion gap exceeds {@link WORKOUT_LONG_GAP_MINUTES}. */
  hasLongGap: boolean;
}

/**
 * Gap analysis over the same span `buildSessionDurationMinutes` stamps
 * (workout start → last completed set), which the server turns into exercise
 * duration and calories. Walks the completion timestamps in order; a gap
 * longer than {@link WORKOUT_LONG_GAP_MINUTES} counts as a break and
 * contributes nothing to `activeMinutes`. Completions at or before
 * `startedAtMs` are ignored, matching the duration stamper's resumed-session
 * guard. Returns null when there is no started workout or nothing completed
 * after it.
 */
export function summarizeWorkoutSpan(
  completedSetIds: CompletedSetMap,
  startedAtMs: number | null | undefined,
): WorkoutSpanSummary | null {
  if (startedAtMs == null) return null;
  const times = Object.values(completedSetIds)
    .filter((ms): ms is number => ms != null && ms > startedAtMs)
    .sort((a, b) => a - b);
  if (times.length === 0) return null;

  const gapLimitMs = WORKOUT_LONG_GAP_MINUTES * 60_000;
  let activeMs = 0;
  let hasLongGap = false;
  let prev = startedAtMs;
  for (const ms of times) {
    const gap = ms - prev;
    if (gap > gapLimitMs) hasLongGap = true;
    else activeMs += gap;
    prev = ms;
  }
  return {
    totalMinutes: (times[times.length - 1] - startedAtMs) / 60_000,
    activeMinutes: Math.max(1, Math.round(activeMs / 60_000)),
    hasLongGap,
  };
}

/** Set types offered by the long-press set-type pickers. */
export const SET_TYPE_OPTIONS = ['warmup', 'normal', 'drop', 'failure'] as const;

/**
 * A drop set continues its parent set at a stripped weight with no pause, so
 * no rest is ever taken before one — the rest timer skips straight to it.
 */
export function isDropSetType(setType: string | null | undefined): boolean {
  return setType === 'drop';
}

/**
 * Letter shown in the set # column instead of a working-set number, or null
 * for numbered (working) sets.
 */
export function setTypeLetter(setType: string | null | undefined): 'W' | 'D' | 'F' | null {
  switch (setType) {
    case 'warmup':
      return 'W';
    case 'drop':
      return 'D';
    case 'failure':
      return 'F';
    default:
      return null;
  }
}

// --- Personal record (PR) detection ---
//
// A PR is a working set that beats the historical best for its exercise —
// heavier weight, or more reps at the same top weight. Warmups never count.
// Detection is pure so it can run in the store (both the screen and the HUD
// complete-set paths) and be exhaustively tested.

/**
 * True when `set_type` names a warmup, matching the server's SQL filter:
 * lowercase, strip every non-alphanumeric, prefix-match `warmup`. Catches the
 * repo's many variants — `warmup`, `Warm-up`, `Warmup`, `Warm up`,
 * `Warm-up Set`. NULL/undefined counts as a working set.
 */
export function isWarmupSetType(setType: string | null | undefined): boolean {
  if (setType == null) return false;
  return setType.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith('warmup');
}

/** A single historical best used as the PR baseline (all weights kg). */
export interface PrBaselineEntry {
  weight: number | null;
  reps: number | null;
}

/**
 * Compare two weighted sets by (weight at hundredths precision, then reps).
 * Returns > 0 when `a` is the better record, < 0 when `b` is, 0 when tied.
 *
 * Hundredths, not epsilon: the DB stores `numeric(10,2)`, so a sub-cent
 * difference round-trips to equality — and rounding also kills the float dust
 * from lb→kg conversion. Null reps count as 0. Both weights must be non-null.
 */
export function compareSetRecords(
  a: { weight: number; reps: number | null },
  b: { weight: number; reps: number | null },
): number {
  const wa = Math.round(a.weight * 100);
  const wb = Math.round(b.weight * 100);
  if (wa !== wb) return wa - wb;
  return (a.reps ?? 0) - (b.reps ?? 0);
}

/**
 * True when a non-warmup weighted set TIES the record (same weight and reps
 * under `compareSetRecords`) — the "matched your PR" marker, one step below
 * beating it. False when either side lacks a weight.
 */
export function matchesSetRecord(
  set: { weight: number | null; reps: number | null; set_type?: string | null },
  best: { weight: number | null; reps: number | null } | null | undefined,
): boolean {
  if (best == null || best.weight == null || set.weight == null) return false;
  if (isWarmupSetType(set.set_type)) return false;
  return (
    compareSetRecords(
      { weight: set.weight, reps: set.reps },
      { weight: best.weight, reps: best.reps },
    ) === 0
  );
}

/**
 * Decide whether completing `candidateSetId` is a PR.
 *
 * Never a PR when: the set is a warmup, its weight is null, the exercise's
 * baseline was never captured (key absent), or the baseline is `null`
 * (first-ever exercise — nothing to beat). The effective best is the better
 * of the captured baseline and every already-completed non-warmup weighted
 * set for the same exercise this session (excluding the candidate), ordered by
 * `compareSetRecords`. A PR is a strictly heavier set, or an equal-weight set
 * with strictly more reps.
 */
export function isPrSet(
  session: PresetSessionResponse,
  candidateSetId: string,
  completedSetIds: CompletedSetMap,
  prBaseline: Record<string, PrBaselineEntry | null>,
): boolean {
  let candidate: ExerciseEntrySetResponse | undefined;
  let exerciseId: string | undefined;
  for (const exercise of session.exercises) {
    const found = exercise.sets.find((s) => String(s.id) === candidateSetId);
    if (found) {
      candidate = found;
      exerciseId = exercise.exercise_id;
      break;
    }
  }
  if (!candidate || exerciseId == null) return false;
  if (candidate.weight == null) return false;
  if (isWarmupSetType(candidate.set_type)) return false;

  // Baseline key absent = never captured; null = captured with no history.
  if (!(exerciseId in prBaseline)) return false;
  const baseline = prBaseline[exerciseId];
  if (baseline == null) return false;

  // Start the running best from the baseline, then fold in every already-
  // completed session set for the same exercise (the candidate excluded).
  let best: { weight: number; reps: number | null } | null =
    baseline.weight != null ? { weight: baseline.weight, reps: baseline.reps } : null;

  for (const exercise of session.exercises) {
    if (exercise.exercise_id !== exerciseId) continue;
    for (const s of exercise.sets) {
      if (String(s.id) === candidateSetId) continue;
      if (s.weight == null) continue;
      if (isWarmupSetType(s.set_type)) continue;
      if (completedSetIds[String(s.id)] == null) continue;
      const contender = { weight: s.weight, reps: s.reps };
      if (best == null || compareSetRecords(contender, best) > 0) best = contender;
    }
  }

  // Baseline had no weight and no completed session set to beat — with history
  // present but no comparable record, stay conservative and award nothing.
  if (best == null) return false;

  return compareSetRecords({ weight: candidate.weight, reps: candidate.reps }, best) > 0;
}

/**
 * Seed the PR-stamp map from server-persisted `is_pr` flags, mirroring
 * `seedCompletionFromSession`. Used when resuming a workout so previously
 * earned PRs stay stamped across a cold start.
 */
export function seedPrFromSession(session: PresetSessionResponse): PrSetMap {
  const seeded: PrSetMap = {};
  for (const exercise of session.exercises) {
    for (const s of exercise.sets) {
      if (s.is_pr) seeded[String(s.id)] = true;
    }
  }
  return seeded;
}

// --- Workout-complete summary ---
//
// Everything the post-save celebration screen shows is derived here, from the
// store snapshot captured before `clearWorkout()`. Volume and top-set honor
// the same conventions as live PR detection: completed sets only, warmups
// excluded (drop/failure sets count).

/** One recap row on the workout-complete screen. */
export interface WorkoutCompletionExercise {
  entryId: string;
  name: string;
  notes: string | null;
  completedSetCount: number;
  totalSetCount: number;
  /** Completed working-set volume in kg; 0 when nothing weighted completed. */
  volumeKg: number;
  /** Best completed working set by (weight, reps); reps-only best when nothing weighted; longest-duration best on duration exercises. */
  topSet: {
    weightKg: number | null;
    reps: number | null;
    durationSec?: number | null;
  } | null;
  hasPr: boolean;
}

/** One line in the records card: the PR'd set and its exercise. */
export interface WorkoutCompletionPrRow {
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  durationSec?: number | null;
}

export interface WorkoutCompletionSummary {
  completedSetCount: number;
  totalSetCount: number;
  skippedSetCount: number;
  /** Completed working-set volume in kg across the whole session. */
  volumeKg: number;
  /** Completed-set distance in km across the whole session (cardio efforts). */
  totalDistanceKm: number;
  /** Mean RPE across completed sets that logged one; null when none did. */
  averageRpe: number | null;
  prRows: WorkoutCompletionPrRow[];
  exercises: WorkoutCompletionExercise[];
}

export function buildWorkoutCompletionSummary(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  prSetIds: PrSetMap,
): WorkoutCompletionSummary {
  let completedSetCount = 0;
  let totalSetCount = 0;
  let volumeKg = 0;
  let totalDistanceKm = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  const prRows: WorkoutCompletionPrRow[] = [];
  const exercises: WorkoutCompletionExercise[] = [];

  for (const exercise of session.exercises) {
    const name = exercise.exercise_snapshot?.name ?? 'Exercise';
    const modality = resolveSnapshotModality(exercise.exercise_snapshot);
    let exerciseCompleted = 0;
    let exerciseVolumeKg = 0;
    let topWeighted: { weightKg: number; reps: number | null } | null = null;
    let topRepsOnly: { weightKg: null; reps: number } | null = null;
    let topDurationSec: number | null = null;
    let hasPr = false;

    for (const set of exercise.sets) {
      totalSetCount++;
      if (completedSetIds[String(set.id)] == null) continue;
      exerciseCompleted++;
      if (set.rpe != null) {
        rpeSum += set.rpe;
        rpeCount++;
      }
      if (prSetIds[String(set.id)] === true) {
        hasPr = true;
        prRows.push({ exerciseName: name, weightKg: set.weight, reps: set.reps });
      }
      if (isWarmupSetType(set.set_type)) continue;
      exerciseVolumeKg += setVolumeKg(set);
      if (set.distance != null) totalDistanceKm += set.distance;
      if (isDurationModality(modality)) {
        const seconds = effectiveSetDurationSec(set, modality);
        if (seconds != null && (topDurationSec == null || seconds > topDurationSec)) {
          topDurationSec = seconds;
        }
      }
      if (set.weight != null) {
        const contender = { weightKg: set.weight, reps: set.reps };
        if (
          topWeighted == null ||
          compareSetRecords(
            { weight: contender.weightKg, reps: contender.reps },
            { weight: topWeighted.weightKg, reps: topWeighted.reps },
          ) > 0
        ) {
          topWeighted = contender;
        }
      } else if (
        !isDurationModality(modality) &&
        set.reps != null &&
        (topRepsOnly == null || set.reps > topRepsOnly.reps)
      ) {
        // On duration exercises reps are legacy hold-seconds, not a rep best.
        topRepsOnly = { weightKg: null, reps: set.reps };
      }
    }

    completedSetCount += exerciseCompleted;
    volumeKg += exerciseVolumeKg;
    exercises.push({
      entryId: exercise.id,
      name,
      notes: exercise.notes ?? null,
      completedSetCount: exerciseCompleted,
      totalSetCount: exercise.sets.length,
      volumeKg: exerciseVolumeKg,
      topSet:
        topWeighted ??
        topRepsOnly ??
        (topDurationSec != null
          ? { weightKg: null, reps: null, durationSec: topDurationSec }
          : null),
      hasPr,
    });
  }

  return {
    completedSetCount,
    totalSetCount,
    skippedSetCount: totalSetCount - completedSetCount,
    volumeKg,
    totalDistanceKm,
    averageRpe: rpeCount > 0 ? rpeSum / rpeCount : null,
    prRows,
    exercises,
  };
}

// --- Live-start payload builders ---


/**
 * Request-shaped sibling of activeWorkoutStore's `makeDefaultSet` (which
 * builds the response shape with a placeholder id) — keep the two in sync.
 */
function makeDefaultStartSet(
  setNumber: number,
  modality: ExerciseModality,
): ExerciseEntrySetRequest {
  return {
    set_number: setNumber,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    distance: null,
    // Cardio efforts carry no between-set rest; a nonzero value would both
    // start the rest timer and inflate the server's set-derived duration.
    rest_time: isCardioModality(modality) ? 0 : getDefaultRestSec(),
    notes: null,
    rpe: null,
    completed_at: null,
  };
}

/**
 * Build the `exercises` payload for creating a live session straight from a
 * saved workout preset. Preset values are already metric (kg) — no unit
 * conversion. Every set column is emitted explicitly (the server set write
 * uses `set.x ?? null`; see buildSessionExercisesPayload).
 *
 * A preset exercise with zero sets gets one default set: the server accepts
 * zero-set exercises, but the live workout treats a zero-step session as
 * already finished. A preset with zero exercises returns [] — callers must
 * block before creating (the create schema requires at least one exercise).
 */
export function buildPresetStartExercisesPayload(
  preset: WorkoutPreset,
): PresetSessionExerciseRequest[] {
  return preset.exercises.map((exercise, index) => {
    const modality = resolveSnapshotModality(exercise);
    return {
      exercise_id: exercise.exercise_id,
      sort_order: index,
      duration_minutes: 0,
      notes: null,
      // Live sessions started from a preset inherit its superset grouping.
      superset_group: exercise.superset_group ?? null,
      sets:
        exercise.sets.length === 0
          ? [makeDefaultStartSet(1, modality)]
          : exercise.sets.map((set, setIndex) => ({
              set_number: setIndex + 1,
              set_type: set.set_type ?? 'normal',
              reps: set.reps ?? null,
              weight: set.weight ?? null,
              duration: set.duration ?? null,
              // Distance is only meaningful on cardio sets; elsewhere a stored
              // value is junk that must not seed the session.
              distance: isCardioModality(modality) ? (set.distance ?? null) : null,
              // Cardio takes no between-set rest.
              rest_time: isCardioModality(modality) ? 0 : (set.rest_time ?? null),
              notes: set.notes ?? null,
              rpe: null,
              completed_at: null,
            })),
    };
  });
}

/**
 * Planned weight/reps per exercise/set position from a live-start payload,
 * captured before {@link stripPlannedSetValues} empties the create request.
 * The store keys these to the created session's set ids (same order) so
 * placeholder resolution can fall back to the preset's programmed values.
 */
export function extractPlannedSetValues(
  exercises: PresetSessionExerciseRequest[],
): AssumedSetValues[][] {
  return exercises.map((exercise) =>
    exercise.sets.map((set) => ({
      weight: set.weight ?? null,
      reps: set.reps ?? null,
      duration: set.duration ?? null,
      distance: set.distance ?? null,
    })),
  );
}

/**
 * Hevy-style live starts create every set with empty
 * weight/reps/duration/distance: the plan is an assumption, not a result, so
 * it renders as a gray placeholder and only becomes a real value when the set
 * is completed or typed over. Duration is stripped for every modality — on a
 * duration exercise it's the plan, and on a weight_reps exercise a stored
 * value is junk the editors can't show that would otherwise count as history
 * in the exercise-stats query (a duration-only set renders as a bare time in
 * the PREVIOUS column). Distance follows for the same reason on cardio sets.
 */
export function stripPlannedSetValues(
  exercises: PresetSessionExerciseRequest[],
): PresetSessionExerciseRequest[] {
  return exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({
      ...set,
      weight: null,
      reps: null,
      duration: null,
      distance: null,
    })),
  }));
}

/**
 * Build a full `Exercise` from a session's `exercise_snapshot` so a workout
 * card can open the library Exercise Detail screen. The snapshot carries the
 * same fields the catalog does (muscles, equipment, instructions, etc.);
 * missing ones fall back to empty so the detail screen still renders cleanly.
 */
export function exerciseFromSnapshot(
  snapshot: ExerciseSnapshotResponse | null,
  exerciseId: string,
): Exercise {
  return {
    id: snapshot?.id ?? exerciseId,
    name: snapshot?.name ?? 'Exercise',
    category: snapshot?.category ?? null,
    modality: snapshot?.modality ?? null,
    equipment: snapshot?.equipment ?? [],
    primary_muscles: snapshot?.primary_muscles ?? [],
    secondary_muscles: snapshot?.secondary_muscles ?? [],
    calories_per_hour: snapshot?.calories_per_hour ?? 0,
    source: snapshot?.source ?? '',
    images: snapshot?.images ?? [],
    tags: snapshot?.tags ?? [],
    force: snapshot?.force ?? null,
    level: snapshot?.level ?? null,
    mechanic: snapshot?.mechanic ?? null,
    instructions: snapshot?.instructions ?? undefined,
    description: snapshot?.description ?? undefined,
    userId: snapshot?.user_id ?? null,
    isCustom: snapshot?.is_custom ?? undefined,
  };
}

/**
 * Build a full `Exercise` from the sparse fields a card, draft, or preset row
 * carries (id, name, category, images). The remaining catalog fields are left
 * empty; the Exercise Detail screen hydrates them by id. Used wherever no full
 * `exercise_snapshot` is available.
 */
export function makeSparseExercise(params: {
  id: string;
  name?: string | null;
  category?: string | null;
  modality?: string | null;
  images?: string[] | null;
}): Exercise {
  return {
    id: params.id,
    name: params.name ?? 'Exercise',
    category: params.category ?? null,
    modality: isExerciseModality(params.modality) ? params.modality : null,
    equipment: [],
    primary_muscles: [],
    secondary_muscles: [],
    calories_per_hour: 0,
    source: '',
    images: params.images ?? [],
    tags: [],
    force: null,
    level: null,
    mechanic: null,
    instructions: undefined,
    description: undefined,
    userId: null,
    isCustom: undefined,
  };
}

/**
 * Build an `Exercise` from an online search result so the Exercise Detail
 * screen can preview it before import. External ids are not UUIDs, so the
 * detail screen skips hydration and history and renders exactly these fields.
 */
export function exerciseFromExternalItem(item: ExternalExerciseItem): Exercise {
  return {
    ...makeSparseExercise({
      id: item.id,
      name: item.name,
      category: item.category,
      modality: item.modality ?? null,
      images: item.images,
    }),
    equipment: item.equipment ?? [],
    primary_muscles: item.primary_muscles ?? [],
    secondary_muscles: item.secondary_muscles ?? [],
    calories_per_hour: item.calories_per_hour ?? 0,
    source: item.source,
    force: item.force ?? null,
    level: item.level ?? null,
    mechanic: item.mechanic ?? null,
    // Servers predating the wger search-projection parity send `instructions`
    // as a raw HTML string; drop it rather than crash the preview render.
    instructions: Array.isArray(item.instructions) ? item.instructions : undefined,
    description: item.description,
  };
}

/**
 * Build an `Exercise` from a form-draft exercise so its card can open the
 * library Exercise Detail. Drafts that originated from an existing session
 * carry the full snapshot; freshly-added ones only know name/category/images,
 * so the detail screen hydrates the rest by id.
 */
export function exerciseFromDraft(exercise: WorkoutDraftExercise): Exercise {
  if (exercise.snapshot) {
    return exerciseFromSnapshot(exercise.snapshot, exercise.exerciseId);
  }
  return makeSparseExercise({
    id: exercise.exerciseId,
    name: exercise.exerciseName,
    category: exercise.exerciseCategory,
    modality: exercise.exerciseModality ?? null,
    images: exercise.images,
  });
}

/**
 * Single-exercise payload for an empty live start (first-exercise-first flow).
 * The param carries modality/category so the default set's rest time can be
 * zeroed for cardio.
 */
export function buildSingleExerciseStartPayload(
  exercise: Pick<Exercise, 'id' | 'modality' | 'category'>,
): PresetSessionExerciseRequest[] {
  return [
    {
      exercise_id: exercise.id,
      sort_order: 0,
      duration_minutes: 0,
      notes: null,
      sets: [makeDefaultStartSet(1, resolveSnapshotModality(exercise))],
    },
  ];
}

type ActivitySetPayload = NonNullable<CreateExerciseEntryPayload['sets']>[number];

/** The entry-level cardio form values a single set is built from. */
export interface CardioEffortValues {
  durationSec: number | null;
  distanceKm: number | null;
}

/**
 * Merge ActivityDetailScreen's edited set drafts back onto the original server
 * sets. The server replaces the sets column wholesale on PUT, so fields the
 * activity editor has no UI for (rest_time, rpe, notes, …) must ride along
 * from the originals. Weight/reps always come from the drafts; `duration`
 * comes from the drafts only on duration-modality exercises — elsewhere it is
 * invisible structure and the original value rides along untouched.
 *
 * `cardio` is the entry-level Duration/Distance form state — the single
 * source of truth for a ≤1-set cardio entry. When passed, the one set (or a
 * fabricated one for legacy set-less entries) takes its duration/distance
 * from it with zero rest. Multi-set cardio fallbacks must NOT pass it; their
 * set distances ride along from the originals instead.
 */
export function buildActivitySetsPayload(
  draftSets: readonly WorkoutDraftSet[],
  originals: ReadonlyMap<string, ExerciseEntrySetResponse>,
  weightUnit: 'kg' | 'lbs',
  modality: ExerciseModality,
  cardio?: CardioEffortValues,
): ActivitySetPayload[] {
  if (cardio && draftSets.length === 0) {
    return [
      {
        set_number: 1,
        set_type: 'Working Set',
        weight: null,
        reps: null,
        duration: cardio.durationSec,
        distance: cardio.distanceKm,
        rest_time: 0,
      },
    ];
  }
  return draftSets.map((set, index) => {
    const w = parseDecimalInput(set.weight);
    const r = parseInt(set.reps, 10);
    const original = originals.get(set.clientId);
    return {
      ...(original && {
        id: original.id,
        set_type: original.set_type,
        duration: original.duration,
        distance: original.distance,
        rest_time: original.rest_time,
        notes: original.notes,
        rpe: original.rpe,
      }),
      set_type: original?.set_type ?? 'Working Set',
      set_number: index + 1,
      weight: isNaN(w) ? null : weightToKg(w, weightUnit),
      reps: isNaN(r) ? null : r,
      ...(isDurationModality(modality) ? { duration: set.duration ?? null } : {}),
      ...(cardio
        ? {
            duration: cardio.durationSec,
            distance: cardio.distanceKm,
            rest_time: 0,
          }
        : {}),
    };
  });
}

export function buildPresetExercisesPayload(
  exercises: WorkoutDraftExercise[],
  weightUnit: 'kg' | 'lbs',
  distanceUnit: 'km' | 'miles',
): WorkoutPresetExercisePayload[] {
  // Preset exercises with zero sets are valid on the server and render as
  // "No sets" in the detail view. Do NOT filter them out — saving an unrelated
  // edit would silently delete the user's zero-set rows from the preset.
  return exercises.map((exercise, index) => {
    const modality = resolveSnapshotModality({
      modality: exercise.exerciseModality,
      category: exercise.exerciseCategory,
    });
    return {
      exercise_id: exercise.exerciseId,
      image_url: exercise.images[0] ?? null,
      sort_order: index,
      superset_group: exercise.supersetGroup ?? null,
      sets: exercise.sets.map((set, setIndex) => {
        const weight = parseDecimalInput(set.weight);
        const reps = parseInt(set.reps, 10);
        const distance = parseDecimalInput(set.distance ?? '');
        return {
          set_number: setIndex + 1,
          set_type: set.setType ?? 'normal',
          reps: isNaN(reps) ? null : reps,
          weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
          // Modality-gated like the live builders: a session's junk duration
          // on a weights exercise must not become preset structure, and
          // distance is only meaningful on cardio sets.
          duration: isDurationModality(modality) ? (set.duration ?? null) : null,
          distance:
            isCardioModality(modality) && !isNaN(distance)
              ? distanceToKm(distance, distanceUnit)
              : null,
          rest_time: set.restTime ?? null,
          notes: set.notes ?? null,
        };
      }),
    };
  });
}

// --- Update-preset canonicalization (completion-screen prompt) ---

/**
 * A preset exercise/set in fully-specified request shape. Both the performed
 * session and the stored preset canonicalize into this, so deviation is a
 * field-for-field compare and the session-side array doubles as the PUT body.
 */
interface CanonicalPresetSet {
  set_number: number;
  set_type: string;
  reps: number | null;
  weight: number | null;
  duration: number | null;
  distance: number | null;
  rest_time: number | null;
  notes: string | null;
}

interface CanonicalPresetExercise {
  exercise_id: string;
  image_url: string | null;
  sort_order: number;
  superset_group: number | null;
  sets: CanonicalPresetSet[];
}

/**
 * Kg and km values pick up float noise across save round-trips; sub-gram /
 * sub-meter precision is plenty.
 */
function canonicalDecimal(value: number | null): number | null {
  return value == null ? null : Number(value.toFixed(3));
}

function canonicalizeSessionSet(
  set: ExerciseEntrySetResponse,
  setNumber: number,
  modality: ExerciseModality,
  completed: boolean,
  plannedValues: AssumedSetValues | undefined,
): CanonicalPresetSet {
  // Completed sets are authoritative for every field, nulls included; a
  // skipped set keeps the weight/reps/duration/distance it was programmed
  // with.
  const planned = completed ? undefined : plannedValues;
  return {
    set_number: setNumber,
    set_type: set.set_type ?? 'normal',
    reps: set.reps ?? planned?.reps ?? null,
    weight: canonicalDecimal(set.weight ?? planned?.weight ?? null),
    duration: isDurationModality(modality)
      ? (set.duration ?? planned?.duration ?? null)
      : null,
    distance: isCardioModality(modality)
      ? canonicalDecimal(set.distance ?? planned?.distance ?? null)
      : null,
    // Never backfilled: the live editors commit explicit clears for notes and
    // rest, and resurrecting a deleted note would mask the edit.
    rest_time: isCardioModality(modality) ? 0 : (set.rest_time ?? null),
    notes: set.notes ?? null,
  };
}

function canonicalizePresetSet(
  set: WorkoutPresetSet,
  setNumber: number,
  modality: ExerciseModality,
): CanonicalPresetSet {
  return {
    set_number: setNumber,
    set_type: set.set_type ?? 'normal',
    reps: set.reps ?? null,
    weight: canonicalDecimal(set.weight ?? null),
    // Same gates as the session side: a leaked duration/distance on the wrong
    // modality and the preset-null-vs-live-0 cardio rest split must not read
    // as deviations.
    duration: isDurationModality(modality) ? (set.duration ?? null) : null,
    distance: isCardioModality(modality) ? canonicalDecimal(set.distance ?? null) : null,
    rest_time: isCardioModality(modality) ? 0 : (set.rest_time ?? null),
    notes: set.notes ?? null,
  };
}

function canonicalSetsEqual(a: CanonicalPresetSet, b: CanonicalPresetSet): boolean {
  return (
    a.set_type === b.set_type &&
    a.reps === b.reps &&
    a.weight === b.weight &&
    a.duration === b.duration &&
    a.distance === b.distance &&
    a.rest_time === b.rest_time &&
    a.notes === b.notes
  );
}

function canonicalExercisesEqual(
  a: CanonicalPresetExercise,
  b: CanonicalPresetExercise,
): boolean {
  // set_number and sort_order are positional on both sides — nothing to compare.
  return (
    a.exercise_id === b.exercise_id &&
    a.image_url === b.image_url &&
    a.superset_group === b.superset_group &&
    a.sets.length === b.sets.length &&
    a.sets.every((set, i) => canonicalSetsEqual(set, b.sets[i]))
  );
}

/**
 * Canonicalize a finished live session into a preset `exercises` update
 * payload and compare it against the preset it was started from. Returns the
 * payload when the performed workout deviates from the preset — the diff and
 * the PUT body are the same construction, so "deviates" means exactly "the
 * update would change something" — or `null` when they are equivalent.
 *
 * Uncompleted sets backfill weight/reps/duration from `plannedSetValues`
 * (keyed by the session's birth set ids, so mid-workout deletions can't
 * misalign the backfill); everything else is session-verbatim. A zero-set
 * preset exercise whose fabricated live set was never touched canonicalizes
 * back to zero sets, and matched exercises keep the preset's `image_url`, so
 * neither shape reads as a deviation on its own.
 */
export function buildPresetUpdateExercises(
  session: PresetSessionResponse,
  preset: WorkoutPreset,
  opts: {
    completedSetIds: CompletedSetMap;
    plannedSetValues: Record<string, AssumedSetValues>;
  },
): WorkoutPresetExercisePayload[] | null {
  // Pair each session exercise with the first unconsumed preset exercise of
  // the same exercise_id (duplicates pair in order; unmatched = added). The
  // pair supplies the preset's image_url, the zero-set detection, and the
  // preset side's modality — the session snapshot beats the preset row,
  // which old servers leave without a modality.
  const consumed = new Set<number>();
  const matchedPresetIndex = session.exercises.map((exercise) => {
    const index = preset.exercises.findIndex(
      (candidate, i) => !consumed.has(i) && candidate.exercise_id === exercise.exercise_id,
    );
    if (index >= 0) consumed.add(index);
    return index >= 0 ? index : null;
  });

  const fromSession: CanonicalPresetExercise[] = session.exercises.map((exercise, index) => {
    const modality = resolveSnapshotModality(exercise.exercise_snapshot);
    const matchedIdx = matchedPresetIndex[index];
    const matched = matchedIdx == null ? null : preset.exercises[matchedIdx];
    // A zero-set preset exercise is a supported shape the live start papers
    // over with one fabricated default set. If that set was never completed
    // or typed into, canonicalize it back to zero sets — otherwise the preset
    // would read as deviating after every workout, and Update would write a
    // junk default set into it. rest_time is excluded from the untouched
    // check because the fabricated set carries a default rest.
    const [only] = exercise.sets;
    const untouchedFabricatedSet =
      matched != null &&
      matched.sets.length === 0 &&
      exercise.sets.length === 1 &&
      opts.completedSetIds[String(only.id)] == null &&
      only.weight == null &&
      only.reps == null &&
      only.duration == null &&
      only.distance == null &&
      only.notes == null;
    return {
      exercise_id: exercise.exercise_id,
      image_url:
        matched != null
          ? (matched.image_url ?? null)
          : (exercise.exercise_snapshot?.images?.[0] ?? null),
      sort_order: index,
      superset_group: exercise.superset_group ?? null,
      sets: untouchedFabricatedSet
        ? []
        : exercise.sets.map((set, setIndex) =>
            canonicalizeSessionSet(
              set,
              setIndex + 1,
              modality,
              opts.completedSetIds[String(set.id)] != null,
              opts.plannedSetValues[String(set.id)],
            ),
          ),
    };
  });

  const sessionModalityByPresetIndex = new Map<number, ExerciseModality>();
  matchedPresetIndex.forEach((presetIdx, sessionIdx) => {
    if (presetIdx != null) {
      sessionModalityByPresetIndex.set(
        presetIdx,
        resolveSnapshotModality(session.exercises[sessionIdx].exercise_snapshot),
      );
    }
  });

  const fromPreset: CanonicalPresetExercise[] = preset.exercises.map((exercise, index) => {
    const modality = sessionModalityByPresetIndex.get(index) ?? resolveSnapshotModality(exercise);
    return {
      exercise_id: exercise.exercise_id,
      image_url: exercise.image_url ?? null,
      sort_order: index,
      superset_group: exercise.superset_group ?? null,
      sets: exercise.sets.map((set, setIndex) =>
        canonicalizePresetSet(set, setIndex + 1, modality),
      ),
    };
  });

  const equivalent =
    fromSession.length === fromPreset.length &&
    fromSession.every((exercise, i) => canonicalExercisesEqual(exercise, fromPreset[i]));
  return equivalent ? null : fromSession;
}
