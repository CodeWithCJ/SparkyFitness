import { apiFetch } from './apiClient';
import type {
  FoodEntryMeal,
  FoodEntryMealCreateData,
  FoodEntryMealUpdateData,
} from '../../types/foodEntryMeals';

/**
 * Creates a logged meal (food_entry_meals row + N component food_entries).
 */
export const createFoodEntryMeal = async (
  payload: FoodEntryMealCreateData,
): Promise<FoodEntryMeal> => {
  return apiFetch<FoodEntryMeal>({
    endpoint: '/api/food-entry-meals',
    serviceName: 'FoodEntryMeals API',
    operation: 'create food entry meal',
    method: 'POST',
    body: payload,
  });
};

/**
 * Updates a logged meal and its component food entries.
 */
export const updateFoodEntryMeal = async (
  id: string,
  payload: FoodEntryMealUpdateData,
): Promise<FoodEntryMeal> => {
  return apiFetch<FoodEntryMeal>({
    endpoint: `/api/food-entry-meals/${id}`,
    serviceName: 'FoodEntryMeals API',
    operation: 'update food entry meal',
    method: 'PUT',
    body: payload,
  });
};

/**
 * Fetches a logged meal with its (unscaled) component foods.
 */
export const getFoodEntryMealWithComponents = async (
  id: string,
): Promise<FoodEntryMeal> => {
  return apiFetch<FoodEntryMeal>({
    endpoint: `/api/food-entry-meals/${id}`,
    serviceName: 'FoodEntryMeals API',
    operation: 'fetch food entry meal',
  });
};

/**
 * Deletes a logged meal (cascades to component food_entries on the server).
 */
export const deleteFoodEntryMeal = async (id: string): Promise<void> => {
  await apiFetch<void>({
    endpoint: `/api/food-entry-meals/${id}`,
    serviceName: 'FoodEntryMeals API',
    operation: 'delete food entry meal',
    method: 'DELETE',
  });
};
