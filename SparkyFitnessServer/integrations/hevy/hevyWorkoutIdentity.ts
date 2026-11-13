import type { HevyExercise } from './hevyTypes.js';

export interface StoredHevyExerciseIdentity {
  id: string;
  exercise_id: string | null;
  source_id: string | null;
  template_id: string | null;
  exercise_title: string | null;
  provider_exercise: HevyExercise | null;
}

interface IncomingHevyExerciseIdentity {
  exercise_id: string;
  source_id: string;
  exercise: HevyExercise;
}

// Provider indexes describe order. Local set edits are deliberately absent:
// compare the previous provider snapshot, never the person's corrected sets.
function providerSignature(exercise: HevyExercise | null): string | null {
  if (!exercise) return null;
  return JSON.stringify([
    exercise.title,
    exercise.notes ?? null,
    exercise.superset_id ?? null,
    (exercise.sets ?? []).map((set) => [
      set.type,
      set.weight_kg,
      set.reps,
      set.distance_meters,
      set.duration_seconds,
      set.rpe,
      set.custom_metric ?? null,
    ]),
  ]);
}

/** Reserve distinguishable occurrences before considering their generated IDs. */
export function matchHevyWorkoutEntries<T extends StoredHevyExerciseIdentity>(
  incoming: readonly IncomingHevyExerciseIdentity[],
  previous: readonly T[]
): (T | undefined)[] {
  const matches: (T | undefined)[] = incoming.map(() => undefined);
  const unmatched = new Set(previous);
  const compatible = (item: IncomingHevyExerciseIdentity, row: T) => {
    const templateId = item.exercise.exercise_template_id;
    if (templateId && row.template_id) return templateId === row.template_id;
    if (item.exercise_id === row.exercise_id) return true;
    return (
      row.exercise_id === null && item.exercise.title === row.exercise_title
    );
  };
  const signatures = incoming.map((item) => providerSignature(item.exercise));
  const previousSignatures = new Map(
    previous.map((row) => [row, providerSignature(row.provider_exercise)])
  );
  const assign = (index: number, row: T) => {
    matches[index] = row;
    unmatched.delete(row);
  };
  for (const [index, item] of incoming.entries()) {
    const candidates = [...unmatched].filter(
      (row) =>
        compatible(item, row) &&
        previousSignatures.get(row) === signatures[index]
    );
    if (candidates.length !== 1) continue;
    const row = candidates[0]!;
    const competing = incoming.filter(
      (other, otherIndex) =>
        !matches[otherIndex] &&
        compatible(other, row) &&
        signatures[otherIndex] === signatures[index]
    );
    if (competing.length === 1) assign(index, row);
  }
  // A partial cross-match can be an edit, not a reorder: 8/12 reps becoming
  // 12/15 must not move the second occurrence's corrections onto the first.
  // Complete matches still identify reorders, removals and new occurrences.
  for (const [index, item] of incoming.entries()) {
    const row = matches[index];
    if (!row) continue;
    const previousGroup = previous.filter((other) => compatible(item, other));
    const incomingIndexes = incoming.flatMap((other, otherIndex) =>
      compatible(other, row) ? [otherIndex] : []
    );
    if (
      previousGroup.indexOf(row) !== incomingIndexes.indexOf(index) &&
      previousGroup.some((other) => unmatched.has(other)) &&
      incomingIndexes.some((otherIndex) => !matches[otherIndex])
    ) {
      throw new Error(
        'Ambiguous Hevy exercise identities; existing workout retained.'
      );
    }
  }
  // An ordinal is insufficient when an indistinguishable occurrence vanished,
  // or an old replay lost the IDs of different templates sharing one title.
  // Roll back this workout rather than transferring or deleting corrections.
  for (const [index, item] of incoming.entries()) {
    if (matches[index]) continue;
    const candidates = [...unmatched].filter((row) => compatible(item, row));
    if (candidates.length < 2) continue;
    const competing = incoming.filter(
      (other, otherIndex) =>
        !matches[otherIndex] && candidates.some((row) => compatible(other, row))
    );
    const knownTemplates = new Set(
      candidates.flatMap((row) => (row.template_id ? [row.template_id] : []))
    );
    if (
      competing.length < candidates.length ||
      (!item.exercise.exercise_template_id && knownTemplates.size > 1)
    ) {
      throw new Error(
        'Ambiguous Hevy exercise identities; existing workout retained.'
      );
    }
  }
  for (const [index, item] of incoming.entries()) {
    if (matches[index]) continue;
    const row = [...unmatched].find(
      (candidate) =>
        candidate.source_id === item.source_id && compatible(item, candidate)
    );
    if (row) assign(index, row);
  }
  for (const [index, item] of incoming.entries()) {
    if (matches[index]) continue;
    const row = [...unmatched].find((candidate) => compatible(item, candidate));
    if (row) assign(index, row);
  }
  return matches;
}
