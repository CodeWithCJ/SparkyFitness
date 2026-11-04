import {
  isBodyweightModality,
  type ExerciseModality,
} from '../constants/exercise.ts';

/**
 * The weight a set actually moved, in kg: the one number volume, estimated
 * 1RM and PRs are measured on.
 *
 * For most exercises that is the set's weight. For a bodyweight exercise
 * (`bodyweight_reps`) the set's weight is what was added (positive) or taken
 * off by assistance (negative), so the load is the lifter's body weight plus
 * it: a +20 kg dip at 80 kg moves 100 kg, a −30 kg assisted pull-up moves
 * 50 kg. With no known body weight the added weight alone is counted, so a
 * weighted set still registers and an assisted one counts nothing rather
 * than something negative.
 *
 * Every volume/1RM calculation (server SQL included, which mirrors this rule
 * inline) goes through here or copies it exactly.
 */
export function effectiveLoadKg(
  weightKg: number | null | undefined,
  modality: ExerciseModality,
  bodyWeightKg: number | null | undefined
): number {
  const weight = Number(weightKg) || 0;
  if (!isBodyweightModality(modality)) return weight;
  const body = Number(bodyWeightKg) || 0;
  return Math.max(0, body > 0 ? body + weight : weight);
}

/** Weight × reps for one set, with a bodyweight exercise's load as above. */
export function setVolumeKg(
  set: { weight?: number | null; reps?: number | null },
  modality: ExerciseModality,
  bodyWeightKg: number | null | undefined
): number {
  return (
    effectiveLoadKg(set.weight, modality, bodyWeightKg) *
    (Number(set.reps) || 0)
  );
}

export const KG_PER_LB = 0.45359237;

/** A kilogram figure in the lifter's unit, rounded to one decimal. */
export function kgInUnit(kg: number, unit: 'kg' | 'lbs'): number {
  const value = unit === 'lbs' ? kg / KG_PER_LB : kg;
  return Math.round(value * 10) / 10;
}

/**
 * Epley estimated one-rep max from a load and a rep count. 0 when either is
 * missing or not positive.
 */
export function epleyOneRepMaxKg(
  loadKg: number | null | undefined,
  reps: number | null | undefined
): number {
  const load = Number(loadKg) || 0;
  const count = Number(reps) || 0;
  if (load <= 0 || count <= 0) return 0;
  return load * (1 + count / 30);
}

/**
 * Epley estimate that counts the reps left in the tank. An RPE of 8 means
 * about two more reps were possible, so 100 kg for 5 reps at RPE 8 is judged
 * as 100 kg for 7. With no RPE, or one outside 6 to 10 (more than four reps
 * left is too loose a guess to count), it is plain Epley.
 */
export function effortAdjustedOneRepMaxKg(
  loadKg: number | null | undefined,
  reps: number | null | undefined,
  rpe: number | null | undefined
): number {
  const count = Number(reps) || 0;
  const effort = Number(rpe);
  const repsLeft =
    Number.isFinite(effort) && effort >= 6 && effort <= 10 ? 10 - effort : 0;
  return epleyOneRepMaxKg(loadKg, count > 0 ? count + repsLeft : count);
}

/**
 * The body weight that applies on a given day: the latest reading on or
 * before it, else the earliest one after it (a lifter who only weighed in
 * later is closer to that than to nothing). Null with no readings at all.
 * `readings` may be in any order; days are `YYYY-MM-DD` strings.
 */
export function bodyWeightOnDay(
  readings: readonly { date: string; weightKg: number | null | undefined }[],
  day: string
): number | null {
  let before: { date: string; weightKg: number } | null = null;
  let after: { date: string; weightKg: number } | null = null;
  for (const reading of readings) {
    const weightKg = Number(reading.weightKg);
    if (!(weightKg > 0)) continue;
    if (reading.date <= day) {
      if (before == null || reading.date > before.date) {
        before = { date: reading.date, weightKg };
      }
    } else if (after == null || reading.date < after.date) {
      after = { date: reading.date, weightKg };
    }
  }
  return before?.weightKg ?? after?.weightKg ?? null;
}
