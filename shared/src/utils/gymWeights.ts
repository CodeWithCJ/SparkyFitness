import { convertPlateWeight, type PlateUnit } from './plateCalculator.ts';

/** What a gym profile lists beyond plates and bars. */
export interface GymWeightSource {
  weight_unit: PlateUnit;
  dumbbells?: readonly number[] | null;
  machine_stacks?:
    readonly { exercise_id: string; weights: readonly number[] }[] | null;
}

/**
 * The weights a gym can actually give for one exercise, in `targetUnit` and
 * ascending: that machine's own stack when the gym lists one, else the
 * dumbbell rack for dumbbell exercises. Null when the gym lists nothing that
 * fits, so callers keep the unsnapped weight.
 */
export function gymWeightStepsFor(
  gym: GymWeightSource | null | undefined,
  exerciseId: string | null | undefined,
  equipment: string | readonly string[] | null | undefined,
  targetUnit: PlateUnit
): number[] | null {
  if (!gym) return null;
  const stack =
    exerciseId != null
      ? gym.machine_stacks?.find((m) => m.exercise_id === exerciseId)
      : undefined;
  const equipmentText = Array.isArray(equipment)
    ? equipment.join(' ')
    : (equipment ?? '');
  const steps =
    stack && stack.weights.length > 0
      ? stack.weights
      : /dumbbell/i.test(String(equipmentText)) && gym.dumbbells?.length
        ? gym.dumbbells
        : null;
  if (!steps) return null;
  return steps
    .map((w) => convertPlateWeight(w, gym.weight_unit, targetUnit))
    .sort((a, b) => a - b);
}

/**
 * Rounds `weight` to a weight the gym has: up to the next step for an
 * increase, down for a deload, so a progression never asks for a dumbbell
 * or pin setting that doesn't exist. Past either end it stops at the end.
 */
export function snapToWeightStep(
  weight: number,
  steps: readonly number[] | null | undefined,
  direction: 'up' | 'down'
): number {
  if (!steps || steps.length === 0) return weight;
  const tolerance = 1e-6;
  if (direction === 'up') {
    const next = steps.find((s) => s >= weight - tolerance);
    return next ?? steps[steps.length - 1]!;
  }
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i]! <= weight + tolerance) return steps[i]!;
  }
  return steps[0]!;
}
