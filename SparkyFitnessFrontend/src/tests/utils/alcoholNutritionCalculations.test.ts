import {
  calculateFoodEntryNutrition,
  calculateDayTotals,
} from '@/utils/nutritionCalculations';
import { standardDrinks } from '@workspace/shared';
import type { FoodEntry } from '@/types/food';
import type { FoodEntryMeal } from '@/types/meal';

describe('calculateFoodEntryNutrition — alcohol_g (#1925)', () => {
  it('scales a variant-sourced alcohol value by quantity / serving_size', () => {
    const entry = {
      quantity: 2,
      unit: 'serving',
      food_variants: {
        serving_size: 1,
        calories: 150,
        alcohol_g: 14,
      },
    } as unknown as FoodEntry;

    const result = calculateFoodEntryNutrition(entry);

    expect(result.alcohol_g).toBe(28);
    // Calories remain scaled labelled calories (150 * 2 = 300), no alcohol calories added
    expect(result.calories).toBe(300);
  });

  it('reads a snapshotted alcohol value directly off the entry', () => {
    const entry = {
      quantity: 1,
      calories: 120,
      alcohol_g: 13.5,
      serving_size: 1,
    } as unknown as FoodEntry;

    const result = calculateFoodEntryNutrition(entry);

    expect(result.alcohol_g).toBe(13.5);
  });

  it('defaults to 0 when there is no nutrition source or no alcohol_g', () => {
    const entry = { quantity: 1 } as unknown as FoodEntry;
    const result = calculateFoodEntryNutrition(entry);
    expect(result.alcohol_g).toBe(0);
  });

  it('calculates standard drinks from alcohol_g and preference preset', () => {
    const alcoholGrams = 28;
    expect(standardDrinks(alcoholGrams, 14)).toBe(2.0); // US
    expect(standardDrinks(alcoholGrams, 8)).toBe(3.5); // UK
  });
});

describe('calculateDayTotals — alcohol_g (#1925)', () => {
  it('sums alcohol_g across food entries', () => {
    const entries = [
      {
        quantity: 1,
        calories: 140,
        alcohol_g: 14,
        serving_size: 1,
        meal_type: 'dinner',
      },
      {
        quantity: 1,
        calories: 100,
        alcohol_g: 10,
        serving_size: 1,
        meal_type: 'dinner',
      },
    ] as unknown as FoodEntry[];

    const totals = calculateDayTotals(entries, []);

    expect(totals.alcohol_g).toBe(24);
  });

  it("includes a logged meal's aggregated alcohol_g", () => {
    const meals = [
      { calories: 250, alcohol_g: 14, meal_type: 'dinner' },
    ] as unknown as FoodEntryMeal[];

    const totals = calculateDayTotals([], meals);

    expect(totals.alcohol_g).toBe(14);
  });

  it('treats a missing meal alcohol_g as 0, not undefined or NaN', () => {
    const meals = [
      { calories: 200, meal_type: 'dinner' },
    ] as unknown as FoodEntryMeal[];

    const totals = calculateDayTotals([], meals);

    expect(totals.alcohol_g).toBe(0);
    expect(Number.isNaN(totals.alcohol_g)).toBe(false);
  });
});
