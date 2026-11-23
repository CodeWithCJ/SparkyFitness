import { getConversionFactor } from '@workspace/shared';

/**
 * A diary entry's nutrition is `nutrient * quantity / serving_size`, so its
 * `quantity` is expressed in the entry's `serving_unit`. When "update existing
 * entries" swaps in a variant's new serving, the quantity has to move into the
 * new unit too, or 150 g logged against a 100 g serving turns into 150 cups.
 *
 * - Same unit: the quantity is kept (the same grams/ml were eaten).
 * - Convertible units (g <-> oz, ml <-> cup, ...): the amount is converted.
 * - Anything else (g -> piece): the number of servings is kept, since there is
 *   no way to know how many grams a piece weighs.
 *
 * Returns the new quantity, or null when the entry should be left alone (the
 * unit did not change, or the old serving is unknown).
 */
export function convertEntryQuantity(
  quantity: number,
  oldServingSize: number | null,
  oldServingUnit: string | null,
  newServingSize: number | null,
  newServingUnit: string | null
): number | null {
  const oldUnit = (oldServingUnit ?? '').trim();
  const newUnit = (newServingUnit ?? '').trim();
  if (oldUnit === newUnit) return null;
  if (!Number.isFinite(quantity)) return null;

  const factor =
    oldUnit && newUnit ? getConversionFactor(oldUnit, newUnit) : null;
  let converted: number;
  if (factor !== null && factor > 0) {
    converted = quantity / factor;
  } else if (
    oldServingSize !== null &&
    oldServingSize > 0 &&
    newServingSize !== null &&
    newServingSize > 0
  ) {
    converted = (quantity / oldServingSize) * newServingSize;
  } else {
    return null;
  }
  return Math.round(converted * 10000) / 10000;
}
