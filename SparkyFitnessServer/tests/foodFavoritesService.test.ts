import { vi, beforeEach, describe, expect, it } from 'vitest';
import foodRepository from '../models/foodRepository.js';
import foodCoreService from '../services/foodCoreService.js';

vi.mock('../models/foodRepository');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const TEST_USER_ID = 'user-123';
const TEST_FOOD_ID = 'food-456';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const repo = foodRepository as any;

describe('foodCoreService favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addFoodFavorite', () => {
    it('verifies access then adds the favorite', async () => {
      // getFoodById (called internally) resolves when the food is accessible.
      repo.getFoodOwnerId.mockResolvedValue(TEST_USER_ID);
      repo.getFoodById.mockResolvedValue({ id: TEST_FOOD_ID, is_custom: true });
      repo.addFoodFavorite.mockResolvedValue(undefined);

      const result = await foodCoreService.addFoodFavorite(
        TEST_USER_ID,
        TEST_FOOD_ID
      );

      expect(repo.addFoodFavorite).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_FOOD_ID
      );
      expect(result).toEqual({ food_id: TEST_FOOD_ID, is_favorite: true });
    });

    it('throws and does not insert when the food is not accessible', async () => {
      repo.getFoodOwnerId.mockResolvedValue(null);
      repo.getFoodById.mockResolvedValue(null);

      await expect(
        foodCoreService.addFoodFavorite(TEST_USER_ID, TEST_FOOD_ID)
      ).rejects.toThrow('Food not found.');

      expect(repo.addFoodFavorite).not.toHaveBeenCalled();
    });
  });

  describe('removeFoodFavorite', () => {
    it('removes the favorite and reports the new state', async () => {
      repo.removeFoodFavorite.mockResolvedValue(true);

      const result = await foodCoreService.removeFoodFavorite(
        TEST_USER_ID,
        TEST_FOOD_ID
      );

      expect(repo.removeFoodFavorite).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_FOOD_ID
      );
      expect(result).toEqual({ food_id: TEST_FOOD_ID, is_favorite: false });
    });
  });
});
