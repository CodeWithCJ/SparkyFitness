import {
  isWarmupOrDropSetType,
  type DropSetWeightUnit,
} from "./dropSetCalculator.ts";

const KG_PER_LB = 0.45359237;

/** Rest after a warm-up set. Short on purpose: it is not a working set. */
export const WARMUP_REST_SEC = 60;

/** One warm-up set of a method: a share of the working weight, and reps. */
export interface WarmupMethodStep {
  /** Percent of the first working set's weight, 1 to 100. */
  percent: number;
  reps: number;
}

/** The ramp used until the lifter edits it: 40% x 5, 60% x 5, 80% x 3. */
export const DEFAULT_WARMUP_METHOD: readonly WarmupMethodStep[] = [
  { percent: 40, reps: 5 },
  { percent: 60, reps: 5 },
  { percent: 80, reps: 3 },
];

export const WARMUP_METHOD_MAX_STEPS = 8;
export const WARMUP_METHOD_PERCENT_MAX = 95;
export const WARMUP_METHOD_REPS_MAX = 30;

/** Loadable steps to round to, per display unit: plates on a bar... */
export const WARMUP_PLATE_ROUNDING_OPTIONS = {
  kg: [1, 1.25, 2.5, 5],
  lbs: [2.5, 5, 10],
} as const;
export const DEFAULT_WARMUP_PLATE_ROUNDING = { kg: 2.5, lbs: 5 } as const;

/** ...and dumbbells, which come in their own steps. */
export const WARMUP_DUMBBELL_ROUNDING_OPTIONS = {
  kg: [1, 2, 2.5, 5],
  lbs: [1, 2, 2.5, 5],
} as const;
export const DEFAULT_WARMUP_DUMBBELL_ROUNDING = { kg: 1, lbs: 2 } as const;

/** Whether an exercise's equipment list includes dumbbells. */
export function usesDumbbells(
  equipment: readonly string[] | string | null | undefined,
): boolean {
  if (equipment == null) return false;
  const list = typeof equipment === "string" ? [equipment] : equipment;
  return list.some((item) => item.toLowerCase().includes("dumbbell"));
}

/**
 * A method read back from storage or typed in: whole-number percents and reps
 * inside the limits, at most `WARMUP_METHOD_MAX_STEPS`, in ascending percent
 * order (a warm-up ramp climbs). Anything unusable gives the default, so a
 * corrupted setting never leaves the lifter with no ramp.
 */
export function normalizeWarmupMethod(raw: unknown): WarmupMethodStep[] {
  if (!Array.isArray(raw)) return DEFAULT_WARMUP_METHOD.map((s) => ({ ...s }));
  const steps: WarmupMethodStep[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const percent = Math.round(Number((item as WarmupMethodStep).percent));
    const reps = Math.round(Number((item as WarmupMethodStep).reps));
    if (
      !Number.isFinite(percent) ||
      !Number.isFinite(reps) ||
      percent < 1 ||
      reps < 1
    ) {
      continue;
    }
    steps.push({
      percent: Math.min(percent, WARMUP_METHOD_PERCENT_MAX),
      reps: Math.min(reps, WARMUP_METHOD_REPS_MAX),
    });
  }
  if (steps.length === 0) return DEFAULT_WARMUP_METHOD.map((s) => ({ ...s }));
  steps.sort((a, b) => a.percent - b.percent);
  return steps.slice(0, WARMUP_METHOD_MAX_STEPS);
}

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

export interface WarmupOptions {
  /** The method to follow. Defaults to `DEFAULT_WARMUP_METHOD`. */
  method?: readonly WarmupMethodStep[];
  /** Step to round to, in the display unit. Defaults to the plate step. */
  increment?: number;
}

/**
 * Warm-up sets for a first working set of `workingWeightKg`, following
 * `options.method` (by default 40% x 5, 60% x 5, 80% x 3). Weights are
 * rounded in the lifter's display unit, to `options.increment`, so they land
 * on loadable weights. A step that would not climb (at or under the previous
 * one) or would not stay under the working weight is dropped, so a light
 * working weight gets a shorter ramp. No warm-ups when the working weight is
 * missing.
 */
export function calculateWarmupSets(
  workingWeightKg: number,
  unit: DropSetWeightUnit,
  options: WarmupOptions = {},
): WarmupSet[] {
  if (!Number.isFinite(workingWeightKg) || workingWeightKg <= 0) return [];
  const working = unit === "kg" ? workingWeightKg : workingWeightKg / KG_PER_LB;
  const method = options.method ?? DEFAULT_WARMUP_METHOD;
  const step =
    options.increment != null && options.increment > 0
      ? options.increment
      : DEFAULT_WARMUP_PLATE_ROUNDING[unit];

  const sets: { weight: number; reps: number }[] = [];
  for (const { percent, reps } of method) {
    // Floating point leaves 41.250000000000007 where 41.25 was meant.
    const weight = Math.round((working * percent) / 100 / step + 1e-9) * step;
    const previous = sets.length > 0 ? sets[sets.length - 1]!.weight : 0;
    if (weight > previous && weight < working) sets.push({ weight, reps });
  }
  return sets.map(({ weight, reps }) => ({
    weightKg:
      unit === "kg" ? weight : Math.round(weight * KG_PER_LB * 10000) / 10000,
    reps,
  }));
}

export interface WarmupBaseCandidate {
  weight?: number | null;
  set_type?: string | null;
}

/**
 * Index of the set warm-ups are built from: the first working set (not a
 * warm-up or drop set). `effectiveWeight` lets a caller supply a placeholder
 * weight for a set the user has not typed into. Returns -1 when that set has
 * no weight, since there is nothing to ramp towards.
 */
export function findWarmupBaseIndex<T extends WarmupBaseCandidate>(
  sets: readonly T[],
  effectiveWeight: (set: T) => number | null | undefined = (set) => set.weight,
): number {
  const index = sets.findIndex((set) => !isWarmupOrDropSetType(set.set_type));
  if (index < 0) return -1;
  const weight = effectiveWeight(sets[index]!);
  return weight != null && weight > 0 ? index : -1;
}
