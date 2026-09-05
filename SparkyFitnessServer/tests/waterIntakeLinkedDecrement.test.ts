import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import foodRepository from '../models/foodRepository.js';

vi.mock('../models/measurementRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/foodRepository');

describe('Linked Water Container Increment/Decrement (#2115)', () => {
  const mockUserId = 'test-user-123';
  const entryDate = '2026-09-05';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertWaterIntake - increment with linked food', () => {
    it('creates a linked food entry and records food_entry_id in water log', async () => {
      // @ts-expect-error TS mock
      waterContainerRepository.getWaterContainerById.mockResolvedValue({
        id: 10,
        name: 'Matcha Bowl',
        volume: '300.000',
        servings_per_container: 1,
        hydration_factor: 0.9,
        linked_food_id: 'food-uuid-1',
        linked_variant_id: 'var-uuid-1',
        linked_meal_type_id: 'meal-type-uuid-1',
      });

      // @ts-expect-error TS mock
      foodRepository.getFoodById.mockResolvedValue({
        id: 'food-uuid-1',
        name: 'Matcha Latte',
        default_variant: {
          id: 'var-uuid-1',
          calories: 120,
          protein: 4,
          carbs: 15,
          fat: 3,
          serving_size: 1,
          serving_unit: 'cup',
          water_ml: 240,
        },
      });

      // @ts-expect-error TS mock
      foodRepository.getFoodVariantById.mockResolvedValue({
        id: 'var-uuid-1',
        calories: 120,
        protein: 4,
        carbs: 15,
        fat: 3,
        serving_size: 1,
        serving_unit: 'cup',
        water_ml: 240,
      });

      // @ts-expect-error TS mock
      foodRepository.createFoodEntry.mockResolvedValue({
        id: 'created-food-entry-99',
      });

      // @ts-expect-error TS mock
      measurementRepository.getWaterIntakeByDate.mockResolvedValue({
        water_ml: 216,
        manual_ml: 216,
        food_ml: 0,
      });

      const res = await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      // Food entry was created with food nutrition snapshot
      expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          food_id: 'food-uuid-1',
          variant_id: 'var-uuid-1',
          meal_type_id: 'meal-type-uuid-1',
          calories: 120,
        }),
        mockUserId
      );

      // Water log entry was inserted with explicit water_ml * hydration_factor (240 * 0.9 = 216)
      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        216,
        10,
        'Matcha Bowl',
        'manual',
        null,
        'created-food-entry-99',
        0.9
      );

      expect(res).toEqual({
        water_ml: 216,
        manual_ml: 216,
        food_ml: 0,
      });
    });
  });

  describe('upsertWaterIntake - decrement with linked food', () => {
    it('deletes the linked food entry and returns removedFoodEntryIds', async () => {
      // @ts-expect-error TS mock
      measurementRepository.getWaterIntakeLogByDate.mockResolvedValue([
        {
          id: 'log-entry-1',
          food_entry_id: 'food-entry-to-remove-123',
          water_ml: 216,
        },
      ]);

      // @ts-expect-error TS mock
      measurementRepository.deleteWaterIntakeLog.mockResolvedValue({
        id: 'log-entry-1',
        food_entry_id: 'food-entry-to-remove-123',
      });

      // @ts-expect-error TS mock
      foodRepository.deleteFoodEntry.mockResolvedValue({ success: true });

      // @ts-expect-error TS mock
      measurementRepository.getWaterIntakeByDate.mockResolvedValue({
        water_ml: 0,
        manual_ml: 0,
        food_ml: 0,
      });

      const res = await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        -1,
        null
      );

      expect(measurementRepository.deleteWaterIntakeLog).toHaveBeenCalledWith(
        'log-entry-1',
        mockUserId
      );
      expect(foodRepository.deleteFoodEntry).toHaveBeenCalledWith(
        'food-entry-to-remove-123',
        mockUserId
      );

      expect(res).toEqual({
        water_ml: 0,
        manual_ml: 0,
        food_ml: 0,
        removedFoodEntryIds: ['food-entry-to-remove-123'],
      });
    });
  });
});
