import {
  recipeFingerprint,
  RECIPE_NUTRIENTS,
  nutrientNumber,
} from './recipeImportMath.js';
/** Ignore row IDs and ordering, but detect every ingredient, amount and nutrient edit. */
export function mealFingerprint(meal: unknown): string {
  const record =
    meal && typeof meal === 'object' ? (meal as Record<string, unknown>) : {};
  const foods = Array.isArray(record.foods) ? record.foods : [];
  const normalized = foods
    .map((item: unknown) => {
      const row =
        item && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : {};
      return {
        foodId: row.food_id ?? null,
        variantId: row.variant_id ?? null,
        childMealId: row.child_meal_id ?? null,
        itemType: row.item_type ?? 'food',
        quantity: Number(row.quantity),
        unit: row.unit,
        servingSize: Number(row.serving_size),
        servingUnit: row.serving_unit,
        nutrition: Object.fromEntries(
          RECIPE_NUTRIENTS.map((key) => [
            key,
            nutrientNumber(
              typeof row[key] === 'string' || typeof row[key] === 'number'
                ? row[key]
                : null
            ),
          ])
        ),
        customNutrients: row.custom_nutrients ?? null,
      };
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return recipeFingerprint(normalized);
}
