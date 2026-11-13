import { vi, beforeEach, describe, expect, it } from 'vitest';

const transactionClient = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
}));
vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(transactionClient),
  getSystemClient: vi.fn(),
}));

// Mock all dependencies
vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodById: vi.fn(),
    getFoodVariantById: vi.fn(),
    bulkCreateFoodEntries: vi.fn(),
    deleteFoodEntryComponentsByFoodEntryMealId: vi.fn(),
    getFoodEntryComponentsByFoodEntryMealId: vi.fn(),
  },
}));

vi.mock('../models/foodEntryMealRepository.js', () => ({
  default: {
    createFoodEntryMeal: vi.fn(),
    updateFoodEntryMeal: vi.fn(),
    moveFoodEntryMealToMealType: vi.fn(),
    getFoodEntryMealById: vi.fn(),
    getFoodEntryMealComponents: vi.fn(),
  },
}));

vi.mock('../models/mealRepository.js', () => ({
  default: {
    getMealById: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import {
  createFoodEntryMeal,
  getFoodEntryMealWithComponents,
  moveFoodEntryMealToMealType,
  updateFoodEntryMeal,
} from '../services/foodEntryService.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import mealRepository from '../models/mealRepository.js';

describe('foodEntryMealService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFoodEntryMeal', () => {
    it('inherits name and description from meal template if not provided', async () => {
      // Mock mealTemplate
      (mealRepository.getMealById as any).mockResolvedValue({
        id: 'template-1',
        name: 'Template Meal Name',
        description: 'Template Description',
        serving_size: 1.5,
        total_servings: 2.0,
        foods: [
          {
            food_id: 'food-1',
            variant_id: 'variant-1',
            quantity: 100,
            unit: 'g',
          },
        ],
      });

      // Mock createFoodEntryMeal repository
      (foodEntryMealRepository.createFoodEntryMeal as any).mockImplementation(
        (data: any) => ({
          id: 'new-meal-entry-id',
          ...data,
        })
      );

      // Mock getFoodById & getFoodVariantById
      (foodRepository.getFoodById as any).mockResolvedValue({
        id: 'food-1',
        name: 'Food Name',
        brand: 'Brand',
        default_variant: { id: 'default-variant-1' },
      });
      (foodRepository.getFoodVariantById as any).mockResolvedValue({
        id: 'variant-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 150,
        protein: 10,
        carbs: 20,
        fat: 5,
      });

      const result = await createFoodEntryMeal('user-1', 'user-1', {
        meal_template_id: 'template-1',
        meal_type_id: 'breakfast-id',
        meal_type: 'breakfast',
        entry_date: '2026-06-19',
        quantity: 1.5, // matches reference serving_size of 1.5
        unit: 'serving',
        _clientMealModelVersion: 2,
      });

      expect(result.name).toBe('Template Meal Name');
      expect(result.description).toBe('Template Description');
      expect(foodEntryMealRepository.createFoodEntryMeal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Template Meal Name',
          description: 'Template Description',
        }),
        'user-1'
      );

      // Verify that component foods are scaled correctly.
      // consumedQuantity (1.5) / (serving_size (1.5) * total_servings (2.0)) = 1.5 / 3.0 = 0.5 portion multiplier.
      // food item quantity (100) * portion multiplier (0.5) = 50.
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            food_id: 'food-1',
            quantity: 50,
            variant_id: 'variant-1',
          }),
        ],
        'user-1'
      );
    });

    it('falls back to food default_variant when foodItem variant_id is missing or null', async () => {
      // Mock mealTemplate
      (mealRepository.getMealById as any).mockResolvedValue({
        id: 'template-1',
        name: 'Template Meal Name',
        serving_size: 1.0,
        total_servings: 1.0,
        foods: [
          {
            food_id: 'food-no-variant',
            variant_id: null,
            quantity: 100,
            unit: 'g',
          },
        ],
      });

      (foodEntryMealRepository.createFoodEntryMeal as any).mockImplementation(
        (data: any) => ({
          id: 'new-meal-entry-id',
          ...data,
        })
      );

      (foodRepository.getFoodById as any).mockResolvedValue({
        id: 'food-no-variant',
        name: 'Food Default Variant Only',
        default_variant: { id: 'default-variant-id-123' },
      });
      (foodRepository.getFoodVariantById as any).mockResolvedValue({
        id: 'default-variant-id-123',
        serving_size: 100,
        serving_unit: 'g',
        calories: 100,
      });

      await createFoodEntryMeal('user-1', 'user-1', {
        meal_template_id: 'template-1',
        entry_date: '2026-06-19',
        quantity: 1.0,
        unit: 'serving',
        _clientMealModelVersion: 2,
      });

      // Assert that default_variant-id-123 is resolved and bulkCreateFoodEntries is called with it.
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            food_id: 'food-no-variant',
            variant_id: 'default-variant-id-123',
            quantity: 100,
          }),
        ],
        'user-1'
      );
    });
  });

  describe('updateFoodEntryMeal', () => {
    it('updates food entry meal components and falls back to default_variant if variant_id is null', async () => {
      // Mock updateFoodEntryMeal repository
      (foodEntryMealRepository.updateFoodEntryMeal as any).mockResolvedValue({
        id: 'meal-entry-1',
        meal_type_id: 'breakfast-id',
        legacy_serving_unit_math: false,
      });

      // Mock getMealById for scaling reference
      (mealRepository.getMealById as any).mockResolvedValue({
        id: 'template-1',
        serving_size: 1.0,
        total_servings: 1.0,
      });

      (foodRepository.getFoodById as any).mockResolvedValue({
        id: 'food-no-variant',
        name: 'Food Default Variant Only',
        default_variant: { id: 'default-variant-id-abc' },
      });
      (foodRepository.getFoodVariantById as any).mockResolvedValue({
        id: 'default-variant-id-abc',
        serving_size: 100,
        serving_unit: 'g',
        calories: 100,
      });

      await updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
        name: 'Updated Meal Name',
        quantity: 2.0,
        unit: 'serving',
        meal_template_id: 'template-1',
        entry_date: '2026-06-19',
        foods: [
          {
            food_id: 'food-no-variant',
            variant_id: null,
            quantity: 150,
            unit: 'g',
          },
        ],
      });

      // Verify delete is called first
      expect(
        foodRepository.deleteFoodEntryComponentsByFoodEntryMealId
      ).toHaveBeenCalledWith('meal-entry-1', 'user-1', transactionClient);

      // Verify that component foods are scaled correctly.
      // consumedQuantity (2.0) / (serving_size (1.0) * total_servings (1.0)) = 2.0 portion multiplier.
      // food item quantity (150) * portion multiplier (2.0) = 300.
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            food_id: 'food-no-variant',
            variant_id: 'default-variant-id-abc',
            quantity: 300,
          }),
        ],
        'user-1',
        { client: transactionClient }
      );
    });

    // Meal-to-meal composition: a meal template linking a sub-meal must flatten
    // to leaf food_entries at log time (see MEAL_COMPOSITION_PLAN.md), composing
    // the parent's portion multiplier with the child meal's own serving yield.
    it('recursively flattens a linked sub-meal to leaf food_entries', async () => {
      (mealRepository.getMealById as any).mockImplementation(
        (id: string, _userId: string) => {
          if (id === 'parent-template') {
            return Promise.resolve({
              id: 'parent-template',
              name: 'Big Bowl',
              serving_size: 1.0,
              total_servings: 1.0,
              foods: [
                {
                  item_type: 'meal',
                  child_meal_id: 'sub-meal-1',
                  quantity: 2, // 2 servings of the sub-meal (serving_size=1 each)
                  unit: 'serving',
                },
              ],
            });
          }
          if (id === 'sub-meal-1') {
            return Promise.resolve({
              id: 'sub-meal-1',
              name: 'Egg Fried Rice',
              serving_size: 1.0,
              total_servings: 2.0, // yields 2 servings total
              foods: [
                {
                  food_id: 'rice',
                  variant_id: 'rice-variant',
                  quantity: 100,
                  unit: 'g',
                },
              ],
            });
          }
          return Promise.resolve(null);
        }
      );

      (foodEntryMealRepository.createFoodEntryMeal as any).mockImplementation(
        (data: any) => ({
          id: 'new-meal-entry-id',
          ...data,
        })
      );

      (foodRepository.getFoodById as any).mockResolvedValue({
        id: 'rice',
        name: 'Rice',
        default_variant: { id: 'rice-variant' },
      });
      (foodRepository.getFoodVariantById as any).mockResolvedValue({
        id: 'rice-variant',
        serving_size: 100,
        serving_unit: 'g',
        calories: 130,
        protein: 3,
        carbs: 28,
        fat: 0.3,
      });

      await createFoodEntryMeal('user-1', 'user-1', {
        meal_template_id: 'parent-template',
        meal_type_id: 'lunch-id',
        meal_type: 'lunch',
        entry_date: '2026-07-01',
        quantity: 1, // consuming 1x the parent template (serving_size=1, total_servings=1)
        unit: 'serving',
        _clientMealModelVersion: 2,
      });

      // rootMultiplier = 1 / (1 * 1) = 1
      // childFactor = component.quantity(2) / (child.serving_size(1) * child.total_servings(2)) = 1
      // leaf quantity = rice(100g) * rootMultiplier(1) * childFactor(1) = 100
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            food_id: 'rice',
            variant_id: 'rice-variant',
            quantity: 100,
          }),
        ],
        'user-1'
      );
    });
  });

  describe('moveFoodEntryMealToMealType', () => {
    it('moves parent and components to the new meal type without rebuilding components or re-reading foods', async () => {
      vi.mocked(
        foodEntryMealRepository.moveFoodEntryMealToMealType
      ).mockResolvedValue({
        id: 'meal-entry-1',
        meal_type_id: 'custom-breakfast-id',
      });

      const result = await moveFoodEntryMealToMealType(
        'user-1',
        'user-1',
        'meal-entry-1',
        'custom-breakfast-id'
      );

      expect(result).toEqual({
        id: 'meal-entry-1',
        meal_type_id: 'custom-breakfast-id',
      });
      // The repository move is a single metadata-only transaction: no
      // component delete, no food/variant re-read, no bulk create.
      expect(
        foodEntryMealRepository.moveFoodEntryMealToMealType
      ).toHaveBeenCalledWith(
        'meal-entry-1',
        'custom-breakfast-id',
        'user-1',
        'user-1'
      );
      expect(
        foodRepository.deleteFoodEntryComponentsByFoodEntryMealId
      ).not.toHaveBeenCalled();
      expect(foodRepository.getFoodById).not.toHaveBeenCalled();
      expect(foodRepository.getFoodVariantById).not.toHaveBeenCalled();
      expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
    });
  });

  describe('updateFoodEntryMeal component dates', () => {
    it('preserves the write error and discards a client when rollback fails', async () => {
      const writeError = new Error('Original write failure');
      vi.mocked(
        foodEntryMealRepository.updateFoodEntryMeal
      ).mockRejectedValueOnce(writeError);
      transactionClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Connection lost'));

      await expect(
        updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
          notes: 'Edited note',
        })
      ).rejects.toBe(writeError);
      expect(transactionClient.release).toHaveBeenCalledWith(true);
    });

    it.each([undefined, '', '   '])(
      'rejects an unnamed detached snapshot (%s) before writes',
      async (foodName) => {
        await expect(
          updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
            foods: [
              {
                food_id: null,
                food_name: foodName,
                quantity: 100,
                serving_size: 100,
                calories: 165,
              },
            ],
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(
          foodEntryMealRepository.updateFoodEntryMeal
        ).not.toHaveBeenCalled();
      }
    );

    it.each(['parent', 'template', 'replacement'])(
      'rolls back the whole save when %s fails',
      async (failure) => {
        const error = new Error('Injected write failure');
        vi.mocked(
          foodEntryMealRepository.updateFoodEntryMeal
        ).mockResolvedValue({
          id: 'meal-entry-1',
          meal_type_id: 'dinner-id',
          entry_date: '2026-10-14',
          quantity: 1,
          unit: 'serving',
          entry_total_servings: 1,
        });
        if (failure === 'parent') {
          vi.mocked(
            foodEntryMealRepository.updateFoodEntryMeal
          ).mockRejectedValueOnce(error);
        } else if (failure === 'template') {
          vi.mocked(
            foodEntryMealRepository.updateFoodEntryMeal
          ).mockResolvedValue({
            id: 'meal-entry-1',
            meal_type_id: 'dinner-id',
            entry_date: '2026-10-14',
            meal_template_id: 'template-1',
            quantity: 1,
            unit: 'serving',
            entry_total_servings: null,
          });
          vi.mocked(mealRepository.getMealById).mockRejectedValueOnce(error);
        } else {
          vi.mocked(foodRepository.bulkCreateFoodEntries).mockRejectedValueOnce(
            error
          );
        }
        await expect(
          updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
            name: 'Edited name',
            foods: [
              {
                food_id: null,
                variant_id: null,
                food_name: 'Stored food',
                quantity: 100,
                serving_size: 100,
                calories: 165,
              },
            ],
          })
        ).rejects.toThrow('Injected write failure');
        expect(
          transactionClient.query.mock.calls.map((call) => call[0])
        ).toEqual(['BEGIN', 'ROLLBACK']);
        expect(transactionClient.release).toHaveBeenCalledTimes(1);
        expect(
          vi.mocked(foodEntryMealRepository.updateFoodEntryMeal).mock
            .calls[0][3]
        ).toBe(transactionClient);
        if (failure === 'replacement') {
          expect(
            vi.mocked(foodRepository.deleteFoodEntryComponentsByFoodEntryMealId)
              .mock.calls[0][2]
          ).toBe(transactionClient);
          expect(
            vi.mocked(foodRepository.bulkCreateFoodEntries).mock.calls[0][2]
          ).toEqual({ client: transactionClient });
        }
      }
    );

    it.each([
      [false, 'serving_size'],
      [false, 'calories'],
      [true, 'serving_size'],
      [true, 'calories'],
    ] as const)(
      'rejects an incomplete snapshot with inaccessible links=%s and missing %s before writes',
      async (linked, missingField) => {
        vi.mocked(foodRepository.getFoodById).mockResolvedValue(null);
        vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue(null);
        await expect(
          updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
            name: 'Edited name',
            foods: [
              {
                food_id: linked ? 'deleted-food' : null,
                variant_id: linked ? 'deleted-variant' : null,
                food_name: 'Stored food',
                quantity: 100,
                serving_size: 100,
                calories: 165,
                [missingField]: null,
              },
            ],
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(
          foodEntryMealRepository.updateFoodEntryMeal
        ).not.toHaveBeenCalled();
        expect(
          foodRepository.deleteFoodEntryComponentsByFoodEntryMealId
        ).not.toHaveBeenCalled();
        expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
      }
    );

    it.each([
      'serving_size',
      'calories',
      'protein',
      'carbs',
      'fat',
      'saturated_fat',
      'polyunsaturated_fat',
      'monounsaturated_fat',
      'trans_fat',
      'cholesterol',
      'sodium',
      'potassium',
      'dietary_fiber',
      'sugars',
      'vitamin_a',
      'vitamin_c',
      'calcium',
      'iron',
      'caffeine_mg',
      'water_ml',
      'alcohol_g',
      'quantity',
    ])('rejects invalid %s before any writes', async (field) => {
      for (const value of [
        'invalid',
        '',
        Infinity,
        NaN,
        -1,
        '-1',
        ...(field === 'serving_size'
          ? [0, '0', -1]
          : field === 'quantity'
            ? [-1]
            : []),
      ]) {
        await expect(
          updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
            name: 'Edited name',
            foods: [
              {
                food_name: 'Stored food',
                quantity: 100,
                serving_size: 100,
                calories: 165,
                [field]: value,
              },
            ],
          })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(
          foodEntryMealRepository.updateFoodEntryMeal
        ).not.toHaveBeenCalled();
        expect(
          foodRepository.deleteFoodEntryComponentsByFoodEntryMealId
        ).not.toHaveBeenCalled();
        expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
      }
    });

    it.each([false, true])(
      'preserves edited ingredient snapshots when library links are available: %s',
      async (linked) => {
        vi.mocked(
          foodEntryMealRepository.updateFoodEntryMeal
        ).mockResolvedValue({
          id: 'meal-entry-1',
          meal_type_id: 'breakfast-id',
          entry_date: '2026-06-19',
          quantity: 2,
          unit: 'serving',
          entry_total_servings: 4,
          legacy_serving_unit_math: false,
        });
        vi.mocked(foodRepository.getFoodById).mockResolvedValue(
          linked ? { id: 'food-1', name: 'Current food', brand: 'Brand' } : null
        );
        vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue(
          linked
            ? {
                id: 'variant-1',
                serving_size: 50,
                serving_unit: 'g',
                calories: 999,
              }
            : null
        );

        await updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
          quantity: 2,
          entry_total_servings: 4,
          foods: [
            {
              food_id: linked ? 'food-1' : null,
              variant_id: linked ? 'variant-1' : null,
              food_name: 'Logged chicken',
              quantity: linked ? 300 : '300',
              unit: 'g',
              serving_size: linked ? 100 : '100',
              serving_unit: 'g',
              calories: linked ? 165 : '165',
              protein: linked ? 31 : '31',
              sodium: 75,
              polyunsaturated_fat: 2,
              custom_nutrients: { choline: 90 },
            },
            {
              food_id: null,
              variant_id: null,
              food_name: 'Optional seasoning',
              quantity: 0,
              unit: 'g',
              serving_size: 100,
              serving_unit: 'g',
              calories: 0,
            },
          ],
        });

        expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              food_id: linked ? 'food-1' : null,
              variant_id: linked ? 'variant-1' : null,
              food_name: 'Logged chicken',
              quantity: 150,
              serving_size: 100,
              serving_unit: 'g',
              calories: 165,
              protein: 31,
              sodium: 75,
              polyunsaturated_fat: 2,
              custom_nutrients: { choline: 90 },
              entry_date: '2026-06-19',
            }),
            expect.objectContaining({
              food_id: null,
              variant_id: null,
              food_name: 'Optional seasoning',
              quantity: 0,
              serving_size: 100,
              calories: 0,
            }),
          ],
          'user-1',
          { client: transactionClient }
        );
      }
    );

    // entry_date was the one inherited field with no fallback to the stored
    // row. Omitting it sent undefined into the NOT NULL column, and because the
    // delete had already run the entry was left with no components at all.
    it('falls back to the stored entry_date when the update omits it', async () => {
      vi.mocked(foodEntryMealRepository.updateFoodEntryMeal).mockResolvedValue({
        id: 'meal-entry-1',
        meal_type_id: 'breakfast-id',
        entry_date: '2026-06-19',
        quantity: 1,
        unit: 'serving',
        entry_total_servings: 1,
        legacy_serving_unit_math: false,
      });

      vi.mocked(foodRepository.getFoodById).mockResolvedValue({
        id: 'food-1',
        name: 'Food',
        default_variant: { id: 'variant-1' },
      });
      vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
        id: 'variant-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 100,
      });

      await updateFoodEntryMeal('user-1', 'user-1', 'meal-entry-1', {
        name: 'Renamed',
        foods: [
          {
            food_id: 'food-1',
            variant_id: 'variant-1',
            quantity: 100,
            unit: 'g',
          },
        ],
      });

      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        [expect.objectContaining({ entry_date: '2026-06-19' })],
        'user-1',
        { client: transactionClient }
      );
    });
  });

  describe('snapshotted serving model', () => {
    it('snapshots entry_total_servings from template when logging', async () => {
      vi.mocked(mealRepository.getMealById).mockResolvedValue({
        id: 'template-soup',
        name: 'Big Pot Soup',
        serving_size: 250,
        serving_unit: 'ml',
        total_servings: 8,
        foods: [
          {
            food_id: 'broth',
            variant_id: 'broth-var',
            quantity: 2000,
            unit: 'ml',
          },
        ],
      });

      vi.mocked(foodRepository.getFoodById).mockResolvedValue({
        id: 'broth',
        name: 'Broth',
      });
      vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
        id: 'broth-var',
        serving_size: 100,
        serving_unit: 'ml',
        calories: 20,
      });

      vi.mocked(foodEntryMealRepository.createFoodEntryMeal).mockResolvedValue({
        id: 'entry-soup-1',
        user_id: 'user-1',
        meal_type_id: 'lunch-id',
        quantity: 500,
        unit: 'ml',
        entry_total_servings: 2000,
      });

      await createFoodEntryMeal('user-1', 'user-1', {
        meal_template_id: 'template-soup',
        meal_type_id: 'lunch-id',
        entry_date: '2026-09-01',
        quantity: 500,
        unit: 'ml',
        _clientMealModelVersion: 2,
      });

      // Assert snapshot field (250 * 8 = 2000 ml total yield) was saved into food_entry_meals repository
      expect(foodEntryMealRepository.createFoodEntryMeal).toHaveBeenCalledWith(
        expect.objectContaining({
          entry_total_servings: 2000,
          quantity: 500,
          unit: 'ml',
        }),
        'user-1'
      );

      // Denominator: 2000. Multiplier: 500 / 2000 = 0.25.
      // Whole dish broth: 2000 ml * 0.25 = 500 ml.
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            food_id: 'broth',
            quantity: 500,
          }),
        ],
        'user-1'
      );
    });

    it('unscales component foods using snapshotted yield without querying mealRepository', async () => {
      vi.mocked(foodEntryMealRepository.getFoodEntryMealById).mockResolvedValue(
        {
          id: 'entry-soup-1',
          user_id: 'user-1',
          meal_template_id: 'template-soup',
          quantity: 500,
          unit: 'ml',
          entry_total_servings: 2000,
          legacy_serving_unit_math: false,
        }
      );

      vi.mocked(
        foodRepository.getFoodEntryComponentsByFoodEntryMealId
      ).mockResolvedValue([
        {
          id: 'comp-1',
          food_id: 'broth',
          food_name: 'Broth',
          variant_id: 'broth-var',
          quantity: 500, // stored scaled quantity
          unit: 'ml',
          serving_size: 100,
          serving_unit: 'ml',
          calories: 100,
        },
      ]);

      const result = await getFoodEntryMealWithComponents(
        'user-1',
        'entry-soup-1'
      );

      // Stored multiplier = 500 / 2000 = 0.25.
      // Unscaled quantity = 500 / 0.25 = 2000 ml.
      expect(result?.foods[0].quantity).toBe(2000);

      // Verifies the snapshot was used without touching the live template
      expect(mealRepository.getMealById).not.toHaveBeenCalled();
    });

    it('unscales component foods correctly when original meal template was deleted', async () => {
      vi.mocked(foodEntryMealRepository.getFoodEntryMealById).mockResolvedValue(
        {
          id: 'entry-chaat-1',
          user_id: 'user-1',
          meal_template_id: null, // template was deleted
          quantity: 10,
          unit: 'g',
          entry_total_servings: 100,
          legacy_serving_unit_math: false,
        }
      );

      vi.mocked(
        foodRepository.getFoodEntryComponentsByFoodEntryMealId
      ).mockResolvedValue([
        {
          id: 'comp-sev',
          food_id: 'sev',
          food_name: 'Sev',
          variant_id: 'sev-var',
          quantity: 9.4, // stored scaled 10% quantity
          unit: 'g',
          serving_size: 100,
          serving_unit: 'g',
          calories: 520,
        },
      ]);

      const result = await getFoodEntryMealWithComponents(
        'user-1',
        'entry-chaat-1'
      );

      // Stored multiplier = 10 / 100 = 0.1.
      // Unscaled quantity = 9.4 / 0.1 = 94 g.
      expect(result?.foods[0].quantity).toBe(94);
    });
  });
});
