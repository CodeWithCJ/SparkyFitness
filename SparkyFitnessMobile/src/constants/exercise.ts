import type { Exercise } from '../types/exercise';

export const DISTANCE_EXERCISE_NAMES = [
  'Running', 'Cycling', 'Swimming', 'Walking', 'Hiking',
] as const;

const ACTIVITY_EXERCISE_CATEGORIES = new Set([
  'cardio',
  'running',
  'cycling',
  'swimming',
  'walking',
  'hiking',
]);

const WORKOUT_EXERCISE_CATEGORIES = new Set([
  'strength',
  'traditional strength training',
  'functional strength training',
]);

export type ExerciseEntryTarget = 'workout' | 'activity';

export function isDistanceExercise(exerciseName: string | null): boolean {
  if (!exerciseName) return false;
  return DISTANCE_EXERCISE_NAMES.some(name => exerciseName.startsWith(name));
}

export function resolveExerciseEntryTarget(
  exercise: Pick<Exercise, 'name' | 'category'>,
  fallback: ExerciseEntryTarget = 'activity',
): ExerciseEntryTarget {
  const normalizedCategory = exercise.category?.trim().toLowerCase();

  if (normalizedCategory && WORKOUT_EXERCISE_CATEGORIES.has(normalizedCategory)) {
    return 'workout';
  }

  if (normalizedCategory && ACTIVITY_EXERCISE_CATEGORIES.has(normalizedCategory)) {
    return 'activity';
  }

  if (isDistanceExercise(exercise.name)) {
    return 'activity';
  }

  return fallback;
}
