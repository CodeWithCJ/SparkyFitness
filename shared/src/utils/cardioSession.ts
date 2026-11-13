import type { ExerciseActivityQueryItem } from '../schemas/api/ExerciseStats.api.zod.ts';

export type CardioHeadlineKind = 'distance' | 'calories' | 'duration';

/**
 * The one number a cardio session row leads with: distance when the session
 * has one, else calories, else minutes. `distance` is already in the unit
 * system the list was queried with.
 */
export function cardioSessionHeadline(
  item: Pick<
    ExerciseActivityQueryItem,
    'distanceFormatted' | 'caloriesBurned' | 'durationMinutes'
  >
): { kind: CardioHeadlineKind; value: number } {
  if (item.distanceFormatted != null && item.distanceFormatted > 0) {
    return { kind: 'distance', value: item.distanceFormatted };
  }
  if (item.caloriesBurned > 0) {
    return { kind: 'calories', value: Math.round(item.caloriesBurned) };
  }
  return { kind: 'duration', value: Math.round(item.durationMinutes) };
}
