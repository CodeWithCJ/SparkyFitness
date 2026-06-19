import { vi, beforeEach, describe, expect, it } from 'vitest';

// Mock all dependencies
vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodById: vi.fn(),
    getFoodVariantById: vi.fn(),
    bulkCreateFoodEntries: vi.fn(),
    deleteFoodEntryComponentsByFoodEntryMealId: vi.fn(),
  },
}));

vi.mock('../models/foodEntryMealRepository.js', () => ({
  default: {
    createFoodEntryMeal: vi.fn(),
    updateFoodEntryMeal: vi.fn(),
  },
}));

vi.mock('../services/mealService.js', () => ({
  default: {
    getMealById: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import {
  createFoodEntryMeal,
  updateFoodEntryMeal,
} from '../services/foodEntryService.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import mealService from '../services/mealService.js';

describe('foodEntryMealService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFoodEntryMeal', () => {
    it('inherits name and description from meal template if not provided', async () => {
      // Mock mealTemplate
      (mealService.getMealById as any).mockResolvedValue({
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
      (mealService.getMealById as any).mockResolvedValue({
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
      (mealService.getMealById as any).mockResolvedValue({
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
      ).toHaveBeenCalledWith('meal-entry-1', 'user-1');

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
        'user-1'
      );
    });
  });
});
