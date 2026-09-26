import { weightFromKg } from './unitConversions';

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

/**
 * `HydrationBarChart` expects `goal` in raw millilitres (matching `data`'s unit) and
 * converts it to the display unit itself, the same way it converts each plotted point —
 * converting here too would double-convert it.
 */
export function resolveHydrationGoal(waterGoalMl: number): number | undefined {
  if (waterGoalMl <= 0) {
    return undefined;
  }

  return waterGoalMl;
}
