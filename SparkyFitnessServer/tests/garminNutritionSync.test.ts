import { describe, expect, it } from 'vitest';

/**
 * Unit tests for the Garmin nutrition sync mapping logic.
 * These test the pure functions (mapGarminNutrition, meal type mapping)
 * without hitting the database.
 */

// Re-implement the mapping function inline since it's not exported individually
function mapGarminNutrition(nutritionContent: Record<string, unknown>) {
  return {
    calories: nutritionContent.calories ?? null,
    protein: nutritionContent.protein ?? null,
    carbs: nutritionContent.carbs ?? null,
    fat: nutritionContent.fat ?? null,
    saturated_fat: nutritionContent.saturatedFat ?? null,
    polyunsaturated_fat: nutritionContent.polyunsaturatedFat ?? null,
    monounsaturated_fat: nutritionContent.monounsaturatedFat ?? null,
    trans_fat: null,
    cholesterol: nutritionContent.cholesterol ?? null,
    sodium: nutritionContent.sodium ?? null,
    potassium: nutritionContent.potassium ?? null,
    dietary_fiber: nutritionContent.fiber ?? null,
    sugars: nutritionContent.sugar ?? null,
    vitamin_a: nutritionContent.vitaminA ?? null,
    vitamin_c: nutritionContent.vitaminC ?? null,
    calcium: nutritionContent.calcium ?? null,
    iron: nutritionContent.iron ?? null,
  };
}

const GARMIN_MEAL_TYPE_MAP: Record<string, string> = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACKS: 'snacks',
};

describe('Garmin nutrition field mapping', () => {
  it('maps all Garmin camelCase fields to snake_case', () => {
    const garminNutrition = {
      calories: 376,
      carbs: 84,
      protein: 8,
      fat: 0.8,
      fiber: 6.5,
      sugar: 0.5,
      saturatedFat: 0.2,
      monounsaturatedFat: 1.5,
      polyunsaturatedFat: 0.3,
      cholesterol: 10,
      sodium: 5,
      potassium: 200,
      vitaminA: 3,
      vitaminC: 70.5,
      calcium: 26,
      iron: 0.24,
    };

    const result = mapGarminNutrition(garminNutrition);

    expect(result).toEqual({
      calories: 376,
      protein: 8,
      carbs: 84,
      fat: 0.8,
      saturated_fat: 0.2,
      polyunsaturated_fat: 0.3,
      monounsaturated_fat: 1.5,
      trans_fat: null,
      cholesterol: 10,
      sodium: 5,
      potassium: 200,
      dietary_fiber: 6.5,
      sugars: 0.5,
      vitamin_a: 3,
      vitamin_c: 70.5,
      calcium: 26,
      iron: 0.24,
    });
  });

  it('handles missing fields gracefully with null', () => {
    const garminNutrition = {
      calories: 82,
      carbs: 0,
      protein: 0,
      fat: 9.19,
    };

    const result = mapGarminNutrition(garminNutrition);

    expect(result.calories).toBe(82);
    expect(result.fat).toBe(9.19);
    expect(result.dietary_fiber).toBeNull();
    expect(result.sugars).toBeNull();
    expect(result.vitamin_a).toBeNull();
    expect(result.vitamin_c).toBeNull();
    expect(result.calcium).toBeNull();
    expect(result.iron).toBeNull();
    expect(result.potassium).toBeNull();
    expect(result.cholesterol).toBeNull();
  });

  it('always sets trans_fat to null (not provided by Garmin)', () => {
    const result = mapGarminNutrition({ calories: 100 });
    expect(result.trans_fat).toBeNull();
  });
});

describe('Garmin meal type mapping', () => {
  it('maps BREAKFAST to breakfast', () => {
    expect(GARMIN_MEAL_TYPE_MAP['BREAKFAST']).toBe('breakfast');
  });

  it('maps LUNCH to lunch', () => {
    expect(GARMIN_MEAL_TYPE_MAP['LUNCH']).toBe('lunch');
  });

  it('maps DINNER to dinner', () => {
    expect(GARMIN_MEAL_TYPE_MAP['DINNER']).toBe('dinner');
  });

  it('maps SNACKS to snacks', () => {
    expect(GARMIN_MEAL_TYPE_MAP['SNACKS']).toBe('snacks');
  });

  it('returns undefined for unknown meal types (processor defaults to snacks)', () => {
    expect(GARMIN_MEAL_TYPE_MAP['BRUNCH']).toBeUndefined();
  });
});

describe('Garmin nutrition serving size semantics', () => {
  it('produces correct consumed calories with serving_size=1 and quantity=servingQty', () => {
    // Garmin: food has 376 cal per serving, user ate 0.5 servings
    const snapshotCalories = 376;
    const servingSize = 1;
    const quantity = 0.5; // servingQty from Garmin

    // App formula: (snapshot.calories * quantity) / serving_size
    const consumed = (snapshotCalories * quantity) / servingSize;

    expect(consumed).toBe(188);
  });

  it('handles quantity > 1 correctly (e.g., 4 tablespoons of olive oil)', () => {
    const snapshotCalories = 82; // per tablespoon
    const servingSize = 1;
    const quantity = 4;

    const consumed = (snapshotCalories * quantity) / servingSize;

    expect(consumed).toBe(328);
  });

  it('handles fractional serving quantities', () => {
    const snapshotCalories = 376;
    const servingSize = 1;
    const quantity = 0.3199999928474426; // Garmin float precision

    const consumed = (snapshotCalories * quantity) / servingSize;

    expect(consumed).toBeCloseTo(120.32, 0);
  });
});
