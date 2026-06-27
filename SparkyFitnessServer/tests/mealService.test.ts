import { vi, beforeEach, describe, expect, it } from 'vitest';

// Mock all repository / cross-service dependencies BEFORE importing the service.
vi.mock('../models/mealRepository.js', () => ({
  default: {
    createMeal: vi.fn(),
    getMeals: vi.fn(),
    getMealById: vi.fn(),
    updateMeal: vi.fn(),
    deleteMeal: vi.fn(),
    createMealPlanEntry: vi.fn(),
    getMealPlanEntries: vi.fn(),
    getMealPlanEntryById: vi.fn(),
    updateMealPlanEntry: vi.fn(),
    deleteMealPlanEntry: vi.fn(),
    deleteMealPlanEntriesByTemplateId: vi.fn(),
    createFoodEntryFromMealPlan: vi.fn(),
    getMealOwnerId: vi.fn(),
    getMealPlanOwnerId: vi.fn(),
    searchMeals: vi.fn(),
    getRecentMeals: vi.fn(),
    getTopMeals: vi.fn(),
    getPublicMeals: vi.fn(),
    getFamilyMeals: vi.fn(),
    getMealDeletionImpact: vi.fn(),
    deleteMealPlanEntriesByMealId: vi.fn(),
    getMealsNeedingReview: vi.fn(),
    updateMealEntriesSnapshot: vi.fn(),
    clearUserIgnoredUpdate: vi.fn(),
  },
}));
vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodById: vi.fn(),
    getFoodVariantsByFoodId: vi.fn(),
  },
}));
vi.mock('../models/foodEntry.js', () => ({
  default: {
    getFoodEntriesByDateAndMealType: vi.fn(),
  },
}));
vi.mock('../models/mealPlanTemplateRepository.js', () => ({
  default: {
    getMealPlanTemplatesByMealId: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('./mealPlanTemplateService.js', () => ({ default: {} }));
vi.mock('../services/mealPlanTemplateService.js', () => ({ default: {} }));
vi.mock('../models/mealType.js', () => ({
  default: { getAllMealTypes: vi.fn().mockResolvedValue([]) },
}));

import mealService from '../services/mealService.js';
import mealRepository from '../models/mealRepository.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryRepository from '../models/foodEntry.js';

describe('mealService validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Regression: review fix #1 — the server must reject invalid input even if
  // a (mis)behaving client somehow sends 0/negative values past its own checks.
  describe('createMeal', () => {
    it('throws ValidationError when total_servings is zero', async () => {
      await expect(
        mealService.createMeal('user-1', {
          name: 'Bad',
          total_servings: 0,
          foods: [],
        })
      ).rejects.toMatchObject({
        name: 'ValidationError',
        message: expect.stringContaining('total_servings'),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mealRepository as any).createMeal).not.toHaveBeenCalled();
    });

    it('throws ValidationError when total_servings is negative', async () => {
      await expect(
        mealService.createMeal('user-1', {
          name: 'Bad',
          total_servings: -2,
          foods: [],
        })
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('throws ValidationError when serving_size is zero', async () => {
      await expect(
        mealService.createMeal('user-1', {
          name: 'Bad',
          serving_unit: 'ml',
          serving_size: 0,
          total_servings: 4,
          foods: [],
        })
      ).rejects.toMatchObject({
        name: 'ValidationError',
        message: expect.stringContaining('serving_size'),
      });
    });

    it('throws ValidationError when total_servings is non-numeric', async () => {
      await expect(
        mealService.createMeal('user-1', {
          name: 'Bad',
          total_servings: 'not-a-number',
          foods: [],
        })
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('defaults serving_size and total_servings to 1 when missing on create', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).createMeal.mockResolvedValue({
        id: 'new-id',
        serving_size: 1,
        serving_unit: 'serving',
        total_servings: 1,
      });
      await mealService.createMeal('user-1', { name: 'OK', foods: [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).createMeal.mock.calls[0][0];
      expect(payload.serving_size).toBe(1.0);
      expect(payload.total_servings).toBe(1.0);
      expect(payload.serving_unit).toBe('serving');
    });

    it('forces serving_size to 1 when serving_unit is "serving" (defensive normalize)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).createMeal.mockResolvedValue({
        id: 'new-id',
        serving_size: 1,
        serving_unit: 'serving',
        total_servings: 8,
      });
      // Client sent a stale serving_size=8 with unit='serving'; server should
      // collapse to 1 because one serving = one serving (tautological).
      await mealService.createMeal('user-1', {
        name: 'Casserole',
        serving_unit: 'serving',
        serving_size: 8,
        total_servings: 8,
        foods: [],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).createMeal.mock.calls[0][0];
      expect(payload.serving_size).toBe(1);
      expect(payload.total_servings).toBe(8);
    });

    // Backwards compatibility: old mobile clients send
    // { serving_unit: 'serving', serving_size: 4 } intending yield = 4,
    // and don't include total_servings. The shim detects this shape and
    // rewrites to the new model (total_servings = 4, serving_size = 1).
    it('rewrites legacy-client payload (serving_unit=serving + serving_size>1 + no total_servings)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).createMeal.mockResolvedValue({
        id: 'new-id',
        serving_size: 1,
        serving_unit: 'serving',
        total_servings: 4,
      });
      await mealService.createMeal('user-1', {
        name: 'Old-client casserole',
        serving_unit: 'serving',
        serving_size: 4,
        // total_servings intentionally omitted
        foods: [],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).createMeal.mock.calls[0][0];
      expect(payload.serving_size).toBe(1);
      expect(payload.total_servings).toBe(4);
    });

    it('does not trigger legacy shim when total_servings is explicit (new client)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).createMeal.mockResolvedValue({
        id: 'new-id',
        serving_size: 1,
        serving_unit: 'serving',
        total_servings: 4,
      });
      // New client sends serving_size=1 + total_servings=4 explicitly. The
      // shim's serving_size > 1 guard means it won't fire here.
      await mealService.createMeal('user-1', {
        name: 'New-client casserole',
        serving_unit: 'serving',
        serving_size: 1,
        total_servings: 4,
        foods: [],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).createMeal.mock.calls[0][0];
      expect(payload.serving_size).toBe(1);
      expect(payload.total_servings).toBe(4);
    });

    it('does not trigger legacy shim for non-serving units', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).createMeal.mockResolvedValue({
        id: 'new-id',
        serving_size: 1000,
        serving_unit: 'ml',
        total_servings: 1,
      });
      // Old non-serving meal: serving_size=1000 ml interpreted as the whole
      // recipe quantity. Shim should NOT rewrite (unit ≠ 'serving').
      await mealService.createMeal('user-1', {
        name: 'Old-client smoothie',
        serving_unit: 'ml',
        serving_size: 1000,
        foods: [],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).createMeal.mock.calls[0][0];
      expect(payload.serving_size).toBe(1000);
      expect(payload.total_servings).toBe(1);
    });
  });

  describe('updateMeal', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).getMealById.mockResolvedValue({
        id: 'meal-1',
        user_id: 'user-1',
        foods: [],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).updateMeal.mockResolvedValue({ id: 'meal-1' });
    });

    it('throws ValidationError when total_servings is zero on update', async () => {
      await expect(
        mealService.updateMeal('user-1', 'meal-1', { total_servings: 0 })
      ).rejects.toMatchObject({ name: 'ValidationError' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mealRepository as any).updateMeal).not.toHaveBeenCalled();
    });

    it('forces serving_size to 1 when serving_unit is switched to "serving"', async () => {
      await mealService.updateMeal('user-1', 'meal-1', {
        serving_unit: 'serving',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).updateMeal.mock.calls[0][2];
      expect(payload.serving_size).toBe(1);
    });
  });

  describe('createMealFromDiaryEntries', () => {
    it('routes diary-created meals through create-time serving normalization', async () => {
      const mockedFoodEntryRepository = foodEntryRepository as unknown as {
        getFoodEntriesByDateAndMealType: {
          mockResolvedValue: (value: unknown) => void;
        };
      };
      const mockedFoodRepository = foodRepository as unknown as {
        getFoodById: { mockResolvedValue: (value: unknown) => void };
      };

      mockedFoodEntryRepository.getFoodEntriesByDateAndMealType.mockResolvedValue(
        [
          {
            food_id: 'food-1',
            food_name: 'Chicken',
            variant_id: 'variant-1',
            quantity: 1,
            unit: 'cup',
            custom_nutrients: {},
          },
        ]
      );
      mockedFoodRepository.getFoodById.mockResolvedValue({
        id: 'food-1',
        default_variant: { id: 'variant-1' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).createMeal.mockResolvedValue({
        id: 'new-meal',
        serving_size: 1,
        serving_unit: 'serving',
        total_servings: 1,
      });

      await mealService.createMealFromDiaryEntries(
        'user-1',
        '2026-05-17',
        'breakfast',
        'Breakfast meal',
        null,
        false
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).createMeal.mock.calls[0][0];
      expect(payload.serving_size).toBe(1);
      expect(payload.serving_unit).toBe('serving');
      expect(payload.total_servings).toBe(1);
      expect(payload.foods).toEqual([
        expect.objectContaining({
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 1,
          unit: 'cup',
        }),
      ]);
    });

    it('validates a non-default food variant by calling getFoodVariantsByFoodId', async () => {
      const mockedFoodEntryRepository = foodEntryRepository as unknown as {
        getFoodEntriesByDateAndMealType: {
          mockResolvedValue: (value: unknown) => void;
        };
      };
      const mockedFoodRepository = foodRepository as unknown as {
        getFoodById: { mockResolvedValue: (value: unknown) => void };
        getFoodVariantsByFoodId: {
          mockResolvedValue: (value: unknown) => void;
        };
      };

      mockedFoodEntryRepository.getFoodEntriesByDateAndMealType.mockResolvedValue(
        [
          {
            food_id: 'food-1',
            food_name: 'Chicken',
            variant_id: 'variant-non-default',
            quantity: 1,
            unit: 'cup',
            custom_nutrients: {},
          },
        ]
      );
      mockedFoodRepository.getFoodById.mockResolvedValue({
        id: 'food-1',
        default_variant: { id: 'variant-1' },
      });
      mockedFoodRepository.getFoodVariantsByFoodId.mockResolvedValue([
        { id: 'variant-1' },
        { id: 'variant-non-default' },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mealRepository as any).createMeal.mockResolvedValue({
        id: 'new-meal',
        serving_size: 1,
        serving_unit: 'serving',
        total_servings: 1,
      });

      await mealService.createMealFromDiaryEntries(
        'user-1',
        '2026-05-17',
        'breakfast',
        'Breakfast meal',
        null,
        false
      );

      expect(mockedFoodRepository.getFoodVariantsByFoodId).toHaveBeenCalledWith(
        'food-1',
        'user-1'
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (mealRepository as any).createMeal.mock.calls[0][0];
      expect(payload.foods).toEqual([
        expect.objectContaining({
          food_id: 'food-1',
          variant_id: 'variant-non-default',
        }),
      ]);
    });

    it('skips a food entry if its variant_id does not exist in the database', async () => {
      const mockedFoodEntryRepository = foodEntryRepository as unknown as {
        getFoodEntriesByDateAndMealType: {
          mockResolvedValue: (value: unknown) => void;
        };
      };
      const mockedFoodRepository = foodRepository as unknown as {
        getFoodById: { mockResolvedValue: (value: unknown) => void };
        getFoodVariantsByFoodId: {
          mockResolvedValue: (value: unknown) => void;
        };
      };

      mockedFoodEntryRepository.getFoodEntriesByDateAndMealType.mockResolvedValue(
        [
          {
            food_id: 'food-1',
            food_name: 'Chicken',
            variant_id: 'variant-non-existent',
            quantity: 1,
            unit: 'cup',
            custom_nutrients: {},
          },
        ]
      );
      mockedFoodRepository.getFoodById.mockResolvedValue({
        id: 'food-1',
        default_variant: { id: 'variant-1' },
      });
      mockedFoodRepository.getFoodVariantsByFoodId.mockResolvedValue([
        { id: 'variant-1' },
      ]);

      await expect(
        mealService.createMealFromDiaryEntries(
          'user-1',
          '2026-05-17',
          'breakfast',
          'Breakfast meal',
          null,
          false
        )
      ).rejects.toThrow('The following foods or their variants are missing');
    });
  });
});
