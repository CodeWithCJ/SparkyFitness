/**
 * Detects a per-meal aggregate CSV from its header mapping.
 *
 * Some vendors (e.g. MyFitnessPal) export one row per MEAL — totals only, with
 * no food name, quantity, or unit. Those rows can't go through the per-food
 * import path (which requires food_name + quantity), but they CAN be routed
 * through the meal-group path: each row becomes one meal carrying its nutrient
 * totals. The signal is the mapping state, not cell content: a per-food file
 * keeps food_name/quantity/unit mapped (regardless of how empty individual
 * cells are), while an aggregate file leaves all three unmapped.
 */

const AGGREGATE_UNMAPPED_HEADERS = ['food_name', 'quantity', 'unit'];

// The field overrides a per-meal aggregate row receives when it is routed
// through the meal-group import path: a single serving named after its meal
// type, carrying the row's nutrient totals. Pure (depends only on the row's
// meal_type), so it is testable without the component that applies it.
export const reshapeAggregateRow = (row: Record<string, string>) => {
  const mealType = (row['meal_type'] ?? '').trim();
  return {
    meal_name: mealType,
    food_name: mealType,
    quantity: '1',
    unit: 'serving',
  };
};

export function isAggregateMapping(
  headerMapping: Record<string, string>,
  nutrientHeaders: string[]
): boolean {
  const allIdentityUnmapped = AGGREGATE_UNMAPPED_HEADERS.every(
    (h) => !headerMapping[h]
  );
  const anyNutrientMapped = nutrientHeaders.some((h) =>
    Boolean(headerMapping[h])
  );
  return allIdentityUnmapped && anyNutrientMapped;
}
