import { estimateRowsToMealFoods } from '@/utils/foodPhotoEstimate';
import {
  ingredientDraftReducer,
  initialiseIngredientDraft,
  ingredientDraftTotals,
  toPer100g,
  type FoodPhotoEstimateItem,
} from '@workspace/shared';

const item: FoodPhotoEstimateItem = {
  name: 'Steamed broccoli',
  estimated_grams: 85,
  portion_description: '1 cup',
  preparation: 'steamed',
  calories_kcal: 89,
  protein_g: 3,
  carbs_g: 7,
  fat_g: 1,
  fiber_g: 2.6,
  sugar_g: 1.4,
  item_confidence: 'high',
  assumptions: [],
};

describe('web ingredient draft', () => {
  const init = (items: FoodPhotoEstimateItem[]) =>
    initialiseIngredientDraft(items);

  it('shares the reducer with mobile, so a grams edit rescales identically', () => {
    const state = ingredientDraftReducer(init([item]), {
      type: 'SET_GRAMS',
      id: 'local-0',
      grams: 42.5,
    });
    expect(state.rows[0]!.macros.calories_kcal).toBeCloseTo(44.5, 6);
  });

  it('derives totals rather than storing them', () => {
    const state = ingredientDraftReducer(init([item, item]), {
      type: 'REMOVE_ROW',
      id: 'local-0',
    });
    const { totals, totalGrams } = ingredientDraftTotals(state.rows);
    expect(totals.calories_kcal).toBe(89);
    expect(totalGrams).toBe(85);
  });

  it('converts an edited row to per-100g for storage', () => {
    const state = init([item]);
    const row = state.rows[0]!;
    const per100g = toPer100g(row.macros, row.grams);
    expect(per100g).not.toBeNull();
    // 89 kcal for 85 g -> 104.7 per 100 g.
    expect(per100g!.calories_kcal).toBeCloseTo(104.7, 1);
  });

  it('refuses to build per-100g nutrition from a zero-weight row', () => {
    const state = ingredientDraftReducer(init([item]), {
      type: 'SET_GRAMS',
      id: 'local-0',
      grams: 0,
    });
    const row = state.rows[0]!;
    expect(toPer100g(row.macros, row.grams)).toBeNull();
  });
});

describe('estimateRowsToMealFoods', () => {
  const match = {
    food_id: '11111111-1111-4111-8111-111111111111',
    variant_id: '22222222-2222-4222-8222-222222222222',
    food_name: 'Frozen broccoli',
    brand: null,
    serving_size: 100,
    serving_unit: 'g',
    match_score: 0.95,
    match_source: 'exact_name' as const,
    is_own_food: true,
    gram_convertible: true,
    scaled: {
      calories_kcal: 30,
      protein_g: 2,
      carbs_g: 5,
      fat_g: 0.3,
      fiber_g: 2,
      sugar_g: 1,
    },
  };

  it('carries the ids of a match the row is showing', () => {
    const rows = initialiseIngredientDraft([
      { ...item, match, preselect_match: true },
    ]).rows;
    expect(rows[0]!.matchApplied).toBe(true);

    const food = estimateRowsToMealFoods(rows)[0]!;
    expect(food.food_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(food.variant_id).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('does NOT carry the ids of a match the user never accepted', () => {
    // The Meal Builder logs any row with a food_id against that database food
    // and lets the server snapshot its nutrition. Passing the ids of a mere
    // suggestion therefore throws away the reviewed numbers — and a matched
    // food with no nutrition recorded lands a 0 kcal row in the diary.
    const rows = initialiseIngredientDraft([{ ...item, match }]).rows;
    expect(rows[0]!.matchApplied).toBe(false);

    const food = estimateRowsToMealFoods(rows)[0]!;
    expect(food.food_id).toBeUndefined();
    expect(food.variant_id).toBeUndefined();
    // The row keeps the model's own numbers, per 100 g: 89 kcal for 85 g.
    expect(food.calories).toBeCloseTo(104.71, 2);
    expect(food.serving_size).toBe(100);
  });
});
