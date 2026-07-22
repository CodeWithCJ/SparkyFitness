import { vi, beforeEach, describe, expect, it } from 'vitest';

vi.mock('../models/foodRepository.js', () => ({
  default: {
    findVisibleFoodByName: vi.fn(),
    findFoodByProviderExternalId: vi.fn(),
    getFoodVariantsByFoodId: vi.fn(),
    updateFoodVariantNutrition: vi.fn(),
    createFood: vi.fn(),
    createFoodEntry: vi.fn(),
    bulkCreateFoodEntries: vi.fn(),
  },
}));

vi.mock('../models/foodEntryMealRepository.js', () => ({
  default: {
    createFoodEntryMeal: vi.fn(),
  },
}));

vi.mock('../models/mealRepository.js', () => ({
  default: {
    searchMeals: vi.fn(),
    getMealById: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import { importFoodDiaryEntriesInBulk } from '../services/foodEntryService.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import mealRepository from '../models/mealRepository.js';

const baseRow = {
  date: '2026-07-21',
  meal_type: 'breakfast',
  meal_name: '',
  food_name: 'Oatmeal',
  brand: '',
  quantity: '200',
  unit: 'g',
};

describe('importFoodDiaryEntriesInBulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('references a matched own food directly (no clone)', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      default_variant_id: 'variant-1',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      { id: 'variant-1', serving_unit: 'g', is_default: true },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    const result = await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [{ ...baseRow, calories: '', protein: '', carbs: '', fat: '' }],
      {}
    );

    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        variant_id: 'variant-1',
        source: 'csv_import',
      }),
      'user-1'
    );
    expect(result.processed).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('auto-creates a food when nothing matches but nutrients are provided', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue(null);
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );
    (foodRepository.createFood as any).mockResolvedValue({
      id: 'new-food-1',
      default_variant: { id: 'new-variant-1' },
    });
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    const row = {
      ...baseRow,
      calories: '150',
      protein: '5',
      carbs: '27',
      fat: '3',
    };
    const result = await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [row],
      {}
    );

    expect(foodRepository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Oatmeal',
        provider_type: 'csv_import',
        is_quick_food: true,
        calories: 150,
      })
    );
    expect(result.processed).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('pins serving_size to the row portion when a matched food row supplies nutrients', async () => {
    // Matched variant is per-100g, but the row says 200g = 150 cal. Without a
    // serving override the diary would rescale to 300; the override makes the
    // snapshot per-200g so it displays the CSV totals 1:1.
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      default_variant_id: 'variant-1',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      {
        id: 'variant-1',
        serving_unit: 'g',
        serving_size: 100,
        is_default: true,
      },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [{ ...baseRow, quantity: '200', unit: 'g', calories: '150' }],
      {}
    );

    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        quantity: 200,
        serving_size: 200,
        serving_unit: 'g',
        calories: 150,
      }),
      'user-1'
    );
  });

  it('does not override serving basis when a matched row supplies no nutrients', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      default_variant_id: 'variant-1',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      { id: 'variant-1', serving_unit: 'g', is_default: true },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [{ ...baseRow, calories: '', protein: '', carbs: '', fat: '' }],
      {}
    );

    const call = (foodRepository.createFoodEntry as any).mock.calls[0][0];
    expect(call.serving_size).toBeUndefined();
    expect(call.calories).toBeUndefined();
  });

  it('errors a row with no match and no nutrients instead of creating a zero-nutrient food', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue(null);
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );

    const row = { ...baseRow, calories: '', protein: '', carbs: '', fat: '' };
    const result = await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [row],
      {}
    );

    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(result.processed).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/No existing food matched/);
  });

  it('picks the unit-matching variant over the default when they differ', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      default_variant_id: 'variant-default',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      { id: 'variant-default', serving_unit: 'serving', is_default: true },
      { id: 'variant-grams', serving_unit: 'g', is_default: false },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [{ ...baseRow, unit: 'g' }],
      {}
    );

    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({ variant_id: 'variant-grams' }),
      'user-1'
    );
  });

  it('does not match a food outside the selected scope', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue(null);
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );
    (foodRepository.createFood as any).mockResolvedValue({
      id: 'new-food-1',
      default_variant: { id: 'new-variant-1' },
    });
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    const row = { ...baseRow, calories: '150' };
    await importFoodDiaryEntriesInBulk('user-1', 'user-1', [row], {});

    expect(foodRepository.findVisibleFoodByName).toHaveBeenCalledWith(
      'user-1',
      'Oatmeal',
      {}
    );
  });

  it('is idempotent: re-importing the same row reuses the same source_id', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      default_variant_id: 'variant-1',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      { id: 'variant-1', serving_unit: 'g', is_default: true },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    const row = { ...baseRow };
    await importFoodDiaryEntriesInBulk('user-1', 'user-1', [row], {});
    const firstSourceId = (foodRepository.createFoodEntry as any).mock
      .calls[0][0].source_id;

    (foodRepository.createFoodEntry as any).mockClear();
    await importFoodDiaryEntriesInBulk('user-1', 'user-1', [row], {});
    const secondSourceId = (foodRepository.createFoodEntry as any).mock
      .calls[0][0].source_id;

    expect(firstSourceId).toBe(secondSourceId);
  });

  it('creates an ad-hoc meal group when meal_name does not match a saved meal', async () => {
    (mealRepository.searchMeals as any).mockResolvedValue([]);
    (foodEntryMealRepository.createFoodEntryMeal as any).mockResolvedValue({
      id: 'parent-1',
      meal_type_id: 'breakfast-id',
    });
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      default_variant_id: 'variant-1',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      { id: 'variant-1', serving_unit: 'g', is_default: true },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'leaf-1',
    });

    const rows = [
      { ...baseRow, meal_name: 'My Combo', food_name: 'Oatmeal' },
      { ...baseRow, meal_name: 'My Combo', food_name: 'Banana' },
    ];
    const result = await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      rows,
      {}
    );

    expect(foodEntryMealRepository.createFoodEntryMeal).toHaveBeenCalledTimes(
      1
    );
    expect(foodRepository.createFoodEntry).toHaveBeenCalledTimes(2);
    expect(result.processed).toHaveLength(2);
  });

  it('expands a saved meal template when meal_name matches and rows have no food_name', async () => {
    (mealRepository.searchMeals as any).mockResolvedValue([
      { id: 'meal-1', name: 'My Combo' },
    ]);
    (mealRepository.getMealById as any).mockResolvedValue({
      id: 'meal-1',
      name: 'My Combo',
      serving_size: 1,
      total_servings: 1,
      foods: [],
    });
    (foodEntryMealRepository.createFoodEntryMeal as any).mockResolvedValue({
      id: 'parent-1',
      user_id: 'user-1',
      meal_type_id: 'breakfast-id',
      entry_time: null,
    });
    (foodRepository.bulkCreateFoodEntries as any).mockResolvedValue([]);

    const rows = [
      {
        ...baseRow,
        meal_name: 'My Combo',
        food_name: '',
        quantity: '1',
        unit: 'serving',
      },
    ];
    const result = await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      rows,
      {}
    );

    expect(foodEntryMealRepository.createFoodEntryMeal).toHaveBeenCalledWith(
      expect.objectContaining({ meal_template_id: 'meal-1' }),
      'user-1'
    );
    expect(result.errors).toHaveLength(0);
  });

  it('override option rewrites the matched OWN food variant nutrition', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      user_id: 'user-1',
      default_variant_id: 'variant-1',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      { id: 'variant-1', serving_unit: 'g', is_default: true },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [{ ...baseRow, quantity: '200', unit: 'g', calories: '150' }],
      {},
      true
    );

    expect(foodRepository.updateFoodVariantNutrition).toHaveBeenCalledWith(
      'variant-1',
      'user-1',
      expect.objectContaining({
        serving_size: '200',
        serving_unit: 'g',
        calories: 150,
      })
    );
  });

  it('override forces mine-only scope and never mutates a non-owned food', async () => {
    // Even though family scope is requested, override collapses scope to {} and
    // the guard skips the variant update for a food owned by someone else.
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue({
      id: 'food-1',
      user_id: 'someone-else',
      default_variant_id: 'variant-1',
    });
    (foodRepository.getFoodVariantsByFoodId as any).mockResolvedValue([
      { id: 'variant-1', serving_unit: 'g', is_default: true },
    ]);
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [{ ...baseRow, calories: '150' }],
      { family: true },
      true
    );

    expect(foodRepository.findVisibleFoodByName).toHaveBeenCalledWith(
      'user-1',
      'Oatmeal',
      {}
    );
    expect(foodRepository.updateFoodVariantNutrition).not.toHaveBeenCalled();
  });

  it('passes custom nutrients through to an auto-created food and the entry', async () => {
    (foodRepository.findVisibleFoodByName as any).mockResolvedValue(null);
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );
    (foodRepository.createFood as any).mockResolvedValue({
      id: 'new-food-1',
      default_variant: { id: 'new-variant-1' },
    });
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    await importFoodDiaryEntriesInBulk(
      'user-1',
      'user-1',
      [{ ...baseRow, custom_nutrients: { omega3: 2.5 } }],
      {}
    );

    expect(foodRepository.createFood).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_nutrients: expect.objectContaining({ omega3: 2.5 }),
      })
    );
    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_nutrients: expect.objectContaining({ omega3: 2.5 }),
      }),
      'user-1'
    );
  });
});
