import type { ServerConfig } from '../storage';
import { apiFetch } from './apiClient';
import { CACHE_COLLECTIONS } from '../../offline/collections';
import { putCacheRows } from '../../offline/cacheStore';
import { readSavedLoggedMeal } from '../../offline/loggedMeals';
import { withOfflineFallback } from '../../offline/withOfflineFallback';
import type {
  FoodPhotoLogRequest,
  FoodPhotoLogResponse,
} from '@workspace/shared';
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
  serverConfig?: ServerConfig
): Promise<FoodEntryMeal> => {
  return apiFetch<FoodEntryMeal>({
    endpoint: '/api/food-entry-meals',
    serviceName: 'FoodEntryMeals API',
    operation: 'create food entry meal',
    method: 'POST',
    body: payload,
    serverConfig,
  });
};

export const fetchFoodEntryMealsByDate = async (
  date: string
): Promise<FoodEntryMeal[]> => {
  return apiFetch<FoodEntryMeal[]>({
    endpoint: `/api/food-entry-meals/by-date/${encodeURIComponent(date)}`,
    serviceName: 'FoodEntryMeals API',
    operation: 'fetch food entry meals by date',
  });
};

/**
 * Updates a logged meal and its component food entries.
 */
export const updateFoodEntryMeal = async (
  id: string,
  payload: FoodEntryMealUpdateData,
  serverConfig?: ServerConfig
): Promise<FoodEntryMeal> => {
  return apiFetch<FoodEntryMeal>({
    endpoint: `/api/food-entry-meals/${id}`,
    serviceName: 'FoodEntryMeals API',
    operation: 'update food entry meal',
    method: 'PUT',
    body: payload,
    serverConfig,
  });
};

/**
 * Fetches a logged meal with its (unscaled) component foods.
 */
export const getFoodEntryMealWithComponents = async (
  id: string
): Promise<FoodEntryMeal> => {
  return withOfflineFallback<FoodEntryMeal>({
    fetch: () =>
      apiFetch<FoodEntryMeal>({
        endpoint: `/api/food-entry-meals/${id}`,
        serviceName: 'FoodEntryMeals API',
        operation: 'fetch food entry meal',
      }),
    store: (db, serverConfigId, meal) =>
      putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.loggedMeal, [
        { key: id, name: meal.name, payload: meal },
      ]),
    read: (db, serverConfigId) => readSavedLoggedMeal(db, serverConfigId, id),
  });
};

/**
 * Deletes a logged meal (cascades to component food_entries on the server).
 */
export const deleteFoodEntryMeal = async (
  id: string,
  serverConfig?: ServerConfig
): Promise<void> => {
  await apiFetch<void>({
    endpoint: `/api/food-entry-meals/${id}`,
    serviceName: 'FoodEntryMeals API',
    operation: 'delete food entry meal',
    method: 'DELETE',
    serverConfig,
  });
};

/**
 * Logs a reviewed AI photo estimate in one transactional request.
 *
 * `X-Meal-Model-Version: 2` marks this client as being on the current serving
 * model, matching every other logged-meal write.
 */
export const createPhotoLoggedMeal = async (
  payload: FoodPhotoLogRequest
): Promise<FoodPhotoLogResponse> => {
  return apiFetch<FoodPhotoLogResponse>({
    endpoint: '/api/food-entry-meals/from-photo-estimate',
    serviceName: 'FoodEntryMeals API',
    operation: 'log food photo estimate',
    method: 'POST',
    headers: { 'X-Meal-Model-Version': '2' },
    body: payload,
  });
};
