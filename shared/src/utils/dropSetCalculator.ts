export interface DropSetConfig {
  baseWeight: number;
  count?: number;
  dropPercent?: number;
  roundIncrement?: number;
}

export const DEFAULT_DROP_SET_COUNT = 3;
export const DEFAULT_DROP_SET_PERCENT = 20;

const KG_PER_LB = 0.45359237;

/** Smallest practical load step per display unit (fractional kg plates / 2.5 lb plates). */
export const DROP_SET_ROUND_INCREMENT = { kg: 0.25, lbs: 2.5 } as const;

export type DropSetWeightUnit = keyof typeof DROP_SET_ROUND_INCREMENT;

/**
 * Calculates drop-set weight values by stepping down by dropPercent (default 20%)
 * each round and rounding to the nearest weight increment (default 0.25).
 * Units are whatever `baseWeight` is in.
 */
export function calculateDropSetWeights(config: DropSetConfig): number[] {
  const count = config.count ?? DEFAULT_DROP_SET_COUNT;
  const dropPercent = config.dropPercent ?? DEFAULT_DROP_SET_PERCENT;
  const roundIncrement = config.roundIncrement ?? DROP_SET_ROUND_INCREMENT.kg;

  if (count <= 0 || config.baseWeight <= 0) return [];

  const results: number[] = [];
  let current = config.baseWeight;

  for (let i = 0; i < count; i++) {
    const factor = 1 - dropPercent / 100;
    current = current * factor;
    const rounded = Math.round(current / roundIncrement) * roundIncrement;
    const cleanWeight = Math.max(
      roundIncrement,
      Math.round(rounded * 100) / 100
    );
    results.push(cleanWeight);
  }

  return results;
}

/**
 * Drop-set weights in kg, rounded in the lifter's display unit so a pound user
 * gets loadable numbers (225 lb → 180 / 145 / 115 lb) instead of kg-rounded
 * values that read as 180.04 / 144.07 lb.
 */
export function calculateDropSetWeightsKg(
  baseWeightKg: number,
  unit: DropSetWeightUnit,
  count: number = DEFAULT_DROP_SET_COUNT,
  dropPercent: number = DEFAULT_DROP_SET_PERCENT
): number[] {
  if (unit === 'kg') {
    return calculateDropSetWeights({
      baseWeight: baseWeightKg,
      count,
      dropPercent,
      roundIncrement: DROP_SET_ROUND_INCREMENT.kg,
    });
  }
  return calculateDropSetWeights({
    baseWeight: baseWeightKg / KG_PER_LB,
    count,
    dropPercent,
    roundIncrement: DROP_SET_ROUND_INCREMENT.lbs,
  }).map((lb) => Math.round(lb * KG_PER_LB * 10000) / 10000);
}

export interface DropSetBaseCandidate {
  weight?: number | null;
  set_type?: string | null;
}

/**
 * Index of the set drop sets should start from: the last working set with a
 * weight. Warm-up and existing drop sets are skipped, so tapping "add drop
 * sets" twice drops from the working weight again rather than compounding.
 * `effectiveWeight` lets a caller supply a placeholder (assumed) weight for
 * sets the user hasn't typed into yet. Returns -1 when there is none.
 */
export function findDropSetBaseIndex<T extends DropSetBaseCandidate>(
  sets: readonly T[],
  effectiveWeight: (set: T) => number | null | undefined = (set) => set.weight
): number {
  for (let i = sets.length - 1; i >= 0; i--) {
    const set = sets[i];
    if (set === undefined || isWarmupOrDropSetType(set.set_type)) continue;
    const weight = effectiveWeight(set);
    if (weight != null && weight > 0) return i;
  }
  return -1;
}

function normalizeSetType(setType: string | null | undefined): string {
  return setType ? setType.toLowerCase().replace(/[^a-z]/g, '') : '';
}

/** Web labels the set type "Warm-up"; mobile uses "warmup". */
export function isWarmupSetType(setType: string | null | undefined): boolean {
  return normalizeSetType(setType) === 'warmup';
}

/** Web labels set types "Warm-up" / "Drop Set"; mobile uses "warmup" / "drop". */
export function isWarmupOrDropSetType(
  setType: string | null | undefined
): boolean {
  return (
    isWarmupSetType(setType) || normalizeSetType(setType).startsWith('drop')
  );
}
