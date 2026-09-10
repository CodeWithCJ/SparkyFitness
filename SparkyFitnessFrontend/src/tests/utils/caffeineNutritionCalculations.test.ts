import {
  calculateFoodEntryNutrition,
  calculateDayTotals,
} from '@/utils/nutritionCalculations';
import type { FoodEntry } from '@/types/food';
import type { FoodEntryMeal } from '@/types/meal';

// #1958: caffeine_mg is the first nutrient added to FoodEntry/FoodVariant
// since the four-block calculateFoodEntryNutrition scaling pipeline was
// written by hand (zero-default object, per-reference-size map, scaled
// return, and the day-totals reduce seed). These tests exist to catch a
// future nutrient addition that misses one of those four blocks — a mistake
// that produces `undefined` rather than a type error.

describe('calculateFoodEntryNutrition — caffeine_mg', () => {
  it('scales a variant-sourced caffeine value by quantity / serving_size', () => {
    const entry = {
      quantity: 2,
      unit: 'serving',
      food_variants: {
        serving_size: 1,
        calories: 5,
        caffeine_mg: 63,
      },
    } as unknown as FoodEntry;

    const result = calculateFoodEntryNutrition(entry);

    expect(result.caffeine_mg).toBe(126);
  });

  it('reads a snapshotted caffeine value directly off the entry', () => {
    const entry = {
      quantity: 1,
      calories: 3,
      caffeine_mg: 95,
      serving_size: 1,
    } as unknown as FoodEntry;

    const result = calculateFoodEntryNutrition(entry);

    expect(result.caffeine_mg).toBe(95);
  });

  it('defaults to 0 when there is no nutrition source at all', () => {
    const entry = { quantity: 1 } as unknown as FoodEntry;

    const result = calculateFoodEntryNutrition(entry);

    expect(result.caffeine_mg).toBe(0);
  });

  it('defaults to 0 when the source has no caffeine_mg', () => {
    const entry = {
      quantity: 1,
      calories: 3,
      serving_size: 1,
    } as unknown as FoodEntry;

    const result = calculateFoodEntryNutrition(entry);

    expect(result.caffeine_mg).toBe(0);
  });
});

describe('calculateDayTotals — caffeine_mg', () => {
  it('sums caffeine across food entries', () => {
    const entries = [
      {
        quantity: 1,
        calories: 3,
        caffeine_mg: 63,
        serving_size: 1,
        meal_type: 'breakfast',
      },
      {
        quantity: 1,
        calories: 3,
        caffeine_mg: 40,
        serving_size: 1,
        meal_type: 'breakfast',
      },
    ] as unknown as FoodEntry[];

    const totals = calculateDayTotals(entries, []);

    expect(totals.caffeine_mg).toBe(103);
  });

  it("includes a logged meal's aggregated caffeine_mg", () => {
    const meals = [
      { calories: 10, caffeine_mg: 80, meal_type: 'breakfast' },
    ] as unknown as FoodEntryMeal[];

    const totals = calculateDayTotals([], meals);

    expect(totals.caffeine_mg).toBe(80);
  });

  it('treats a missing meal caffeine_mg as 0, not undefined', () => {
    const meals = [
      { calories: 10, meal_type: 'breakfast' },
    ] as unknown as FoodEntryMeal[];

    const totals = calculateDayTotals([], meals);

    expect(totals.caffeine_mg).toBe(0);
    expect(Number.isNaN(totals.caffeine_mg)).toBe(false);
  });
});
