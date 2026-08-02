/**
 * Exercise modality selects which per-set editor clients render
 * (issue #1903 stage 2):
 * - weight_reps: weight + reps inputs (default strength table)
 * - reps_only: reps input, no weight column
 * - duration: single duration-in-seconds input
 * - duration_distance: cardio backed by a single set carrying duration
 *   (seconds) + distance (km); clients render a duration+distance form for
 *   entries with at most one set and fall back to a duration-style set
 *   table for multi-set entries
 */
export const EXERCISE_MODALITIES = [
  "weight_reps",
  "reps_only",
  "duration",
  "duration_distance",
] as const;

export type ExerciseModality = (typeof EXERCISE_MODALITIES)[number];

export function isExerciseModality(value: unknown): value is ExerciseModality {
  return (
    typeof value === "string" &&
    (EXERCISE_MODALITIES as readonly string[]).includes(value)
  );
}

/**
 * Cardio: sets carry duration + distance and clients prefer the
 * duration+distance form over a set table. Distinct from duration-LIKE
 * (holds are duration-like but never cardio).
 */
export function isCardioModality(modality: ExerciseModality): boolean {
  return modality === "duration_distance";
}

/**
 * Derive a modality from an exercise category. The rules must stay in sync
 * with the backfill CASE in the `*_set_duration_seconds_modality_distance.sql`
 * migration.
 */
export function deriveExerciseModality(
  category: string | null | undefined,
): ExerciseModality {
  const normalized = category?.trim().toLowerCase();
  if (normalized === "cardio") return "duration_distance";
  if (normalized === "isometric" || normalized === "isometrics")
    return "duration";
  return "weight_reps";
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
): ExerciseModality {
  return isExerciseModality(modality)
    ? modality
    : deriveExerciseModality(category);
}

// Workout sources that support nested exercise editing after creation.
const EDITABLE_SOURCES = new Set(["manual", "sparky", "workout plan"]);

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
  source: string | null | undefined,
): boolean {
  const normalized = normalizeSource(source);
  if (normalized == null) {
    return true;
  }
  return EDITABLE_SOURCES.has(normalized);
}
