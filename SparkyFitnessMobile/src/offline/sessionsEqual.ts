import type {
  PresetSessionExerciseRequest,
  PresetSessionResponse,
} from '@workspace/shared';

const sameNumber = (
  a: number | string | null | undefined,
  b: number | string | null | undefined
): boolean => {
  const left = a == null || a === '' ? null : Number(a);
  const right = b == null || b === '' ? null : Number(b);
  if (left === null || right === null) return left === right;
  // Weights are stored to two decimals; ignore what rounding changes.
  return Math.abs(left - right) < 0.005;
};

const sameInstant = (
  a: string | null | undefined,
  b: string | null | undefined
): boolean => {
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  return new Date(a).getTime() === new Date(b).getTime();
};

/**
 * True when the server's copy of a workout holds exactly the exercises and
 * sets this phone sent: same exercises in the same order, same sets, same
 * logged values and completion times.
 *
 * Used when a save is refused because the workout "changed elsewhere". A
 * save can reach the server while its answer is lost; the workout then looks
 * changed although the change is this phone's own. If the server copy equals
 * what was sent, nothing was changed by anyone else and no one needs asking.
 */
export function serverSessionMatchesSent(
  server: PresetSessionResponse,
  sent: readonly PresetSessionExerciseRequest[]
): boolean {
  if (server.exercises.length !== sent.length) return false;
  return sent.every((sentExercise, exerciseIndex) => {
    const stored = server.exercises[exerciseIndex]!;
    if (sentExercise.id != null && stored.id !== sentExercise.id) return false;
    if ((stored.exercise_id ?? null) !== (sentExercise.exercise_id ?? null)) {
      return false;
    }
    const sentSets = sentExercise.sets ?? [];
    if (stored.sets.length !== sentSets.length) return false;
    return sentSets.every((sentSet, setIndex) => {
      const storedSet = stored.sets[setIndex]!;
      return (
        sameNumber(storedSet.reps, sentSet.reps) &&
        sameNumber(storedSet.weight, sentSet.weight) &&
        sameNumber(storedSet.duration, sentSet.duration) &&
        sameNumber(storedSet.distance, sentSet.distance) &&
        sameInstant(storedSet.completed_at, sentSet.completed_at) &&
        (storedSet.set_type ?? null) === (sentSet.set_type ?? null)
      );
    });
  });
}
