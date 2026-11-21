/**
 * Names of the cached document collections. One place, so the code that
 * fills a collection and the code that reads it cannot drift apart.
 */
export const CACHE_COLLECTIONS = {
  /** Saved workouts, keyed by preset id. */
  workoutPreset: 'workout_preset',
  /** The exercise library, keyed by exercise id. */
  exercise: 'exercise',
  /** The workout plans active on a day, keyed by YYYY-MM-DD. */
  planDay: 'plan_day',
  /** A day's workouts as the diary last loaded them, keyed by YYYY-MM-DD. */
  diaryDay: 'diary_day',
  /** Recent and most-used exercises, keyed by the requested count. */
  suggestedExercises: 'suggested_exercises',
  /** Best / last / recent sets, keyed by `exerciseStatsCacheKey`. */
  exerciseStats: 'exercise_stats',
  /** Single documents: the account's preferences, plate inventory. */
  preferences: 'preferences',
  plateInventory: 'plate_inventory',
  profile: 'profile',
  /** The person's foods, keyed by food id, searched by "brand name". */
  food: 'food',
  /** Every serving of a food, keyed by food id. */
  foodVariants: 'food_variants',
  /** The recent and most-used foods lists (one document). */
  foodRecents: 'food_recents',
  /** The person's meal types (one document). */
  mealTypes: 'meal_types',
  /** Markers the offline pack writes about itself. */
  pack: 'pack',
} as const;

/** Key of a collection that holds exactly one document. */
export const SINGLE_DOCUMENT_KEY = 'current';

/** Marker written when a full offline pack refresh has finished. */
export const PACK_COMPLETED_KEY = 'completed';

/**
 * Last-time values are scoped by the saved workout they were done in, so the
 * same exercise is cached once per saved workout and once on its own.
 */
export function exerciseStatsCacheKey(
  exerciseId: string,
  presetId: number | null | undefined
): string {
  return `${exerciseId}|${presetId ?? '-'}`;
}
