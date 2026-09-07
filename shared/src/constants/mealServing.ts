/**
 * The units a MEAL can be portioned in.
 *
 * Deliberately shorter than the food unit list (`FOOD_FORM_UNIT_GROUPS`): a
 * meal's serving unit is a way of dividing a dish, not a way of measuring an
 * ingredient, and every consumer of `meals.serving_unit` expects this
 * vocabulary. Widening it is a change for meals everywhere, not for one screen.
 */
export const MEAL_SERVING_UNITS = [
  "serving",
  "g",
  "ml",
  "oz",
  "cup",
  "tbsp",
  "tsp",
  "piece",
] as const;

export type MealServingUnit = (typeof MEAL_SERVING_UNITS)[number];

/**
 * The unit that means "a portion", for which `serving_size` is tautologically 1
 * and the user states the yield directly. Every other unit asks for a total
 * amount and a serving size instead, and derives the yield from the two.
 */
export const MEAL_SERVING_UNIT_DEFAULT: MealServingUnit = "serving";

/** Decimal places kept when a derived yield or a rescaled quantity is stored. */
export const MEAL_SERVING_PRECISION = 6;

export function roundMealServingValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** MEAL_SERVING_PRECISION;
  return Math.round(value * factor) / factor;
}
