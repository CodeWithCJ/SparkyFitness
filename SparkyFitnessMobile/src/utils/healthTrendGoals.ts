import { volumeFromMl, weightFromKg } from './unitConversions';

/**
 * `target_weight` is a NUMERIC(5,2) column, so node-postgres serializes it as a numeric
 * string rather than a number.
 */
export function resolveWeightGoal(
  targetWeight: string | number | null | undefined,
  unit: 'kg' | 'lbs'
): number | undefined {
  const targetWeightKg = Number(targetWeight);

  if (!Number.isFinite(targetWeightKg) || targetWeightKg <= 0) {
    return undefined;
  }

  return weightFromKg(targetWeightKg, unit);
}

export function resolveHydrationGoal(
  waterGoalMl: number,
  unit: string
): number | undefined {
  if (waterGoalMl <= 0) {
    return undefined;
  }

  return volumeFromMl(waterGoalMl, unit);
}
