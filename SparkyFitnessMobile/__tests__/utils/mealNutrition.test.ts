import {
  calculateEntryNutrition,
  calculateMealNutrition,
  filterFoodEntriesByMealType,
  groupFoodEntriesByMealType,
} from '../../src/utils/mealNutrition';
import type { FoodEntry } from '../../src/types/foodEntries';

const entry = (overrides: Partial<FoodEntry>): FoodEntry => ({
  id: 'entry-1',
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-04-23',
  serving_size: 1,
  calories: 0,
  ...overrides,
});

describe('mealNutrition', () => {
  it('groups known meal types and buckets unknown meals as other', () => {
    const entries = [
      entry({ id: 'breakfast', meal_type: 'breakfast' }),
      entry({ id: 'lunch', meal_type: 'lunch' }),
      entry({ id: 'custom', meal_type: 'Brunch' }),
    ];

    const grouped = groupFoodEntriesByMealType(entries);

    expect(grouped.breakfast).toEqual([entries[0]]);
    expect(grouped.lunch).toEqual([entries[1]]);
    expect(grouped.other).toEqual([entries[2]]);
  });

  it('keeps blank or missing meal types in snacks to match diary fallback behavior', () => {
    const entries = [
      entry({ id: 'blank', meal_type: '' }),
      entry({ id: 'missing', meal_type: undefined as unknown as string }),
    ];

    const grouped = groupFoodEntriesByMealType(entries);

    expect(grouped.snacks).toEqual(entries);
    expect(grouped.other).toEqual([]);
  });

  it('filters entries for a single meal type', () => {
    const entries = [
      entry({ id: 'breakfast', meal_type: 'breakfast' }),
      entry({ id: 'lunch', meal_type: 'lunch' }),
      entry({ id: 'custom', meal_type: 'Brunch' }),
    ];

    expect(filterFoodEntriesByMealType(entries, 'breakfast')).toEqual([entries[0]]);
    expect(filterFoodEntriesByMealType(entries, 'other')).toEqual([entries[2]]);
  });

  it('scales entry nutrition by quantity and serving size', () => {
    const nutrition = calculateEntryNutrition(entry({
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
      quantity: 3,
      serving_size: 2,
    }));

    expect(nutrition).toEqual({
      calories: 300,
      protein: 15,
      carbs: 30,
      fat: 8,
    });
  });

  it('totals meal nutrition including optional nutrients only when present', () => {
    const nutrition = calculateMealNutrition([
      entry({
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        dietary_fiber: 4,
        sodium: 150,
        quantity: 2,
        serving_size: 1,
      }),
      entry({
        calories: 100,
        protein: 4,
        carbs: 12,
        fat: 3,
        quantity: 1,
        serving_size: 2,
      }),
    ]);

    expect(nutrition).toMatchObject({
      servingSize: 1,
      servingUnit: 'meal',
      calories: 450,
      protein: 22,
      carbs: 46,
      fat: 12,
      fiber: 8,
      sodium: 300,
    });
    expect(nutrition.calcium).toBeUndefined();
  });
});
