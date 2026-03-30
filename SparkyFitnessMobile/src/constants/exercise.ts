export const DISTANCE_EXERCISE_NAMES = [
  'Running', 'Cycling', 'Swimming', 'Walking', 'Hiking',
] as const;

export function isDistanceExercise(exerciseName: string | null): boolean {
  if (!exerciseName) return false;
  return DISTANCE_EXERCISE_NAMES.some(name => exerciseName.startsWith(name));
}
