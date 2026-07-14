import foodCoreService from './foodCoreService.js';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';

// Unified favorites across foods and meals. Foods and meals are returned as two
// arrays (each item carries a `favorited_at`) so the client can render them with
// their existing row components and interleave them into one recency-ordered list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFavorites(authenticatedUserId: any) {
  const [favoriteFoods, favoriteMeals] = await Promise.all([
    foodRepository.getFavoriteFoods(authenticatedUserId),
    mealRepository.getFavoriteMeals(authenticatedUserId),
  ]);
  return { favoriteFoods, favoriteMeals };
}

async function addFavorite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any
) {
  if (type === 'food') {
    // foodCoreService.addFoodFavorite verifies access before inserting.
    await foodCoreService.addFoodFavorite(authenticatedUserId, id);
    return { type: 'food', id, is_favorite: true };
  }
  if (type === 'meal') {
    // getMealById is RLS-scoped, so a null result means the meal is not
    // accessible to this user (mirrors the food access check).
    const meal = await mealRepository.getMealById(id, authenticatedUserId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    await mealRepository.addMealFavorite(authenticatedUserId, id);
    return { type: 'meal', id, is_favorite: true };
  }
  throw new Error('Invalid favorite type.');
}

async function removeFavorite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any
) {
  if (type === 'food') {
    await foodCoreService.removeFoodFavorite(authenticatedUserId, id);
    return { type: 'food', id, is_favorite: false };
  }
  if (type === 'meal') {
    await mealRepository.removeMealFavorite(authenticatedUserId, id);
    return { type: 'meal', id, is_favorite: false };
  }
  throw new Error('Invalid favorite type.');
}

export { getFavorites, addFavorite, removeFavorite };
export default { getFavorites, addFavorite, removeFavorite };
