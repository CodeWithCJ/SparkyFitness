import {
  toPer100g,
  roundedMacros,
  type IngredientDraftRow,
} from '@workspace/shared';
import type { MealFood } from '@/types/meal';

/**
 * Turns reviewed estimate rows into `MealFood`s for the Meal Builder.
 *
 * The Meal Builder treats any row carrying a `food_id` as already resolved and
 * logs the diary entry against that database food, which makes the server
 * snapshot ITS nutrition. So a match's ids may only travel with a row that is
 * actually showing that match: an unapplied suggestion would silently swap the
 * reviewed numbers for a food the user never accepted.
 */
export function estimateRowsToMealFoods(
  rows: IngredientDraftRow[]
): MealFood[] {
  return rows.flatMap((row): MealFood[] => {
    // A row with no weight has no per-100 g basis to convert to. Falling back
    // to `row.macros` would write PORTION numbers into a row labelled
    // `serving_size: 100, serving_unit: 'g'` — the exact basis mix-up the
    // branded types exist to make impossible — and the food created from it
    // would carry that error for good. Drop the row instead.
    const per100g = toPer100g(row.macros, row.grams);
    if (!per100g) return [];
    const rounded = roundedMacros(per100g);
    const applied = row.matchApplied ? row.match : null;
    return [
      {
        id: row.id,
        food_id: applied?.food_id || undefined,
        variant_id: applied?.variant_id || undefined,
        food_name: row.name,
        quantity: row.grams,
        unit: 'g',
        calories: rounded.calories_kcal,
        protein: rounded.protein_g,
        carbs: rounded.carbs_g,
        fat: rounded.fat_g,
        dietary_fiber: rounded.fiber_g,
        sugars: rounded.sugar_g,
        serving_size: 100,
        serving_unit: 'g',
      },
    ];
  });
}
