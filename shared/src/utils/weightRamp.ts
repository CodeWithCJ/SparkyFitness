import {
  DROP_SET_ROUND_INCREMENT,
  isWarmupOrDropSetType,
  type DropSetWeightUnit,
} from './dropSetCalculator.ts';

// Within-session ramp: each successive working set of one exercise steps by
// a fixed increment (negative ramps down). Unrelated to the progression
// engine, which moves the load between sessions.

const KG_PER_LB = 0.45359237;

export type WeightRampUnit = DropSetWeightUnit;

/** A ramp is on only for a finite, non-zero increment. */
export function isWeightRampActive(
  rampIncrementKg: number | null | undefined
): rampIncrementKg is number {
  return (
    rampIncrementKg != null &&
    Number.isFinite(rampIncrementKg) &&
    rampIncrementKg !== 0
  );
}

/**
 * Sets the ramp steps through: working and failure sets. Warm-ups neither
 * ramp nor seed the base, and drop sets are skipped because they already
 * step down from the last working set. Accepts web ("Warm-up", "Drop Set")
 * and mobile ("warmup", "drop") vocabularies.
 */
export function isWeightRampSetType(
  setType: string | null | undefined
): boolean {
  return !isWarmupOrDropSetType(setType);
}

/**
 * Each set's position in the ramp: 0 for the first ramp-eligible set (the
 * base), 1 for the next, and so on; null for sets the ramp skips.
 */
export function weightRampStepIndexes(
  sets: readonly { set_type?: string | null }[]
): (number | null)[] {
  let step = 0;
  return sets.map((set) => (isWeightRampSetType(set.set_type) ? step++ : null));
}

/**
 * Weight in kg for the set `stepIndex` steps after the base set. The value is
 * rounded in the lifter's display unit (0.25 kg / 2.5 lb, like drop sets) so
 * it lands on a loadable weight, and floored at that smallest step so a
 * downward ramp never reaches zero. Step 0 returns the base unchanged.
 */
export function calculateRampedWeightKg(
  baseWeightKg: number,
  stepIndex: number,
  rampIncrementKg: number,
  unit: WeightRampUnit
): number {
  if (stepIndex <= 0) return baseWeightKg;
  const roundIncrement = DROP_SET_ROUND_INCREMENT[unit];
  const toUnit = unit === 'kg' ? 1 : 1 / KG_PER_LB;
  const raw = (baseWeightKg + stepIndex * rampIncrementKg) * toUnit;
  const rounded = Math.round(raw / roundIncrement) * roundIncrement;
  const clean = Math.max(roundIncrement, Math.round(rounded * 100) / 100);
  return unit === 'kg' ? clean : Math.round(clean * KG_PER_LB * 10000) / 10000;
}
