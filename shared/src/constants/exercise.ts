import { isIgnoredEquipment, normalizeEquipment } from './exerciseTaxonomy.ts';

/**
 * Exercise modality selects which per-set editor clients render
 * (issue #1903 stage 2):
 * - weight_reps: weight + reps inputs (default strength table)
 * - reps_only: reps input, no weight column
 * - bodyweight_reps: reps plus a signed weight for bodyweight movements —
 *   positive is load added (+20 kg on a dip belt), negative is assistance
 *   (−15 kg from a band or machine). Volume and estimated 1RM count the
 *   lifter's body weight plus that value (see `effectiveLoadKg`).
 * - weight_duration: weight plus a duration in seconds, for loaded holds
 *   (weighted plank, wall sit with a plate)
 * - weight_distance: weight plus a distance, for carries and sled work
 *   (farmer's walk, yoke, sandbag, sled push). The distance is stored in km
 *   like every other set distance; clients show metres or yards
 * - duration: single duration-in-seconds input
 * - duration_distance: cardio backed by a single set carrying duration
 *   (seconds) + distance (km); clients render a duration+distance form for
 *   entries with at most one set and fall back to a duration-style set
 *   table for multi-set entries
 */
export const EXERCISE_MODALITIES = [
  'weight_reps',
  'reps_only',
  'bodyweight_reps',
  'weight_duration',
  'weight_distance',
  'duration',
  'duration_distance',
] as const;

export type ExerciseModality = (typeof EXERCISE_MODALITIES)[number];

export function isExerciseModality(value: unknown): value is ExerciseModality {
  return (
    typeof value === 'string' &&
    (EXERCISE_MODALITIES as readonly string[]).includes(value)
  );
}

/**
 * Cardio: sets carry duration + distance and clients prefer the
 * duration+distance form over a set table. Distinct from duration-LIKE
 * (holds are duration-like but never cardio).
 */
export function isCardioModality(modality: ExerciseModality): boolean {
  return modality === 'duration_distance';
}

/** Loaded holds: a weight and a duration per set, no reps. */
export function isWeightDurationModality(modality: ExerciseModality): boolean {
  return modality === 'weight_duration';
}

/** Carries and sled work: a weight and a distance per set, no reps. */
export function isWeightDistanceModality(modality: ExerciseModality): boolean {
  return modality === 'weight_distance';
}

/**
 * Whether a set of this modality records reps. The two loaded-effort types
 * replace reps with a duration or a distance, so a rep count is not entered,
 * summed or used for volume and estimated 1RM on them.
 */
export function modalityRecordsReps(modality: ExerciseModality): boolean {
  return (
    modality === 'weight_reps' ||
    modality === 'reps_only' ||
    modality === 'bodyweight_reps'
  );
}

/** Whether sets of this modality carry a signed added/assisting weight. */
export function isBodyweightModality(modality: ExerciseModality): boolean {
  return modality === 'bodyweight_reps';
}

/**
 * Derive a modality from an exercise category and, when known, its equipment.
 * The category rules must stay in sync with the backfill CASE in the
 * `*_set_duration_seconds_modality_distance.sql` migration; the equipment
 * rule only applies to exercises created or imported after it.
 *
 * Equipment that is recorded and is bodyweight alone (pull-up bar, dip
 * station, "body only") gives `bodyweight_reps`. Blank equipment does not:
 * too many custom and cardio exercises leave it empty for that to mean
 * anything. An unrecognised name is not blank, so it keeps the exercise on
 * ordinary weight. A bench is an ignored accessory and does not.
 */
export function deriveExerciseModality(
  category: string | null | undefined,
  equipment?: readonly (string | null | undefined)[] | string | null
): ExerciseModality {
  const normalized = category?.trim().toLowerCase();
  if (normalized === 'cardio') return 'duration_distance';
  if (normalized === 'isometric' || normalized === 'isometrics')
    return 'duration';
  if (isBodyweightOnlyEquipment(equipment)) return 'bodyweight_reps';
  return 'weight_reps';
}

function isBodyweightOnlyEquipment(
  equipment: readonly (string | null | undefined)[] | string | null | undefined
): boolean {
  const values =
    typeof equipment === 'string' ? [equipment] : (equipment ?? []);
  const present = values.filter(
    (value): value is string =>
      value != null && value.trim() !== '' && !isIgnoredEquipment(value)
  );
  // An unknown name is not "no equipment". Dropping it would leave "body
  // only" and mark a loaded custom attachment as bodyweight.
  return (
    present.length > 0 &&
    present.every((value) => normalizeEquipment(value) === 'body only')
  );
}

/**
 * Explicit modality when valid, else derived from category. The first arg is
 * a plain string so unknown values (old servers, third-party callers) funnel
 * through the guard; the server create path uses this as its sanitize+derive
 * and clients use it as their old-server fallback.
 */
export function resolveExerciseModality(
  modality: string | null | undefined,
  category: string | null | undefined,
  equipment?: readonly (string | null | undefined)[] | string | null
): ExerciseModality {
  return isExerciseModality(modality)
    ? modality
    : deriveExerciseModality(category, equipment);
}

// Workout sources that support nested exercise editing after creation.
const EDITABLE_SOURCES = new Set(['manual', 'sparky', 'workout plan']);

function normalizeSource(source: string | null | undefined): string | null {
  if (source == null) return null;
  return source.trim().toLowerCase();
}

/**
 * Whether a workout source supports nested exercise editing.
 *
 * Returns true for `manual`, `sparky`, `workout plan`, and `null`/`undefined`
 * (legacy local records). Returns false for external sync sources (HealthKit,
 * Garmin, Strava, etc.).
 */
export function canEditGroupedWorkout(
  source: string | null | undefined
): boolean {
  const normalized = normalizeSource(source);
  if (normalized == null) {
    return true;
  }
  return EDITABLE_SOURCES.has(normalized);
}

// --- Workout session lifecycle status (#1995 phase 1) ---

export const WORKOUT_SESSION_STATUSES = [
  'planned',
  'in_progress',
  'partial',
  'completed',
] as const;

export type WorkoutSessionStatus = (typeof WORKOUT_SESSION_STATUSES)[number];

export function isWorkoutSessionStatus(
  value: unknown
): value is WorkoutSessionStatus {
  return (
    typeof value === 'string' &&
    (WORKOUT_SESSION_STATUSES as readonly string[]).includes(value)
  );
}

/** Source stamped on diary rows a prefill workout plan generates. */
export const WORKOUT_PLAN_ENTRY_SOURCE = 'Workout Plan';

/** Whether the session was generated by a scheduled workout plan. */
export function isWorkoutPlanGeneratedSource(
  source: string | null | undefined
): boolean {
  return normalizeSource(source) === 'workout plan';
}

/** Whether the session is a live workout started from the mobile app. */
export function isLiveWorkoutSource(
  source: string | null | undefined
): boolean {
  return normalizeSource(source) === 'sparky';
}

/**
 * Minimal per-set completion shape the status derivation needs, so callers can
 * feed preset-session children, diary rows or live snapshots alike.
 */
export interface WorkoutSessionStatusSet {
  completed_at?: string | null;
}

export interface WorkoutSessionStatusInput {
  /** The session's stored source, verbatim ('Workout Plan', 'sparky', ...). */
  source: string | null | undefined;
  /** exercise_preset_entries.finished_at; NULL while planned or in progress. */
  finishedAt: string | Date | null | undefined;
  /** Whether any child exercise is linked to a workout plan assignment. */
  hasPlanAssignment: boolean;
  /** Every set across the session, in any order. */
  sets: readonly WorkoutSessionStatusSet[];
}

/**
 * Derives a grouped workout session's lifecycle status from persisted data.
 *
 * The status is never stored; the server derives it per request from the same
 * rows that define it, and clients can reuse this helper as an old-server
 * fallback (see #1995):
 * - finished + every set checked off -> completed
 * - finished + at least one set missing -> partial
 * - unfinished + at least one checked-off set -> in_progress
 * - plan-generated or plan-linked, untouched -> planned
 * - live-started (source 'sparky'), untouched -> in_progress
 * - everything else (form logs, imports, provider syncs) -> completed; those
 *   rows are done by definition and mostly predate per-set completed_at
 */
export function deriveWorkoutSessionStatus(
  input: WorkoutSessionStatusInput
): WorkoutSessionStatus {
  const { source, finishedAt, hasPlanAssignment, sets } = input;
  const completedSets = sets.filter((set) => set.completed_at != null).length;
  if (finishedAt != null) {
    return completedSets === sets.length && sets.length > 0
      ? 'completed'
      : 'partial';
  }
  if (completedSets > 0) {
    return 'in_progress';
  }
  if (isWorkoutPlanGeneratedSource(source) || hasPlanAssignment) {
    return 'planned';
  }
  if (isLiveWorkoutSource(source)) {
    return 'in_progress';
  }
  return 'completed';
}
