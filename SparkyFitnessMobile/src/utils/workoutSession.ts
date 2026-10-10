import type { TFunction } from 'i18next';
import type {
  AdaptiveAdjustment,
  ExerciseCoachingSignal,
  ExerciseEntrySetRequest,
  ExerciseEntrySetResponse,
  ExerciseModality,
  ExerciseRecentSessionSet,
  EntryExerciseSnapshotResponse,
  ExerciseSessionResponse,
  PresetSessionExerciseRequest,
  PresetSessionResponse,
  ProgressionEvaluationResult,
  WorkoutFormat,
} from '@workspace/shared';
import {
  NO_ADAPTIVE_ADJUSTMENT,
  adaptiveWeightStepKg,
  applyAdaptiveLoadFactorKg,
  carryDistanceFromKm,
  carryDistanceToKm,
  carryDistanceUnitLabel,
  calculateRampedWeightKg,
  decideAdaptiveAdjustment,
  distributeProgressionReps,
  effectiveLoadKg,
  evaluateProgression,
  isBodyweightModality,
  isCardioModality,
  isExerciseModality,
  isWeightDistanceModality,
  isWeightDurationModality,
  isWeightRampActive,
  resolveExerciseModality,
  setVolumeKg as sharedSetVolumeKg,
  setsDurationMinutes,
  weightRampStepIndexes,
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
import {
  weightToKg,
  weightFromKg,
  storedWeightInUnit,
  distanceFromKm,
  distanceToKm,
} from './unitConversions';
import { parseDecimalInput, parseSignedDecimalInput } from './numericInput';
import { getDefaultRestSec } from './workoutSupersets';
import { formatLocalizedNumber } from '../localization';
import { wodScoreFormat } from './wodScore';

// The superset/reorder algebra lives in its own module; re-exported here so
// the many existing import sites keep working.
export * from './workoutSupersets';

/**
 * Reads a record keyed by library exercise id, tolerating an entry whose
 * exercise has been deleted (`exercise_id` is then null).
 *
 * Such an entry has no library-scoped history to look up -- no PREVIOUS column,
 * no PR baseline -- so the lookup simply yields nothing. Centralising it here
 * keeps the null out of a dozen call sites that would otherwise each need a
 * guard, and makes "deleted exercise means no history" a single decision.
 */
export function historyForExercise<T>(
  record: Record<string, T>,
  exerciseId: string | null
): T | undefined {
  return exerciseId == null ? undefined : record[exerciseId];
}

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
  coros_mcp: 'COROS',
};

/**
 * Present a human-readable label for a workout session source. This function
 * is purely presentational — editability is decided by
 * `canEditGroupedWorkout` from `@workspace/shared`, never by this label map.
 */
export function getSourceLabel(source: string | null | undefined): string {
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

export function calculateExerciseStats(
  sessions: ExerciseSessionResponse[]
): ExerciseStats {
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
      const isActiveCals =
        session.exercise_snapshot?.name === 'Active Calories';
      if (isActiveCals) {
        activeCalories += session.calories_burned || 0;
      } else {
        otherExerciseCalories += sessionCals;
        durationMinutes += session.duration_minutes ?? 0;
      }
    }
  }

  return {
    caloriesBurned,
    activeCalories,
    otherExerciseCalories,
    durationMinutes,
  };
}

/** Total calories across all sessions. */
export const calculateCaloriesBurned = (
  sessions: ExerciseSessionResponse[]
): number => calculateExerciseStats(sessions).caloriesBurned;

/** Calories from "Active Calories" individual entries only (e.g. watch/fitness tracker). */
export const calculateActiveCalories = (
  sessions: ExerciseSessionResponse[]
): number => calculateExerciseStats(sessions).activeCalories;

/** Calories from all sessions except "Active Calories" entries. */
export const calculateOtherExerciseCalories = (
  sessions: ExerciseSessionResponse[]
): number => calculateExerciseStats(sessions).otherExerciseCalories;

/** Total duration in minutes, excluding "Active Calories" entries. */
export const calculateExerciseDuration = (
  sessions: ExerciseSessionResponse[]
): number => calculateExerciseStats(sessions).durationMinutes;

export function getWorkoutSummary(
  session: ExerciseSessionResponse,
  t: TFunction
): {
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
    name:
      session.name ??
      session.exercise_snapshot?.name ??
      t('workout.unknownExercise', { defaultValue: 'Unknown exercise' }),
    duration: session.duration_minutes,
    calories: session.calories_burned,
  };
}

export function buildSessionSubtitle(
  session: ExerciseSessionResponse,
  duration: number,
  calories: number,
  t: TFunction,
  weightUnit: 'kg' | 'lbs' = 'kg',
  distanceUnit: 'km' | 'miles' = 'km'
): string {
  if (session.type === 'preset') {
    const exerciseCount = session.exercises.length;
    // A cardio effort's backing set is an implementation detail (every read
    // surface renders it as duration+distance), so cardio exercises stay out
    // of the set count and contribute their distance instead — the cardio
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
      for (const set of ex.sets)
        totalVolumeKg += (set.weight ?? 0) * (set.reps ?? 0);
    }

    const parts: string[] = [];

    const wodScoreDetail = session.activity_details?.find(
      (d) => d.detail_type === 'wod_score'
    );
    if (wodScoreDetail?.detail_data) {
      let data: Record<string, unknown> | null = null;
      if (typeof wodScoreDetail.detail_data === 'string') {
        try {
          data = JSON.parse(wodScoreDetail.detail_data) as Record<
            string,
            unknown
          >;
        } catch {
          data = null;
        }
      } else if (
        typeof wodScoreDetail.detail_data === 'object' &&
        wodScoreDetail.detail_data !== null
      ) {
        data = wodScoreDetail.detail_data as Record<string, unknown>;
      }
      if (data) {
        const wodFormat = wodScoreFormat(data);
        const formatStr = wodFormat
          ? wodFormat.toUpperCase().replace('_', ' ')
          : 'WOD';
        const rounds =
          typeof data.rounds_completed === 'number' ? data.rounds_completed : 0;
        const reps =
          typeof data.reps_completed === 'number' ? data.reps_completed : 0;
        const status =
          typeof data.status === 'string' ? data.status.toUpperCase() : null;

        const scoreType =
          typeof data.score_type === 'string' ? data.score_type : null;

        let scoreStr = '';
        if (scoreType === 'total_reps') {
          scoreStr = `${reps} reps`;
        } else if (
          scoreType === 'rounds_reps' ||
          (!scoreType && wodFormat === 'amrap')
        ) {
          scoreStr = `${rounds} + ${reps}`;
        } else if (
          scoreType === 'time' ||
          (!scoreType && wodFormat === 'for_time')
        ) {
          scoreStr =
            typeof data.elapsed_seconds === 'number'
              ? formatDurationSeconds(data.elapsed_seconds)
              : 'Completed';
        } else if (scoreType === 'completion') {
          scoreStr = 'Completed';
        } else {
          scoreStr = `${rounds} rds`;
        }
        if (status) {
          scoreStr += ` (${status})`;
        }
        parts.push(`${formatStr}: ${scoreStr}`);
      }
    }

    parts.push(
      t('workout.exerciseCount', {
        count: exerciseCount,
        formattedCount: String(exerciseCount),
        defaultValue: '{{formattedCount}} exercises',
        defaultValue_one: '{{formattedCount}} exercise',
        defaultValue_other: '{{formattedCount}} exercises',
      })
    );
    if (totalSets > 0)
      parts.push(
        t('workout.setCount', {
          count: totalSets,
          formattedCount: String(totalSets),
          defaultValue: '{{formattedCount}} sets',
          defaultValue_one: '{{formattedCount}} set',
          defaultValue_other: '{{formattedCount}} sets',
        })
      );
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${formatLocalizedNumber(vol)} ${weightUnit}`);
    }
    if (totalDistanceKm > 0) {
      const dist = distanceFromKm(totalDistanceKm, distanceUnit);
      parts.push(
        `${formatLocalizedNumber(dist, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${distanceUnit === 'miles' ? 'mi' : 'km'}`
      );
    }
    if (calories > 0)
      parts.push(
        `${Math.round(calories)} ${t('workout.caloriesUnit', { defaultValue: 'Cal' })}`
      );
    return parts.join(' · ');
  }

  // Individual with sets: show sets info + duration/calories. Cardio is
  // excluded even though it is set-backed — "1 set" would hide the run;
  // its entry totals render through the activity branch below instead.
  const cardio = isCardioModality(
    resolveSnapshotModality(session.exercise_snapshot)
  );
  if (!cardio && session.sets.length > 0) {
    const totalSets = session.sets.length;
    const totalVolumeKg = session.sets.reduce(
      (sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0),
      0
    );
    const parts: string[] = [];
    parts.push(
      t('workout.setCount', {
        count: totalSets,
        formattedCount: String(totalSets),
        defaultValue: '{{formattedCount}} sets',
        defaultValue_one: '{{formattedCount}} set',
        defaultValue_other: '{{formattedCount}} sets',
      })
    );
    if (totalVolumeKg > 0) {
      const vol = Math.round(weightFromKg(totalVolumeKg, weightUnit));
      parts.push(`${formatLocalizedNumber(vol)} ${weightUnit}`);
    }
    if (duration > 0) parts.push(formatDuration(duration));
    if (calories > 0)
      parts.push(
        `${Math.round(calories)} ${t('workout.caloriesUnit', { defaultValue: 'Cal' })}`
      );
    return parts.join(' · ');
  }

  // Individual activity (and set-backed cardio): duration, distance, calories
  const parts: string[] = [];
  if (duration > 0) parts.push(formatDuration(duration));
  if (session.distance != null && session.distance > 0) {
    const dist = distanceFromKm(session.distance, distanceUnit);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    parts.push(
      `${formatLocalizedNumber(dist, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${label}`
    );
  }
  if (calories > 0)
    parts.push(
      `${Math.round(calories)} ${t('workout.caloriesUnit', { defaultValue: 'Cal' })}`
    );
  return parts.join(' · ');
}

/**
 * Set weight from a draft string. Only `bodyweight_reps` accepts a sign
 * (added load or assistance). Every other modality keeps the unsigned
 * parser, so a pasted minus does not become a negative load.
 */
export function parseSetWeight(
  value: string | null | undefined,
  modality: ExerciseModality
): number {
  return isBodyweightModality(modality)
    ? parseSignedDecimalInput(value)
    : parseDecimalInput(value);
}

export function buildExercisesPayload(
  exercises: WorkoutDraftExercise[],
  weightUnit: 'kg' | 'lbs',
  distanceUnit: 'km' | 'miles'
) {
  // Send each exercise's serverId when we have one. Exercises added,
  // replaced, or duplicated in the form carry a client-minted uuid, so a
  // save that drops every prior row still reconciles instead of the id-less
  // 409. Older drafts omit the id.
  return exercises.map((exercise, index) => {
    const modality = resolveSnapshotModality({
      modality: exercise.exerciseModality,
      category: exercise.exerciseCategory,
    });
    // The server recomputes calories from duration and sets whenever
    // calories_burned is omitted; a user-edited value is sent as a manual
    // override for this save only.
    const caloriesOverride = exercise.caloriesManuallySet
      ? parseDecimalInput(exercise.calories ?? '')
      : NaN;

    const sets = exercise.sets.map((set, setIndex) => {
      const weight = parseSetWeight(set.weight, modality);
      const reps = parseInt(set.reps, 10);
      const distance = parseDecimalInput(set.distance ?? '');
      // The server set UPDATE writes every column with `set.x ?? null`, so
      // fields the form has no UI for must still be round-tripped
      // explicitly — omitting them silently wipes the stored values.
      return {
        ...(set.serverId !== undefined ? { id: set.serverId } : {}),
        set_number: setIndex + 1,
        set_type: set.setType ?? null,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        reps: isNaN(reps) ? null : reps,
        duration: set.duration ?? null,
        distance: isNaN(distance)
          ? null
          : setDistanceToKm(distance, distanceUnit, modality),
        ...(set.restTime != null ? { rest_time: set.restTime } : {}),
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
        rir: set.rir ?? null,
        completed_at: set.completedAt ?? null,
        is_pr: set.isPr ?? false,
      };
    });

    return {
      ...(exercise.serverId !== undefined ? { id: exercise.serverId } : {}),
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
export function epley1RmKg(
  weightKg: number | null,
  reps: number | null
): number {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Estimated weight liftable for `targetReps`, derived from the Epley 1RM. */
export function estimateRepMaxKg(
  weightKg: number | null,
  reps: number | null,
  targetReps: number
): number {
  const oneRm = epley1RmKg(weightKg, reps);
  if (oneRm === 0 || targetReps <= 0) return 0;
  return oneRm / (1 + targetReps / 30);
}

/**
 * Weight × reps for a set. A bodyweight exercise's set weight is added
 * (positive) or assisting (negative) load, so its volume counts the lifter's
 * body weight too — the same rule the server's reports use.
 */
export function setVolumeKg(
  set: Pick<ExerciseEntrySetResponse, 'weight' | 'reps'>,
  modality: ExerciseModality = 'weight_reps',
  bodyWeightKg: number | null = null
): number {
  return sharedSetVolumeKg(set, modality, bodyWeightKg);
}

/**
 * The load a set moved, for its estimated maxes: the weight, or for a
 * bodyweight exercise body weight plus the added or assisting weight. Null
 * when a weighted exercise's set has no weight at all.
 */
export function setLoadKg(
  weightKg: number | null,
  modality: ExerciseModality,
  bodyWeightKg: number | null
): number | null {
  if (!isBodyweightModality(modality)) return weightKg;
  return effectiveLoadKg(weightKg, modality, bodyWeightKg);
}

/** Total working volume for an exercise entry. Warmup sets are excluded. */
export function getExerciseVolumeKg(
  exercise: {
    sets: WorkoutCardSet[];
    exercise_snapshot?: {
      modality?: string | null;
      category?: string | null;
    } | null;
  },
  bodyWeightKg: number | null = null
): number {
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  return exercise.sets.reduce(
    (total, set) =>
      isWarmupSetType(set.set_type)
        ? total
        : total + setVolumeKg(set, modality, bodyWeightKg),
    0
  );
}

/** Whether any exercise in the list is a bodyweight one (needs body weight). */
export function hasBodyweightExercise(
  exercises: readonly {
    exercise_snapshot?: {
      modality?: string | null;
      category?: string | null;
    } | null;
  }[]
): boolean {
  return exercises.some((exercise) =>
    isBodyweightModality(resolveSnapshotModality(exercise.exercise_snapshot))
  );
}

/**
 * A set weight for display, with the sign shown for a bodyweight exercise so
 * "+20" (weighted) and "−30" (assisted) read as changes to body weight.
 */
export function formatSetWeightText(
  formatted: string,
  weightKg: number | null,
  modality: ExerciseModality
): string {
  if (!isBodyweightModality(modality) || weightKg == null) return formatted;
  if (weightKg > 0) return `+${formatted}`;
  return formatted.replace(/^-/, '\u2212');
}

// --- Exercise modality ---

/**
 * Resolve an exercise's modality from any snapshot-shaped source — an
 * `exercise_snapshot`, a full `Exercise`, or a preset exercise row. Explicit
 * valid modality wins; otherwise derived from category (old servers, legacy
 * rows).
 */
export function resolveSnapshotModality(
  snapshot:
    { modality?: string | null; category?: string | null } | null | undefined
): ExerciseModality {
  return resolveExerciseModality(
    snapshot?.modality,
    snapshot?.category ?? null
  );
}

/** True for the modalities whose set tables render a single duration cell. */
export function isDurationModality(modality: ExerciseModality): boolean {
  return modality === 'duration' || modality === 'duration_distance';
}

export { isCardioModality, isWeightDistanceModality, isWeightDurationModality };

/** Whether a set of this modality stores a duration in seconds. */
export function modalityStoresDuration(modality: ExerciseModality): boolean {
  return isDurationModality(modality) || isWeightDurationModality(modality);
}

/** Whether a set of this modality stores a distance (km). */
export function modalityStoresDistance(modality: ExerciseModality): boolean {
  return isCardioModality(modality) || isWeightDistanceModality(modality);
}

/**
 * A set's distance in the unit it is edited and shown in: metres (yards when
 * the app shows miles) for weight-and-distance carries, km or miles for
 * everything else. Storage is always km.
 */
export function setDistanceFromKm(
  km: number,
  distanceUnit: 'km' | 'miles',
  modality?: ExerciseModality | null
): number {
  return modality != null && isWeightDistanceModality(modality)
    ? carryDistanceFromKm(km, distanceUnit)
    : distanceFromKm(km, distanceUnit);
}

/** Inverse of `setDistanceFromKm`. */
export function setDistanceToKm(
  value: number,
  distanceUnit: 'km' | 'miles',
  modality?: ExerciseModality | null
): number {
  return modality != null && isWeightDistanceModality(modality)
    ? carryDistanceToKm(value, distanceUnit)
    : distanceToKm(value, distanceUnit);
}

/** Short unit label matching `setDistanceFromKm`. */
export function setDistanceUnitLabel(
  distanceUnit: 'km' | 'miles',
  modality?: ExerciseModality | null
): string {
  return modality != null && isWeightDistanceModality(modality)
    ? carryDistanceUnitLabel(distanceUnit)
    : distanceUnit === 'miles'
      ? 'mi'
      : 'km';
}

/**
 * True when a workout card renders the Duration+Distance cardio form in place
 * of a set table: a cardio exercise with at most one set. Multi-set cardio
 * (imports, future intervals) keeps the duration-style table so no set is
 * hidden. Surfaces that can disable the form entirely (the preset editor)
 * AND this with their own `cardioFormEnabled` gate.
 */
export function rendersCardioEffortForm(
  snapshot:
    { modality?: string | null; category?: string | null } | null | undefined,
  setCount: number
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
  modality: ExerciseModality
): number | null {
  return (
    set.duration ??
    (modality === 'duration' && set.reps != null ? set.reps : null)
  );
}

/** Read-only duration prose: `45s` under a minute, `1:30` from there up. */
export function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

// --- Card-stack input shapes ---

export interface WorkoutCardSet {
  /** Server set id (number) or `WorkoutDraftSet.clientId` (string). */
  id: string | number;
  set_number: number;
  set_type?: string | null;
  /** ALWAYS kg — display conversion happens in the row. */
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  rir?: number | null;
  rest_time?: number | null;
  notes?: string | null;
  duration?: number | null;
  /** ALWAYS km — display conversion happens in the cardio form. */
  distance?: number | null;
  /** Raw draft strings backing the edit-mode controlled inputs (draft mapper only). */
  editWeightText?: string;
  editRepsText?: string;
  editDistanceText?: string;
}

export interface WorkoutCardExercise {
  /** Entry id or `WorkoutDraftExercise.clientId`. */
  id: string;
  /**
   * Null once the library exercise has been deleted. Nothing the card renders
   * needs it -- name, category, modality and images all come from
   * `exercise_snapshot` -- it is only used to look up library-scoped history
   * (stats, PREVIOUS column, PR baseline), which a deleted exercise has none of.
   */
  exercise_id: string | null;
  superset_group?: number | null;
  /** Per-exercise note. Present on live/session entries and workout drafts; absent on preset sources. */
  notes?: string | null;
  /** Present on session entries; absent on draft/preset sources. */
  calories_burned?: number | null;
  /**
   * Heart rate for this exercise, present on session entries once a paired
   * watch has reported it (or a synced workout supplied it). Per exercise
   * rather than per session because the watch tags each batch with whichever
   * exercise was on screen when it was captured.
   */
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  exercise_snapshot: {
    name?: string | null;
    category?: string | null;
    modality?: string | null;
    images?: string[] | null;
    mechanic?: string | null;
    /** Used to round dumbbell warm-ups to dumbbell steps. */
    equipment?: string[] | null;
  } | null;
  sets: WorkoutCardSet[];
  /** Raw draft string backing the edit-mode calories input (draft mapper only). */
  editCaloriesText?: string;

  // Progression & Equipment Fields
  progression_mode?: 'rep_goal' | 'fixed' | 'step_load' | 'manual' | null;
  rep_goal?: number | null;
  increment_type?: 'weight' | 'reps' | null;
  increment_value?: number | null;
  equipment_brand?: string | null;
  /** Within-session per-set ramp, kg. Null = off. */
  ramp_increment?: number | null;
}

/**
 * Adapt a form-draft exercise for the card stack. Weight parsing matches
 * `buildExercisesPayload` exactly (the modality-gated weight parser, then
 * weightToKg, NaN → null) so what the card displays is what a save would persist.
 */
export function draftExerciseToCardExercise(
  exercise: WorkoutDraftExercise,
  weightUnit: 'kg' | 'lbs',
  distanceUnit: 'km' | 'miles' = 'km'
): WorkoutCardExercise {
  const snapshot = exercise.snapshot ?? {
    name: exercise.exerciseName,
    category: exercise.exerciseCategory,
    modality: exercise.exerciseModality ?? null,
    equipment: exercise.exerciseEquipment ?? null,
    images: exercise.images,
  };
  const modality = resolveSnapshotModality(snapshot);
  return {
    id: exercise.clientId,
    exercise_id: exercise.exerciseId,
    superset_group: exercise.supersetGroup ?? null,
    notes: exercise.notes ?? null,
    editCaloriesText: exercise.calories ?? '',
    progression_mode: exercise.progressionMode ?? 'rep_goal',
    rep_goal: exercise.repGoal ?? null,
    increment_type: exercise.incrementType ?? 'weight',
    increment_value: exercise.incrementValue ?? 5,
    equipment_brand: exercise.equipmentBrand ?? null,
    ramp_increment: exercise.rampIncrement ?? null,
    exercise_snapshot: snapshot,
    sets: exercise.sets.map((set, index) => {
      const weight = parseSetWeight(set.weight, modality);
      const reps = parseInt(set.reps, 10);
      const distance = parseDecimalInput(set.distance ?? '');
      return {
        id: set.clientId,
        set_number: index + 1,
        set_type: set.setType ?? null,
        weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
        reps: isNaN(reps) ? null : reps,
        rpe: set.rpe ?? null,
        rir: set.rir ?? null,
        rest_time: set.restTime ?? null,
        notes: set.notes ?? null,
        duration: set.duration ?? null,
        distance: isNaN(distance)
          ? null
          : setDistanceToKm(distance, distanceUnit, modality),
        editWeightText: set.weight,
        editRepsText: set.reps,
        editDistanceText: set.distance ?? '',
      };
    }),
  };
}

/** Adapt a saved preset exercise for the card stack (weights already kg). */
export function presetExerciseToCardExercise(
  exercise: WorkoutPresetExercise
): WorkoutCardExercise {
  return {
    id: String(exercise.id),
    exercise_id: exercise.exercise_id,
    superset_group: exercise.superset_group ?? null,
    progression_mode: exercise.progression_mode ?? 'rep_goal',
    rep_goal: exercise.rep_goal ?? null,
    increment_type: exercise.increment_type ?? 'weight',
    increment_value: exercise.increment_value ?? 5,
    equipment_brand: exercise.equipment_brand ?? null,
    ramp_increment: exercise.ramp_increment ?? null,
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
  return `${formatLocalizedNumber(Math.round(value))} ${weightUnit}`;
}

/** Compact historical-set text, e.g. `W 60 × 8`, `100 × 5`, `12 reps`, `45s`, or `30:00 · 5.2 km`; weight is unitless display units. */
export function formatRecentSessionSet(
  set: ExerciseRecentSessionSet,
  weightUnit: 'kg' | 'lbs',
  t: TFunction,
  modality?: ExerciseModality,
  distanceUnit: 'km' | 'miles' = 'km'
): string {
  const prefix = set.setType === 'warmup' ? 'W ' : '';
  if (modality != null && isDurationModality(modality)) {
    const seconds = effectiveSetDurationSec(
      { duration: set.duration ?? null, reps: set.reps },
      modality
    );
    const parts: string[] = [];
    if (seconds != null) parts.push(formatDurationSeconds(seconds));
    if (isCardioModality(modality) && set.distance != null) {
      const dist = formatLocalizedNumber(
        distanceFromKm(set.distance, distanceUnit),
        { maximumFractionDigits: 2 }
      );
      parts.push(`${dist} ${distanceUnit === 'miles' ? 'mi' : 'km'}`);
    }
    return parts.length > 0 ? `${prefix}${parts.join(' · ')}` : '–';
  }
  const w =
    set.weight != null
      ? formatLocalizedNumber(weightFromKg(set.weight, weightUnit), {
          maximumFractionDigits: 1,
        })
      : null;
  if (modality != null && isWeightDistanceModality(modality)) {
    const dist =
      set.distance != null
        ? `${formatLocalizedNumber(
            setDistanceFromKm(set.distance, distanceUnit, modality),
            { maximumFractionDigits: 1 }
          )} ${setDistanceUnitLabel(distanceUnit, modality)}`
        : null;
    const parts = [w, dist].filter((part): part is string => part != null);
    return parts.length > 0 ? `${prefix}${parts.join(' × ')}` : '–';
  }
  if (modality != null && isWeightDurationModality(modality)) {
    const parts = [
      w,
      set.duration != null ? formatDurationSeconds(set.duration) : null,
    ].filter((part): part is string => part != null);
    return parts.length > 0 ? `${prefix}${parts.join(' × ')}` : '–';
  }
  if (w != null && set.reps != null) return `${prefix}${w} × ${set.reps}`;
  if (w != null) return `${prefix}${w}`;
  if (set.reps != null)
    return `${prefix}${t('workout.repCount', { count: set.reps, formattedCount: formatLocalizedNumber(set.reps), defaultValue: '{{formattedCount}} reps', defaultValue_one: '{{formattedCount}} rep' })}`;
  if (set.duration != null)
    return `${prefix}${formatDurationSeconds(set.duration)}`;
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
  setId: string | null
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
      reps: durationLike ? null : (set.reps ?? null),
      weightKg: durationLike ? null : (set.weight ?? null),
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
  duration?: number | null;
  distance?: number | null;
}

type AssumableSet = Pick<
  WorkoutCardSet,
  'id' | 'set_type' | 'weight' | 'reps' | 'duration' | 'distance'
>;

/** Optional adjustments layered onto the placeholder resolution. */
export interface AssumedSetOverrides {
  /**
   * Kg added to each working set's prior weight when between-session
   * progression says to go up (weight-progression overload is active).
   */
  progressionIncrementKg?: number | null;
  /**
   * Rep targets per working set (warm-ups not counted) when progression
   * raised reps; they replace each working set's history/plan reps.
   */
  progressionRepTargets?: readonly number[] | null;
  /**
   * Within-session ramp, kg per step. Working sets after the first step from
   * the first working set's placeholder; see {@link resolveAssumedSetValues}.
   */
  rampIncrementKg?: number | null;
  /** Display unit the ramp rounds in (0.25 kg / 2.5 lb). Defaults to kg. */
  weightUnit?: 'kg' | 'lbs';
  /**
   * Adaptive "lighter day" multiplier for working-set weights from history
   * (issue #1560). Rounded down to a loadable step in `weightUnit`.
   */
  adaptiveLoadFactor?: number | null;
}

/**
 * Resolve the assumed (placeholder) weight/reps for every set of one exercise
 * in a live workout. Each field resolves independently, first match wins:
 *
 *   1. The same-position set from the exercise's most recent prior session
 *      (what the PREVIOUS column shows), bumped by the progression increment
 *      when weight-progression overload is active — each set is bumped from
 *      its own prior weight, not flattened to one suggested weight, so
 *      pyramid/ascending-weight sets keep their relative spread.
 *   2. The planned value captured at live start (the preset's programmed set).
 *   3. The preceding row's effective value — its entered value, else its
 *      resolved placeholder.
 *
 * With a ramp, the first ramp-eligible set (working or failure — warm-ups and
 * drop sets are skipped) resolves as above and becomes the base; each later
 * eligible set's weight is base + step × increment, rounded to a loadable
 * weight. The base is the first set's *placeholder*, never what was typed or
 * logged into it, so lifting heavier on set 1 does not move later sets.
 */
/**
 * Pairs each current set with its counterpart in the last session, warm-ups
 * with warm-ups and working sets with working sets, each in order. Pairing by
 * plain position let warm-ups added ahead of the working sets take their
 * history, leaving the working sets with a dash. A set with no counterpart
 * (more sets than last time, or warm-ups where there were none) is undefined.
 */
export function alignPreviousSets<T extends { setType?: string | null }>(
  sets: readonly { set_type?: string | null }[],
  previousSets: readonly T[] | undefined
): (T | undefined)[] {
  const warmups = (previousSets ?? []).filter((s) =>
    isWarmupSetType(s.setType)
  );
  const working = (previousSets ?? []).filter(
    (s) => !isWarmupSetType(s.setType)
  );
  let warmupIndex = 0;
  let workingIndex = 0;
  return sets.map((set) =>
    isWarmupSetType(set.set_type)
      ? warmups[warmupIndex++]
      : working[workingIndex++]
  );
}

export function resolveAssumedSetValues(
  sets: readonly AssumableSet[],
  previousSets: readonly ExerciseRecentSessionSet[] | undefined,
  plannedBySetId?: Record<string, AssumedSetValues>,
  overrides?: AssumedSetOverrides
): AssumedSetValues[] {
  const progressionIncrementKg = overrides?.progressionIncrementKg;
  const rampIncrementKg = overrides?.rampIncrementKg;
  const rampSteps = isWeightRampActive(rampIncrementKg)
    ? weightRampStepIndexes(sets)
    : null;
  let rampBaseKg: number | null = null;
  let workingIndex = 0;
  const lastEffective = {
    warmup: {
      weight: null,
      reps: null,
      duration: null,
      distance: null,
    } as AssumedSetValues,
    working: {
      weight: null,
      reps: null,
      duration: null,
      distance: null,
    } as AssumedSetValues,
  };
  const alignedPrevious = alignPreviousSets(sets, previousSets);
  return sets.map((set, index) => {
    const tier = set.set_type === 'warmup' ? 'warmup' : 'working';
    const previous = alignedPrevious[index];
    const planned = plannedBySetId?.[String(set.id)];

    const progressedPreviousWeight =
      tier === 'working' &&
      progressionIncrementKg != null &&
      progressionIncrementKg > 0 &&
      previous?.weight != null &&
      previous.weight > 0
        ? previous.weight + progressionIncrementKg
        : previous?.weight;
    // A lighter adaptive day applies to whatever the working set would
    // otherwise start from — history, or the plan when this preset has no
    // history yet — but never to the carried-forward value, which already
    // holds an adapted weight.
    const adaptiveLoadFactor = overrides?.adaptiveLoadFactor;
    const sourceWeight = progressedPreviousWeight ?? planned?.weight;
    const adaptedSourceWeight =
      tier === 'working' && adaptiveLoadFactor != null && sourceWeight != null
        ? applyAdaptiveLoadFactorKg(
            sourceWeight,
            adaptiveLoadFactor,
            overrides?.weightUnit ?? 'kg'
          )
        : sourceWeight;

    let weight = adaptedSourceWeight ?? lastEffective[tier].weight;
    const rampStep = rampSteps?.[index] ?? null;
    if (rampStep === 0) {
      rampBaseKg = weight != null && weight > 0 ? weight : null;
    } else if (
      rampStep != null &&
      rampBaseKg != null &&
      isWeightRampActive(rampIncrementKg)
    ) {
      weight = calculateRampedWeightKg(
        rampBaseKg,
        rampStep,
        rampIncrementKg,
        overrides?.weightUnit ?? 'kg'
      );
    }

    const progressionReps =
      tier === 'working'
        ? overrides?.progressionRepTargets?.[workingIndex++]
        : undefined;
    const assumed: AssumedSetValues = {
      weight,
      reps:
        progressionReps ??
        previous?.reps ??
        planned?.reps ??
        lastEffective[tier].reps,
      duration:
        previous?.duration ??
        planned?.duration ??
        lastEffective[tier].duration ??
        null,
      distance:
        previous?.distance ??
        planned?.distance ??
        lastEffective[tier].distance ??
        null,
    };
    lastEffective[tier].weight = set.weight ?? assumed.weight;
    lastEffective[tier].reps = set.reps ?? assumed.reps;
    lastEffective[tier].duration = set.duration ?? assumed.duration;
    lastEffective[tier].distance = set.distance ?? assumed.distance;
    return assumed;
  });
}

/**
 * The preset exercise settings a live workout needs but the server's session
 * entries don't carry: between-session progression and the within-session
 * ramp. Captured from the preset at live start, keyed by session exercise id.
 * Increments that are weights are kg.
 */
export interface LiveExerciseConfig {
  progression_mode?: 'rep_goal' | 'fixed' | 'step_load' | 'manual' | null;
  rep_goal?: number | null;
  increment_type?: 'weight' | 'reps' | null;
  increment_value?: number | null;
  equipment_brand?: string | null;
  ramp_increment?: number | null;
}

/** Pick the live-relevant settings off a preset exercise. */
export function liveExerciseConfigFromPreset(
  exercise: Partial<LiveExerciseConfig>
): LiveExerciseConfig {
  return {
    progression_mode: exercise.progression_mode ?? null,
    rep_goal: exercise.rep_goal ?? null,
    increment_type: exercise.increment_type ?? null,
    increment_value:
      exercise.increment_value != null
        ? Number(exercise.increment_value)
        : null,
    equipment_brand: exercise.equipment_brand ?? null,
    ramp_increment:
      exercise.ramp_increment != null ? Number(exercise.ramp_increment) : null,
  };
}

/**
 * Positional live configs for {@link buildPresetStartExercisesPayload}'s
 * exercises (same order), for `startWorkout` to key by session exercise id.
 */
export function buildPresetLiveExerciseConfigs(
  preset: WorkoutPreset
): LiveExerciseConfig[] {
  return preset.exercises.map(liveExerciseConfigFromPreset);
}

type ProgressionPreviousSet = ExerciseRecentSessionSet & {
  set_type?: string | null;
};

/**
 * Evaluate between-session progression for one exercise against its most
 * recent prior session. Null when the exercise has no rep goal and isn't in
 * fixed mode (nothing configured). The engine works in the display unit, so
 * weights and a weight increment (stored kg) are converted in.
 */
export function evaluateExerciseProgression(
  config: LiveExerciseConfig,
  sets: readonly Pick<WorkoutCardSet, 'set_type'>[],
  previousSets: readonly ExerciseRecentSessionSet[] | undefined,
  weightUnit: 'kg' | 'lbs'
): ProgressionEvaluationResult | null {
  if (!config.rep_goal && config.progression_mode !== 'fixed') return null;
  const workingSets = sets.filter((s) => !isWarmupSetType(s.set_type));
  const progressionMode = config.progression_mode ?? 'rep_goal';
  const incrementType = config.increment_type ?? 'weight';
  const incrementValue = config.increment_value ?? 2.5;
  // Step-load always raises reps, so its increment is a count even when the
  // stored increment_type says weight (the repository's default).
  const incrementIsWeight =
    incrementType === 'weight' && progressionMode !== 'step_load';
  const workingPreviousSets = (previousSets ?? []).filter((s) => {
    const setType = (s as ProgressionPreviousSet).set_type ?? s.setType;
    return !isWarmupSetType(setType);
  });
  const firstWorking = workingPreviousSets[0];
  return evaluateProgression(
    {
      progressionMode,
      targetSets: workingSets.length || 3,
      repGoal: config.rep_goal,
      incrementType,
      incrementValue: incrementIsWeight
        ? storedWeightInUnit(incrementValue, weightUnit)
        : incrementValue,
      equipmentBrand: config.equipment_brand ?? null,
    },
    workingPreviousSets.length > 0
      ? {
          // Rounded as they were typed, so the suggestion reads 95 lb rather
          // than the 94.997… that float kg↔lb round trips add up to.
          baseWeight: firstWorking?.weight
            ? storedWeightInUnit(firstWorking.weight, weightUnit)
            : 0,
          sets: workingPreviousSets.map((s, idx) => ({
            setNumber: idx + 1,
            reps: s.reps ?? 0,
            weight: s.weight ? storedWeightInUnit(s.weight, weightUnit) : 0,
          })),
        }
      : null
  );
}

/** The kg bump placeholders take when progression says to add weight. */
export function progressionIncrementKgFor(
  config: LiveExerciseConfig,
  result: ProgressionEvaluationResult | null
): number | null {
  return result?.goalAchieved && result.status === 'PROGRESSION_WEIGHT_INCREASE'
    ? Number(config.increment_value) || 2.5
    : null;
}

/** The live-start settings a placeholder resolves against. */
export interface LiveAssumeSources {
  plannedSetValues: Record<string, AssumedSetValues>;
  exerciseConfigs?: Record<string, LiveExerciseConfig>;
  weightUnit?: 'kg' | 'lbs';
  workoutFormat?: WorkoutFormat;
  /** Adaptive signals per library `exercise_id` (issue #1560). */
  coachingSignals?: Record<string, ExerciseCoachingSignal | null>;
  /** Session exercise ids whose adaptive adjustment the user declined. */
  declinedAdaptive?: Record<string, true>;
}

/**
 * The adaptive adjustment in force for one live session exercise: none when
 * the user declined it, when the workout is clock-driven (interval/WOD sets
 * aren't load-prescribed), or when there is no recent signal.
 */
export function liveAdaptiveAdjustment(
  exercise: Pick<WorkoutCardExercise, 'id' | 'exercise_id'>,
  sources: Pick<
    LiveAssumeSources,
    'coachingSignals' | 'declinedAdaptive' | 'workoutFormat'
  >
): AdaptiveAdjustment {
  if ((sources.workoutFormat ?? 'standard') !== 'standard') {
    return NO_ADAPTIVE_ADJUSTMENT;
  }
  if (sources.declinedAdaptive?.[String(exercise.id)]) {
    return NO_ADAPTIVE_ADJUSTMENT;
  }
  if (exercise.exercise_id == null) return NO_ADAPTIVE_ADJUSTMENT;
  return decideAdaptiveAdjustment(
    sources.coachingSignals?.[exercise.exercise_id]
  );
}

/** {@link LiveAssumeSources} plus the history map, as the store holds it. */
export interface AssumedValueSources extends LiveAssumeSources {
  previousSessionSets: Record<string, ExerciseRecentSessionSet[]>;
}

/**
 * {@link resolveAssumedSetValues} for one live session exercise with its
 * progression bump and ramp applied — the single resolution the live row, a
 * no-typing completion, the HUD and the rest notification all share, so what
 * a row shows is what logging it records. The ramp is standard-format only:
 * interval/WOD sets are clock-driven.
 */
export function resolveLiveAssumedSetValues(
  exercise: Pick<WorkoutCardExercise, 'id' | 'exercise_id' | 'sets'>,
  previousSets: readonly ExerciseRecentSessionSet[] | undefined,
  sources: LiveAssumeSources
): AssumedSetValues[] {
  const weightUnit = sources.weightUnit ?? 'kg';
  const config = sources.exerciseConfigs?.[String(exercise.id)];
  const progression =
    config == null
      ? null
      : evaluateExerciseProgression(
          config,
          exercise.sets,
          previousSets,
          weightUnit
        );
  // Adaptive coaching (#1560) nudges the engine's output: it can cancel an
  // increase, add one step, or lighten the day. Pain never adds load.
  const adaptive = liveAdaptiveAdjustment(exercise, sources);
  const engineIncrementKg =
    config == null ? null : progressionIncrementKgFor(config, progression);
  const progressionIncrementKg = adaptive.blockIncrease
    ? null
    : adaptive.addIncrement && engineIncrementKg == null
      ? adaptiveIncrementKgFor(config, weightUnit)
      : engineIncrementKg;
  const progressionRepTargets = adaptive.blockIncrease
    ? null
    : distributeProgressionReps(
        progression,
        config?.progression_mode ?? 'rep_goal',
        exercise.sets.filter((s) => !isWarmupSetType(s.set_type)).length
      );
  const rampIncrementKg =
    (sources.workoutFormat ?? 'standard') === 'standard'
      ? (config?.ramp_increment ?? null)
      : null;
  return resolveAssumedSetValues(
    exercise.sets,
    previousSets,
    sources.plannedSetValues,
    {
      progressionIncrementKg,
      progressionRepTargets,
      rampIncrementKg,
      weightUnit,
      adaptiveLoadFactor: adaptive.loadFactor,
    }
  );
}

/**
 * The kg step a "too easy twice" adaptive increase adds: the preset's own
 * weight increment when it has one, else one loadable step in the lifter's
 * unit (2.5 kg / 5 lb).
 */
function adaptiveIncrementKgFor(
  config: LiveExerciseConfig | undefined,
  weightUnit: 'kg' | 'lbs'
): number {
  if (
    config?.increment_value != null &&
    (config.increment_type ?? 'weight') === 'weight' &&
    config.progression_mode !== 'step_load'
  ) {
    return Number(config.increment_value);
  }
  return adaptiveWeightStepKg(weightUnit);
}

/**
 * {@link describeActiveSet} with empty weight/reps backfilled from
 * {@link resolveLiveAssumedSetValues}, so the HUD bar and the rest-complete
 * notification describe the set the user is assumed to perform.
 */
export function describeActiveSetAssumed(
  session: PresetSessionResponse | null,
  setId: string | null,
  sources: AssumedValueSources
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
    const assumed = resolveLiveAssumedSetValues(
      exercise,
      historyForExercise(sources.previousSessionSets, exercise.exercise_id),
      sources
    )[setIndex];
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
  const totalSeconds =
    startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
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
  set: Pick<ActiveSetDescription, 'weightKg' | 'reps'> & {
    durationSec?: number | null;
  },
  weightUnit: 'kg' | 'lbs',
  t: TFunction
): string | null {
  if (set.durationSec != null) return formatDurationSeconds(set.durationSec);
  const w =
    set.weightKg != null
      ? `${formatLocalizedNumber(weightFromKg(set.weightKg, weightUnit), { maximumFractionDigits: 1 })} ${weightUnit}`
      : null;
  if (w != null && set.reps != null) return `${w} × ${set.reps}`;
  if (set.reps != null)
    return t('workout.repCount', {
      count: set.reps,
      formattedCount: formatLocalizedNumber(set.reps),
      defaultValue: '{{formattedCount}} reps',
      defaultValue_one: '{{formattedCount}} rep',
    });
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
 */
export function buildSessionExercisesPayload(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  prSetIds: PrSetMap,
  startedAtMs?: number | null
): PresetSessionExerciseRequest[] {
  const timing = buildSessionExerciseTiming(
    session,
    completedSetIds,
    startedAtMs
  );

  return session.exercises.map((exercise, index) => ({
    id: exercise.id,
    exercise_id: exercise.exercise_id,
    sort_order: index,
    duration_minutes: isCardioModality(
      resolveSnapshotModality(exercise.exercise_snapshot)
    )
      ? setsDurationMinutes(exercise.sets)
      : (timing?.durations.get(exercise.id) ?? exercise.duration_minutes ?? 0),
    // Omitted when nothing was completed yet, so the server keeps what it has.
    ...(timing?.startTimes.has(exercise.id)
      ? { entry_time: timing.startTimes.get(exercise.id) }
      : {}),
    notes: exercise.notes ?? null,
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
        rir: set.rir ?? null,
        completed_at:
          completedMs != null ? new Date(completedMs).toISOString() : null,
        is_pr: prSetIds[String(set.id)] === true,
      };
    }),
  }));
}

export function buildSessionDurationMinutes(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  startedAtMs?: number | null
): Map<string, number> | null {
  return (
    buildSessionExerciseTiming(session, completedSetIds, startedAtMs)
      ?.durations ?? null
  );
}

export interface SessionExerciseTiming {
  /** Minutes per non-cardio entry; entries absent here keep their stored value. */
  durations: Map<string, number>;
  /** Local wall-clock 'HH:MM' at which each entry's first timed span began. */
  startTimes: Map<string, string>;
}

/** Local wall-clock 'HH:MM' for an instant, the format entry_time expects. */
export function toEntryTimeString(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Walks the completed strength sets in the order they were ticked off and
 * gives each gap (previous completion, or the workout start, up to this
 * completion) to the exercise the set belongs to. That is the time spent on
 * that exercise's set plus the rest before it, so supersets and exercises
 * done out of order each get their own share. The per-entry durations still
 * add up to start→last completion.
 *
 * An entry's start time is the beginning of its first gap. Cardio entries
 * are left out: their duration is the sum of their set durations.
 */
export function buildSessionExerciseTiming(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  startedAtMs?: number | null
): SessionExerciseTiming | null {
  if (startedAtMs == null) return null;

  let anyCompletedAfterStart = false;
  const completedCountByEntryId = new Map<string, number>();
  const timeline: { ms: number; entryId: string }[] = [];
  for (const exercise of session.exercises) {
    const cardio = isCardioModality(
      resolveSnapshotModality(exercise.exercise_snapshot)
    );
    let count = 0;
    for (const s of exercise.sets) {
      const ms = completedSetIds[String(s.id)];
      if (ms == null) continue;
      if (ms > startedAtMs) anyCompletedAfterStart = true;
      if (cardio) continue;
      count++;
      // Completions before the start (a resumed session) can't be placed on
      // this clock; their entry keeps its stored duration.
      if (ms > startedAtMs) timeline.push({ ms, entryId: exercise.id });
    }
    if (!cardio) completedCountByEntryId.set(exercise.id, count);
  }
  if (!anyCompletedAfterStart) return null;

  const durations = new Map<string, number>();
  const startTimes = new Map<string, string>();
  for (const [entryId, count] of completedCountByEntryId) {
    if (count === 0) durations.set(entryId, 0);
  }

  timeline.sort((a, b) => a.ms - b.ms);
  const spanMs = new Map<string, number>();
  let previousMs = startedAtMs;
  for (const { ms, entryId } of timeline) {
    spanMs.set(entryId, (spanMs.get(entryId) ?? 0) + (ms - previousMs));
    if (!startTimes.has(entryId)) {
      startTimes.set(entryId, toEntryTimeString(previousMs));
    }
    previousMs = ms;
  }
  for (const [entryId, ms] of spanMs) {
    durations.set(entryId, Math.round((ms / 60_000) * 10) / 10);
  }
  return { durations, startTimes };
}

export const WORKOUT_LONG_GAP_MINUTES = 30;

export interface WorkoutSpanSummary {
  totalMinutes: number;
  activeMinutes: number;
  hasLongGap: boolean;
}

export function summarizeWorkoutSpan(
  completedSetIds: CompletedSetMap,
  startedAtMs: number | null | undefined
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

export const SET_TYPE_OPTIONS = [
  'warmup',
  'normal',
  'drop',
  'failure',
] as const;

/**
 * The first value cell a set row takes focus on for its exercise's modality:
 * duration for timed/cardio work, reps for bodyweight, else weight.
 */
export function firstSetInputField(
  modality: ExerciseModality
): 'duration' | 'reps' | 'weight' {
  if (isDurationModality(modality)) return 'duration';
  // A bodyweight set's weight is optional (blank is body weight alone).
  return modality === 'reps_only' || isBodyweightModality(modality)
    ? 'reps'
    : 'weight';
}

export function isDropSetType(setType: string | null | undefined): boolean {
  return setType === 'drop';
}

export function setTypeLetter(
  setType: string | null | undefined
): 'W' | 'D' | 'F' | null {
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

export function isWarmupSetType(setType: string | null | undefined): boolean {
  if (setType == null) return false;
  return setType
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .startsWith('warmup');
}

export interface PrBaselineEntry {
  weight: number | null;
  reps: number | null;
}

export function compareSetRecords(
  a: { weight: number; reps: number | null },
  b: { weight: number; reps: number | null }
): number {
  const wa = Math.round(a.weight * 100);
  const wb = Math.round(b.weight * 100);
  if (wa !== wb) return wa - wb;
  return (a.reps ?? 0) - (b.reps ?? 0);
}

export function matchesSetRecord(
  set: { weight: number | null; reps: number | null; set_type?: string | null },
  best: { weight: number | null; reps: number | null } | null | undefined
): boolean {
  if (best == null || best.weight == null || set.weight == null) return false;
  if (isWarmupSetType(set.set_type)) return false;
  return (
    compareSetRecords(
      { weight: set.weight, reps: set.reps },
      { weight: best.weight, reps: best.reps }
    ) === 0
  );
}

export function isPrSet(
  session: PresetSessionResponse,
  candidateSetId: string,
  completedSetIds: CompletedSetMap,
  prBaseline: Record<string, PrBaselineEntry | null>
): boolean {
  let candidate: ExerciseEntrySetResponse | undefined;
  // Null for a preserved entry whose exercise is gone; the `== null` guard
  // below then short-circuits, so a deleted exercise never earns a PR.
  let exerciseId: string | null | undefined;
  let modality: ExerciseModality = 'weight_reps';
  for (const exercise of session.exercises) {
    const found = exercise.sets.find((s) => String(s.id) === candidateSetId);
    if (found) {
      candidate = found;
      exerciseId = exercise.exercise_id;
      modality = resolveSnapshotModality(exercise.exercise_snapshot);
      break;
    }
  }
  if (!candidate || exerciseId == null) return false;
  const candidateWeight = prWeight(candidate.weight, modality);
  if (candidateWeight == null) return false;
  if (isWarmupSetType(candidate.set_type)) return false;

  if (!(exerciseId in prBaseline)) return false;
  const baseline = prBaseline[exerciseId];
  if (baseline == null) return false;

  const baselineWeight = prWeight(baseline.weight, modality);
  let best: { weight: number; reps: number | null } | null =
    baselineWeight != null
      ? { weight: baselineWeight, reps: baseline.reps }
      : null;

  for (const exercise of session.exercises) {
    if (exercise.exercise_id !== exerciseId) continue;
    for (const s of exercise.sets) {
      if (String(s.id) === candidateSetId) continue;
      const weight = prWeight(s.weight, modality);
      if (weight == null) continue;
      if (isWarmupSetType(s.set_type)) continue;
      if (completedSetIds[String(s.id)] == null) continue;
      const contender = { weight, reps: s.reps };
      if (best == null || compareSetRecords(contender, best) > 0)
        best = contender;
    }
  }

  if (best == null) return false;

  return (
    compareSetRecords({ weight: candidateWeight, reps: candidate.reps }, best) >
    0
  );
}

/**
 * The weight a set is ranked on for a PR. A bodyweight set with no weight is
 * body weight alone, so it ranks as +0 and a pure pull-up can still set a rep
 * PR; the ranking stays on the added weight, which at a steady body weight
 * orders sets the same way the total load does.
 */
function prWeight(
  weight: number | null,
  modality: ExerciseModality
): number | null {
  if (weight != null) return weight;
  return isBodyweightModality(modality) ? 0 : null;
}

export function seedPrFromSession(session: PresetSessionResponse): PrSetMap {
  const seeded: PrSetMap = {};
  for (const exercise of session.exercises) {
    for (const s of exercise.sets) {
      if (s.is_pr) seeded[String(s.id)] = true;
    }
  }
  return seeded;
}

export interface WorkoutCompletionExercise {
  entryId: string;
  name: string;
  notes: string | null;
  completedSetCount: number;
  totalSetCount: number;
  volumeKg: number;
  topSet: {
    weightKg: number | null;
    reps: number | null;
    durationSec?: number | null;
  } | null;
  hasPr: boolean;
}

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
  volumeKg: number;
  totalDistanceKm: number;
  averageRpe: number | null;
  prRows: WorkoutCompletionPrRow[];
  exercises: WorkoutCompletionExercise[];
}

export function buildWorkoutCompletionSummary(
  session: PresetSessionResponse,
  completedSetIds: CompletedSetMap,
  prSetIds: PrSetMap,
  t: TFunction,
  bodyWeightKg: number | null = null
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
    const name =
      exercise.exercise_snapshot?.name ??
      t('workout.exercise', { defaultValue: 'Exercise' });
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
        prRows.push({
          exerciseName: name,
          weightKg: set.weight,
          reps: set.reps,
        });
      }
      if (isWarmupSetType(set.set_type)) continue;
      exerciseVolumeKg += setVolumeKg(set, modality, bodyWeightKg);
      // Carry distances stay out of the workout's distance total: that tile
      // reads as running/cycling distance.
      if (set.distance != null && !isWeightDistanceModality(modality)) {
        totalDistanceKm += set.distance;
      }
      if (isDurationModality(modality)) {
        const seconds = effectiveSetDurationSec(set, modality);
        if (
          seconds != null &&
          (topDurationSec == null || seconds > topDurationSec)
        ) {
          topDurationSec = seconds;
        }
      }
      if (set.weight != null) {
        const contender = { weightKg: set.weight, reps: set.reps };
        if (
          topWeighted == null ||
          compareSetRecords(
            { weight: contender.weightKg, reps: contender.reps },
            { weight: topWeighted.weightKg, reps: topWeighted.reps }
          ) > 0
        ) {
          topWeighted = contender;
        }
      } else if (
        !isDurationModality(modality) &&
        set.reps != null &&
        (topRepsOnly == null || set.reps > topRepsOnly.reps)
      ) {
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

export function makeDefaultStartSet(
  setNumber: number,
  modality: ExerciseModality
): ExerciseEntrySetRequest {
  return {
    set_number: setNumber,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    distance: null,
    rest_time: isCardioModality(modality) ? 0 : getDefaultRestSec(),
    notes: null,
    rpe: null,
    completed_at: null,
  };
}

export function buildPresetStartExercisesPayload(
  preset: WorkoutPreset
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
              distance: isCardioModality(modality)
                ? (set.distance ?? null)
                : null,
              // Cardio takes no between-set rest.
              rest_time: isCardioModality(modality)
                ? 0
                : (set.rest_time ?? null),
              notes: set.notes ?? null,
              rpe: null,
              completed_at: null,
            })),
    };
  });
}

export function extractPlannedSetValues(
  exercises: PresetSessionExerciseRequest[]
): AssumedSetValues[][] {
  return exercises.map((exercise) =>
    (exercise.sets || []).map((set: any, i: number) => ({
      weight: set.weight ?? null,
      reps: set.reps ?? null,
      duration: set.duration ?? null,
      distance: set.distance ?? null,
    }))
  );
}

export function stripPlannedSetValues(
  exercises: PresetSessionExerciseRequest[]
): PresetSessionExerciseRequest[] {
  return exercises.map((exercise) => ({
    ...exercise,
    sets: (exercise.sets || []).map((set: any, setIndex: number) => ({
      ...set,
      weight: null,
      reps: null,
      duration: null,
      distance: null,
    })),
  }));
}

export function exerciseFromSnapshot(
  snapshot: EntryExerciseSnapshotResponse | null,
  exerciseId: string | null,
  t: TFunction
): Exercise {
  return {
    // Empty when the library exercise has been deleted and the entry is running
    // on its snapshot alone. ExerciseDetailScreen gates every library-backed
    // feature on `UUID_REGEX.test(item.id)`, so an empty id renders the page
    // from the snapshot and quietly drops the History tab and detail refetch.
    id: snapshot?.id ?? exerciseId ?? '',
    name: snapshot?.name ?? t('workout.exercise', { defaultValue: 'Exercise' }),
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

export function makeSparseExercise(
  params: {
    /** Empty/null when the library exercise has been deleted; see exerciseFromSnapshot. */
    id: string | null;
    name?: string | null;
    category?: string | null;
    modality?: string | null;
    images?: string[] | null;
  },
  t: TFunction
): Exercise {
  return {
    id: params.id ?? '',
    name: params.name ?? t('workout.exercise', { defaultValue: 'Exercise' }),
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

export function exerciseFromExternalItem(
  item: ExternalExerciseItem,
  t: TFunction
): Exercise {
  return {
    ...makeSparseExercise(
      {
        id: item.id,
        name: item.name,
        category: item.category,
        modality: item.modality ?? null,
        images: item.images,
      },
      t
    ),
    equipment: item.equipment ?? [],
    primary_muscles: item.primary_muscles ?? [],
    secondary_muscles: item.secondary_muscles ?? [],
    calories_per_hour: item.calories_per_hour ?? 0,
    source: item.source,
    force: item.force ?? null,
    level: item.level ?? null,
    mechanic: item.mechanic ?? null,
    instructions: Array.isArray(item.instructions)
      ? item.instructions
      : undefined,
    description: item.description,
  };
}

export function exerciseFromDraft(
  exercise: WorkoutDraftExercise,
  t: TFunction
): Exercise {
  if (exercise.snapshot) {
    return exerciseFromSnapshot(exercise.snapshot, exercise.exerciseId, t);
  }
  return makeSparseExercise(
    {
      id: exercise.exerciseId,
      name: exercise.exerciseName,
      category: exercise.exerciseCategory,
      modality: exercise.exerciseModality ?? null,
      images: exercise.images,
    },
    t
  );
}

export function buildSingleExerciseStartPayload(
  exercise: Pick<Exercise, 'id' | 'modality' | 'category'>
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

type ActivitySetPayload = NonNullable<
  CreateExerciseEntryPayload['sets']
>[number];

export interface CardioEffortValues {
  durationSec: number | null;
  distanceKm: number | null;
}

export function buildActivitySetsPayload(
  draftSets: readonly WorkoutDraftSet[],
  originals: ReadonlyMap<string, ExerciseEntrySetResponse>,
  weightUnit: 'kg' | 'lbs',
  modality: ExerciseModality,
  cardio?: CardioEffortValues,
  distanceUnit: 'km' | 'miles' = 'km'
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
    const w = parseSetWeight(set.weight, modality);
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
      ...(isDurationModality(modality) || isWeightDurationModality(modality)
        ? { duration: set.duration ?? null }
        : {}),
      ...(isWeightDistanceModality(modality)
        ? (() => {
            const distance = parseDecimalInput(set.distance ?? '');
            return {
              distance: isNaN(distance)
                ? null
                : setDistanceToKm(distance, distanceUnit, modality),
            };
          })()
        : {}),
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
  distanceUnit: 'km' | 'miles' = 'km'
): WorkoutPresetExercisePayload[] {
  // Preset exercises with zero sets are valid on the server and render as
  // "No sets" in the detail view. Do NOT filter them out – saving an unrelated
  // edit would silently delete the user's zero-set rows from the preset.
  //
  // An exercise with no library id IS dropped, though, and that is a different
  // case: workout_preset_exercises.exercise_id still cascades from the library
  // row, so a deleted exercise cannot live in a template at all. Keeping it
  // would mean writing a row the database immediately rejects.
  return exercises
    .filter(
      (exercise): exercise is WorkoutDraftExercise & { exerciseId: string } =>
        exercise.exerciseId != null
    )
    .map((exercise, index) => {
      const modality = resolveSnapshotModality({
        modality: exercise.exerciseModality,
        category: exercise.exerciseCategory,
      });
      return {
        exercise_id: exercise.exerciseId,
        image_url: exercise.images[0] ?? null,
        sort_order: index,
        superset_group: exercise.supersetGroup ?? null,
        progression_mode: exercise.progressionMode ?? 'rep_goal',
        rep_goal: exercise.repGoal ?? null,
        increment_type: exercise.incrementType ?? 'weight',
        increment_value: exercise.incrementValue ?? 5,
        equipment_brand: exercise.equipmentBrand ?? null,
        ramp_increment: exercise.rampIncrement ?? null,
        sets: exercise.sets.map((set, setIndex) => {
          const weight = parseSetWeight(set.weight, modality);
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
            duration: modalityStoresDuration(modality)
              ? (set.duration ?? null)
              : null,
            distance:
              modalityStoresDistance(modality) && !isNaN(distance)
                ? setDistanceToKm(distance, distanceUnit, modality)
                : null,
            rest_time: set.restTime ?? null,
            notes: set.notes ?? null,
          };
        }),
      };
    });
}

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
  progression_mode?: 'rep_goal' | 'fixed' | 'step_load' | 'manual' | null;
  rep_goal?: number | null;
  increment_type?: 'weight' | 'reps' | null;
  increment_value?: number | null;
  equipment_brand?: string | null;
  ramp_increment?: number | null;
  sets: CanonicalPresetSet[];
}

function canonicalDecimal(value: number | null): number | null {
  return value == null ? null : Number(value.toFixed(3));
}

/**
 * A value the ramp or progression put into a set's placeholder, and what the
 * set would have shown without them (the preset's own value when it has one).
 */
interface AutoAppliedSetValues {
  weight: number | null;
  reps: number | null;
  presetWeight: number | null;
  presetReps: number | null;
}

// Server weights are numeric(10,2), so an adopted 83.9146 kg reads back as
// 83.91; anything within that rounding is the same value.
function sameLoggedValue(logged: number | null, auto: number | null): boolean {
  return logged != null && auto != null && Math.abs(logged - auto) < 0.01;
}

/**
 * Per set of one exercise: the ramp/progression-applied placeholder values,
 * found by resolving with and without them. Undefined where they changed
 * nothing.
 */
function autoAppliedSetValues(
  exercise: Pick<WorkoutCardExercise, 'id' | 'sets'> & {
    exercise_id: string | null;
  },
  sources: AssumedValueSources
): (AutoAppliedSetValues | undefined)[] {
  const previous = historyForExercise(
    sources.previousSessionSets,
    exercise.exercise_id
  );
  const adjusted = resolveLiveAssumedSetValues(exercise, previous, sources);
  const base = resolveAssumedSetValues(
    exercise.sets,
    previous,
    sources.plannedSetValues
  );
  return exercise.sets.map((set, i) => {
    const weight =
      adjusted[i].weight !== base[i].weight ? adjusted[i].weight : null;
    const reps = adjusted[i].reps !== base[i].reps ? adjusted[i].reps : null;
    if (weight == null && reps == null) return undefined;
    const planned = sources.plannedSetValues[String(set.id)];
    return {
      weight,
      reps,
      presetWeight: planned?.weight ?? base[i].weight,
      presetReps: planned?.reps ?? base[i].reps,
    };
  });
}

function canonicalizeSessionSet(
  set: ExerciseEntrySetResponse,
  setNumber: number,
  modality: ExerciseModality,
  completed: boolean,
  plannedValues: AssumedSetValues | undefined,
  autoApplied?: AutoAppliedSetValues
): CanonicalPresetSet {
  const planned = completed ? undefined : plannedValues;
  // Logged exactly as the ramp or progression pre-filled it: not a change
  // the lifter made, so it neither triggers the prompt nor overwrites the
  // preset's stored value.
  const weight =
    autoApplied != null && sameLoggedValue(set.weight, autoApplied.weight)
      ? autoApplied.presetWeight
      : (set.weight ?? planned?.weight ?? null);
  const reps =
    autoApplied != null && sameLoggedValue(set.reps, autoApplied.reps)
      ? autoApplied.presetReps
      : (set.reps ?? planned?.reps ?? null);
  return {
    set_number: setNumber,
    set_type: set.set_type ?? 'normal',
    reps,
    weight: canonicalDecimal(weight),
    duration: modalityStoresDuration(modality)
      ? (set.duration ?? planned?.duration ?? null)
      : null,
    distance: modalityStoresDistance(modality)
      ? canonicalDecimal(set.distance ?? planned?.distance ?? null)
      : null,
    rest_time: isCardioModality(modality) ? 0 : (set.rest_time ?? null),
    notes: set.notes ?? null,
  };
}

function canonicalizePresetSet(
  set: WorkoutPresetSet,
  setNumber: number,
  modality: ExerciseModality
): CanonicalPresetSet {
  return {
    set_number: setNumber,
    set_type: set.set_type ?? 'normal',
    reps: set.reps ?? null,
    weight: canonicalDecimal(set.weight ?? null),
    duration: modalityStoresDuration(modality) ? (set.duration ?? null) : null,
    distance: modalityStoresDistance(modality)
      ? canonicalDecimal(set.distance ?? null)
      : null,
    rest_time: isCardioModality(modality) ? 0 : (set.rest_time ?? null),
    notes: set.notes ?? null,
  };
}

function canonicalSetsEqual(
  a: CanonicalPresetSet,
  b: CanonicalPresetSet
): boolean {
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
  b: CanonicalPresetExercise
): boolean {
  return (
    a.exercise_id === b.exercise_id &&
    a.image_url === b.image_url &&
    a.superset_group === b.superset_group &&
    a.progression_mode === b.progression_mode &&
    a.rep_goal === b.rep_goal &&
    a.increment_type === b.increment_type &&
    a.increment_value === b.increment_value &&
    a.equipment_brand === b.equipment_brand &&
    a.ramp_increment === b.ramp_increment &&
    a.sets.length === b.sets.length &&
    a.sets.every((set, i) => canonicalSetsEqual(set, b.sets[i]))
  );
}

/** Same exercises in the same order, with the same number and kind of sets:
 * what changes when the lifter adds, drops or reorders work, as opposed to
 * just loading a different weight or reps. */
function canonicalExerciseStructureEqual(
  a: CanonicalPresetExercise,
  b: CanonicalPresetExercise
): boolean {
  return (
    a.exercise_id === b.exercise_id &&
    a.superset_group === b.superset_group &&
    a.sets.length === b.sets.length &&
    a.sets.every((set, i) => set.set_type === b.sets[i]?.set_type)
  );
}

export function buildPresetUpdateExercises(
  session: PresetSessionResponse,
  preset: WorkoutPreset,
  opts: {
    completedSetIds: CompletedSetMap;
    plannedSetValues: Record<string, AssumedSetValues>;
    /**
     * The live placeholder inputs, so values the ramp or progression filled
     * in can be told apart from the lifter's own changes. Omitted: every
     * difference from the preset counts.
     */
    assumeSources?: Omit<AssumedValueSources, 'plannedSetValues'>;
    /**
     * Only a change in structure counts as different (exercises, order,
     * supersets, set count and types). Weights, reps and the like do not,
     * so a lifter who just loaded more weight is not asked about it.
     */
    structureOnly?: boolean;
  }
): WorkoutPresetExercisePayload[] | null {
  // An exercise whose library row has been deleted cannot go into a preset at
  // all — workout_preset_exercises.exercise_id still cascades from the library,
  // so the row would be rejected. Drop those up front rather than letting a
  // null reach the pairing below, where it would also match every OTHER
  // deleted exercise and pair them with each other. Every index in this
  // function is relative to this filtered list, so it has to happen first.
  const sessionExercises = session.exercises.filter(
    (
      exercise
    ): exercise is (typeof session.exercises)[number] & {
      exercise_id: string;
    } => exercise.exercise_id != null
  );

  // Pair each session exercise with the first unconsumed preset exercise of
  // the same exercise_id (duplicates pair in order; unmatched = added). The
  // pair supplies the preset's image_url, the zero-set detection, and the
  // preset side's modality — the session snapshot beats the preset row,
  // which old servers leave without a modality.
  const consumed = new Set<number>();
  const matchedPresetIndex = sessionExercises.map((exercise) => {
    const index = preset.exercises.findIndex(
      (candidate, i) =>
        !consumed.has(i) && candidate.exercise_id === exercise.exercise_id
    );
    if (index >= 0) consumed.add(index);
    return index >= 0 ? index : null;
  });

  const fromSession: CanonicalPresetExercise[] = sessionExercises.map(
    (exercise, index) => {
      const modality = resolveSnapshotModality(exercise.exercise_snapshot);
      const matchedIdx = matchedPresetIndex[index];
      const matched = matchedIdx == null ? null : preset.exercises[matchedIdx];
      const rawMatched = matched as Partial<CanonicalPresetExercise> | null;
      const autoApplied =
        opts.assumeSources == null
          ? undefined
          : autoAppliedSetValues(exercise, {
              ...opts.assumeSources,
              plannedSetValues: opts.plannedSetValues,
            });
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
        // Carry over existing preset progression rules if they exist
        ...(rawMatched?.progression_mode
          ? { progression_mode: rawMatched.progression_mode }
          : {}),
        ...(rawMatched?.rep_goal != null
          ? { rep_goal: rawMatched.rep_goal }
          : {}),
        ...(rawMatched?.increment_type
          ? { increment_type: rawMatched.increment_type }
          : {}),
        ...(rawMatched?.increment_value != null
          ? { increment_value: Number(rawMatched.increment_value) }
          : {}),
        ...(rawMatched?.equipment_brand
          ? { equipment_brand: rawMatched.equipment_brand }
          : {}),
        ...(rawMatched?.ramp_increment != null
          ? { ramp_increment: Number(rawMatched.ramp_increment) }
          : {}),
        sets: untouchedFabricatedSet
          ? []
          : exercise.sets.map((set, setIndex) =>
              canonicalizeSessionSet(
                set,
                setIndex + 1,
                modality,
                opts.completedSetIds[String(set.id)] != null,
                opts.plannedSetValues[String(set.id)],
                autoApplied?.[setIndex]
              )
            ),
      };
    }
  );

  const sessionModalityByPresetIndex = new Map<number, ExerciseModality>();
  matchedPresetIndex.forEach((presetIdx, sessionIdx) => {
    if (presetIdx != null) {
      sessionModalityByPresetIndex.set(
        presetIdx,
        resolveSnapshotModality(sessionExercises[sessionIdx].exercise_snapshot)
      );
    }
  });

  const fromPreset: CanonicalPresetExercise[] = preset.exercises.map(
    (exercise, index) => {
      const rawExercise = exercise as Partial<CanonicalPresetExercise>;
      const modality =
        sessionModalityByPresetIndex.get(index) ??
        resolveSnapshotModality(exercise);

      return {
        exercise_id: exercise.exercise_id,
        image_url: exercise.image_url ?? null,
        sort_order: index,
        superset_group: exercise.superset_group ?? null,
        ...(rawExercise.progression_mode
          ? { progression_mode: rawExercise.progression_mode }
          : {}),
        ...(rawExercise.rep_goal != null
          ? { rep_goal: rawExercise.rep_goal }
          : {}),
        ...(rawExercise.increment_type
          ? { increment_type: rawExercise.increment_type }
          : {}),
        ...(rawExercise.increment_value != null
          ? { increment_value: Number(rawExercise.increment_value) }
          : {}),
        ...(rawExercise.equipment_brand
          ? { equipment_brand: rawExercise.equipment_brand }
          : {}),
        ...(rawExercise.ramp_increment != null
          ? { ramp_increment: Number(rawExercise.ramp_increment) }
          : {}),
        sets: exercise.sets.map((set, setIndex) =>
          canonicalizePresetSet(set, setIndex + 1, modality)
        ),
      };
    }
  );

  const equivalent =
    fromSession.length === fromPreset.length &&
    fromSession.every((exercise, i) =>
      opts.structureOnly
        ? canonicalExerciseStructureEqual(exercise, fromPreset[i])
        : canonicalExercisesEqual(exercise, fromPreset[i])
    );
  return equivalent ? null : fromSession;
}

/** The heart-rate figures a workout can show, or null when it carries none. */
export interface WorkoutHeartRateSummary {
  avgBpm: number;
  maxBpm: number | null;
}

/**
 * Average and peak heart rate across a session's exercises.
 *
 * The average is duration-weighted, so a long cardio block is not pulled down
 * by a short warmup that happened to average lower. Zero-duration entries are
 * legal and would contribute nothing to a weighted mean, so the weighting only
 * applies when every contributing exercise has a positive duration; otherwise
 * it falls back to a plain mean of the per-exercise averages.
 *
 * Shared by the workout detail screen and the completion summary. Heart rate
 * only ever arrives from a paired watch or a synced workout — there is no
 * field for typing one — so both read it from the saved session.
 */
export function summarizeWorkoutHeartRate(
  exercises: readonly {
    avg_heart_rate?: number | null;
    max_heart_rate?: number | null;
    duration_minutes?: number | string | null;
  }[]
): WorkoutHeartRateSummary | null {
  const withHr = exercises.filter(
    (exercise) => exercise.avg_heart_rate != null && exercise.avg_heart_rate > 0
  );
  if (withHr.length === 0) return null;

  const durations = withHr.map(
    (exercise) => Number(exercise.duration_minutes) || 0
  );
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  const canWeightByDuration = durations.every((value) => value > 0);
  const avgBpm = canWeightByDuration
    ? withHr.reduce(
        (sum, exercise, index) =>
          sum + (exercise.avg_heart_rate as number) * durations[index],
        0
      ) / totalDuration
    : withHr.reduce(
        (sum, exercise) => sum + (exercise.avg_heart_rate as number),
        0
      ) / withHr.length;

  const maxValues = exercises
    .map((exercise) => exercise.max_heart_rate)
    .filter((value): value is number => value != null && value > 0);

  return {
    avgBpm,
    maxBpm: maxValues.length > 0 ? Math.max(...maxValues) : null,
  };
}
