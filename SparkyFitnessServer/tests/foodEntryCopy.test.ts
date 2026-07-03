import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  copyFoodEntriesFromUser,
  copyFoodEntriesToUser,
} from '../services/foodEntryService.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';

vi.mock('../models/familyAccessRepository');
vi.mock('../models/foodRepository');
vi.mock('../models/foodEntryMealRepository');
vi.mock('../models/mealType');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const ACTOR_A = 'actor-a';
const MEMBER_B = 'member-b';

describe('foodEntryService symmetrical cross-user copy tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('copyFoodEntriesFromUser', () => {
    it('throws Forbidden error when family permissions check fails', async () => {
      // Mock checkCopyPermissions to return false
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        false
      );

      await expect(
        copyFoodEntriesFromUser(
          ACTOR_A,
          ACTOR_A,
          MEMBER_B,
          '2026-06-17',
          'Lunch',
          '2026-06-17',
          'Lunch'
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permissions to copy from this family member.'
      );
    });

    it('successfully copies food entries from family user B to actor A when permissions exist', async () => {
      // Mock permissions to be active
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );

      // Mock mealType resolution
      vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
        { id: 'meal-type-lunch-id', name: 'Lunch' },
      ]);

      // Mock source food entries returned from B
      const mockEntries = [
        {
          id: 'entry-1',
          food_id: 'food-abc',
          variant_id: 'variant-xyz',
          quantity: 1.5,
          unit: 'serving',
          food_name: 'Banana',
          brand_name: 'Fresh',
          serving_size: 1,
          serving_unit: 'piece',
          calories: 105,
          protein: 1.3,
          carbs: 27,
          fat: 0.3,
          saturated_fat: 0.1,
          polyunsaturated_fat: 0.1,
          monounsaturated_fat: 0.1,
          trans_fat: 0,
          cholesterol: 0,
          sodium: 1,
          potassium: 422,
          dietary_fiber: 3.1,
          sugars: 14,
          vitamin_a: 1,
          vitamin_c: 10,
          calcium: 6,
          iron: 0.3,
          glycemic_index: 51,
          custom_nutrients: {},
        },
      ];
      vi.mocked(
        foodRepository.getFoodEntriesByDateAndMealType
      ).mockResolvedValue(mockEntries);

      // Mock duplicate check returning nothing
      vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
        undefined
      );

      // Mock bulkCreate
      const mockResult = [
        { id: 'entry-copied-1', user_id: ACTOR_A, food_id: 'food-abc' },
      ];
      vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue(
        mockResult
      );

      const result = await copyFoodEntriesFromUser(
        ACTOR_A,
        ACTOR_A,
        MEMBER_B,
        '2026-06-17',
        'Lunch',
        '2026-06-17',
        'Lunch'
      );

      expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
        ACTOR_A,
        MEMBER_B
      );
      expect(
        foodRepository.getFoodEntriesByDateAndMealType
      ).toHaveBeenCalledWith(MEMBER_B, '2026-06-17', 'Lunch');
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: ACTOR_A,
            food_id: 'food-abc',
            food_name: 'Banana',
          }),
        ]),
        ACTOR_A
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('copyFoodEntriesToUser', () => {
    it('throws Forbidden error when family permissions check fails', async () => {
      // Mock checkCopyPermissions to return false
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        false
      );

      await expect(
        copyFoodEntriesToUser(
          ACTOR_A,
          ACTOR_A,
          MEMBER_B,
          '2026-06-17',
          'Lunch',
          '2026-06-17',
          'Lunch'
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permissions to copy to this family member.'
      );
    });

    it('successfully copies food entries from actor A to family user B when permissions exist', async () => {
      // Mock permissions to be active
      vi.mocked(familyAccessRepository.checkCopyPermissions).mockResolvedValue(
        true
      );

      // Mock mealType resolution for target user B
      vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
        { id: 'meal-type-lunch-id', name: 'Lunch' },
      ]);

      // Mock source food entries returned from A
      const mockEntries = [
        {
          id: 'entry-2',
          food_id: 'food-def',
          variant_id: 'variant-uvw',
          quantity: 2,
          unit: 'slice',
          food_name: 'Apple',
          brand_name: 'Organic',
          serving_size: 1,
          serving_unit: 'piece',
          calories: 95,
          protein: 0.5,
          carbs: 25,
          fat: 0.3,
          saturated_fat: 0,
          polyunsaturated_fat: 0,
          monounsaturated_fat: 0,
          trans_fat: 0,
          cholesterol: 0,
          sodium: 2,
          potassium: 195,
          dietary_fiber: 4.4,
          sugars: 19,
          vitamin_a: 2,
          vitamin_c: 8,
          calcium: 6,
          iron: 0.1,
          glycemic_index: 39,
          custom_nutrients: {},
        },
      ];
      vi.mocked(
        foodRepository.getFoodEntriesByDateAndMealType
      ).mockResolvedValue(mockEntries);

      // Mock duplicate check returning nothing
      vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
        undefined
      );

      // Mock bulkCreate for B
      const mockResult = [
        { id: 'entry-copied-2', user_id: MEMBER_B, food_id: 'food-def' },
      ];
      vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue(
        mockResult
      );

      const result = await copyFoodEntriesToUser(
        ACTOR_A,
        ACTOR_A,
        MEMBER_B,
        '2026-06-17',
        'Lunch',
        '2026-06-17',
        'Lunch'
      );

      expect(familyAccessRepository.checkCopyPermissions).toHaveBeenCalledWith(
        ACTOR_A,
        MEMBER_B
      );
      expect(
        foodRepository.getFoodEntriesByDateAndMealType
      ).toHaveBeenCalledWith(ACTOR_A, '2026-06-17', 'Lunch');
      expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: MEMBER_B,
            food_id: 'food-def',
            food_name: 'Apple',
          }),
        ]),
        MEMBER_B
      );
      expect(result).toEqual(mockResult);
    });
  });
});
