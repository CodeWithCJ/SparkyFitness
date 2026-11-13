import { isWarmupSetType } from './dropSetCalculator.ts';

export interface MuscleSet {
  set_type?: string | null;
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
}

export interface MuscleEntry {
  entry_date?: string;
  exercise_name?: string;
  exercises?: { primary_muscles?: unknown } | null;
  exercise_primary_muscles?: unknown;
  sets?: MuscleSet[] | null;
}

function canonicalMuscleName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function asMuscleNames(values: unknown[]): string[] {
  const names = values
    .filter((value): value is string => typeof value === 'string')
    .map(canonicalMuscleName)
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function workingSetCount(sets: MuscleSet[] | null | undefined): number {
  if (!Array.isArray(sets) || sets.length === 0) return 0;
  return sets.filter(
    (set) =>
      !isWarmupSetType(set.set_type) &&
      ((Number(set.reps) || 0) > 0 || (Number(set.duration) || 0) > 0)
  ).length;
}

/**
 * Reads primary muscles from either the nested getReportsData shape
 * (already-parsed array, or a leftover JSON string) or the flat
 * getExerciseEntries column `exercise_primary_muscles`.
 */
export function primaryMusclesOf(entry: MuscleEntry): string[] {
  const nested = entry.exercises?.primary_muscles;
  if (nested !== undefined && nested !== null) {
    return asMuscleNames(parseJsonArray(nested));
  }
  return asMuscleNames(parseJsonArray(entry.exercise_primary_muscles));
}

export function calculateMuscleGroupRecovery(
  exerciseEntries: MuscleEntry[]
): Record<string, string> {
  const recoveryData: Record<string, string> = {};
  for (const entry of exerciseEntries) {
    if (!entry.entry_date) continue;
    for (const muscle of primaryMusclesOf(entry)) {
      if (!recoveryData[muscle] || entry.entry_date > recoveryData[muscle]) {
        recoveryData[muscle] = entry.entry_date;
      }
    }
  }
  return recoveryData;
}

export function calculateExerciseVariety(
  exerciseEntries: MuscleEntry[]
): Record<string, number> {
  const muscleExerciseMap: Record<string, Set<string>> = {};
  for (const entry of exerciseEntries) {
    const name = entry.exercise_name;
    if (!name) continue;
    for (const muscle of primaryMusclesOf(entry)) {
      const bucket = muscleExerciseMap[muscle] ?? new Set<string>();
      muscleExerciseMap[muscle] = bucket;
      bucket.add(name);
    }
  }
  const varietyData: Record<string, number> = {};
  for (const muscle of Object.keys(muscleExerciseMap)) {
    varietyData[muscle] = muscleExerciseMap[muscle]?.size ?? 0;
  }
  return varietyData;
}

/** Hevy-style heat: working sets per primary muscle over the range. */
export function calculateMuscleGroupSets(
  exerciseEntries: MuscleEntry[]
): Record<string, number> {
  const setsByMuscle: Record<string, number> = {};
  for (const entry of exerciseEntries) {
    const muscles = primaryMusclesOf(entry);
    if (muscles.length === 0) continue;
    const count = workingSetCount(entry.sets);
    if (count === 0) continue;
    for (const muscle of muscles) {
      setsByMuscle[muscle] = (setsByMuscle[muscle] || 0) + count;
    }
  }
  return setsByMuscle;
}
