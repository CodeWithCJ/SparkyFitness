/**
 * Returns net carbs: `max(0, carbs - dietaryFiber)`.
 *
 * Floored at zero so an entry with over-reported fiber (fiber > carbs) does
 * not surface as a negative carb count. Mirrors the web implementation in
 * `SparkyFitnessFrontend/src/utils/nutrientUtils.ts` so behavior matches
 * across clients honoring the same `show_net_carbs` user preference.
 */
export const getNetCarbsValue = (
  carbs: number | null | undefined,
  dietaryFiber: number | null | undefined,
): number => {
  const carbsValue = Number(carbs) || 0;
  const fiberValue = Number(dietaryFiber) || 0;
  return Math.max(0, carbsValue - fiberValue);
};

/** Adds/removes a nutrient key from a visible_nutrients list, idempotently. */
export const toggleNutrientVisibility = (
  current: string[],
  name: string,
  enabled: boolean,
): string[] =>
  enabled
    ? current.includes(name) ? current : [...current, name]
    : current.filter((n) => n !== name);
