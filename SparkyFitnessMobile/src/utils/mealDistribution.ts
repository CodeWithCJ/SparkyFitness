export type MealPercentages = Record<string, number>;

export const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;

export const sumPercentages = (
  percentages: MealPercentages,
  keys: string[]
): number => keys.reduce((sum, key) => sum + (percentages[key] ?? 0), 0);

/**
 * Splits whatever the locked meals leave of the 100% budget evenly across the
 * unlocked meals. The last unlocked meal takes the rounding remainder so the
 * total lands on exactly 100 (or 0 for the rest when locked meals already
 * exceed it).
 */
export const distributeRemaining = (
  percentages: MealPercentages,
  keys: string[],
  locked: Record<string, boolean>
): MealPercentages => {
  const unlocked = keys.filter((key) => !locked[key]);
  if (unlocked.length === 0) return percentages;
  const lockedTotal = sumPercentages(
    percentages,
    keys.filter((key) => locked[key])
  );
  const budget = Math.max(0, 100 - lockedTotal);
  const base = Math.floor(budget / unlocked.length);
  let remainder = budget - base * unlocked.length;
  const next = { ...percentages };
  for (const key of unlocked) {
    // Spread the leftover one point at a time rather than piling it on one meal.
    next[key] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return next;
};
