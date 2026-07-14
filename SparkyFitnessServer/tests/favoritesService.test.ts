import { vi, beforeEach, describe, expect, it } from 'vitest';
import foodCoreService from '../services/foodCoreService.js';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';
import favoritesService from '../services/favoritesService.js';

vi.mock('../services/foodCoreService');
vi.mock('../models/foodRepository');
vi.mock('../models/mealRepository');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const USER = 'user-123';
const FOOD_ID = 'food-456';
const MEAL_ID = 'meal-789';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const foodSvc = foodCoreService as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const foodRepo = foodRepository as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mealRepo = mealRepository as any;

describe('favoritesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFavorites', () => {
    it('returns foods and meals from their repositories', async () => {
      const foods = [{ id: FOOD_ID, favorited_at: '2026-07-08T00:00:00Z' }];
      const meals = [{ id: MEAL_ID, favorited_at: '2026-07-07T00:00:00Z' }];
      foodRepo.getFavoriteFoods.mockResolvedValue(foods);
      mealRepo.getFavoriteMeals.mockResolvedValue(meals);

      const result = await favoritesService.getFavorites(USER);

      expect(foodRepo.getFavoriteFoods).toHaveBeenCalledWith(USER);
      expect(mealRepo.getFavoriteMeals).toHaveBeenCalledWith(USER);
      expect(result).toEqual({ favoriteFoods: foods, favoriteMeals: meals });
    });
  });

  describe('addFavorite', () => {
    it('adds a food favorite via the access-checked food service', async () => {
      foodSvc.addFoodFavorite.mockResolvedValue({
        food_id: FOOD_ID,
        is_favorite: true,
      });

      const result = await favoritesService.addFavorite(USER, 'food', FOOD_ID);

      expect(foodSvc.addFoodFavorite).toHaveBeenCalledWith(USER, FOOD_ID);
      expect(result).toEqual({ type: 'food', id: FOOD_ID, is_favorite: true });
    });

    it('adds a meal favorite after verifying access', async () => {
      mealRepo.getMealById.mockResolvedValue({
        id: MEAL_ID,
        name: 'Breakfast',
      });
      mealRepo.addMealFavorite.mockResolvedValue(undefined);

      const result = await favoritesService.addFavorite(USER, 'meal', MEAL_ID);

      expect(mealRepo.getMealById).toHaveBeenCalledWith(MEAL_ID, USER);
      expect(mealRepo.addMealFavorite).toHaveBeenCalledWith(USER, MEAL_ID);
      expect(result).toEqual({ type: 'meal', id: MEAL_ID, is_favorite: true });
    });

    it('throws and does not insert when the meal is not accessible', async () => {
      mealRepo.getMealById.mockResolvedValue(undefined);

      await expect(
        favoritesService.addFavorite(USER, 'meal', MEAL_ID)
      ).rejects.toThrow('Meal not found.');
      expect(mealRepo.addMealFavorite).not.toHaveBeenCalled();
    });

    it('rejects an unknown favorite type', async () => {
      await expect(
        favoritesService.addFavorite(USER, 'exercise', 'x-1')
      ).rejects.toThrow('Invalid favorite type.');
    });
  });

  describe('removeFavorite', () => {
    it('removes a food favorite', async () => {
      foodSvc.removeFoodFavorite.mockResolvedValue({
        food_id: FOOD_ID,
        is_favorite: false,
      });

      const result = await favoritesService.removeFavorite(
        USER,
        'food',
        FOOD_ID
      );

      expect(foodSvc.removeFoodFavorite).toHaveBeenCalledWith(USER, FOOD_ID);
      expect(result).toEqual({ type: 'food', id: FOOD_ID, is_favorite: false });
    });

    it('removes a meal favorite', async () => {
      mealRepo.removeMealFavorite.mockResolvedValue(true);

      const result = await favoritesService.removeFavorite(
        USER,
        'meal',
        MEAL_ID
      );

      expect(mealRepo.removeMealFavorite).toHaveBeenCalledWith(USER, MEAL_ID);
      expect(result).toEqual({ type: 'meal', id: MEAL_ID, is_favorite: false });
    });
  });
});
