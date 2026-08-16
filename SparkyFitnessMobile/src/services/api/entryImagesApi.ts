import { apiFetch } from './apiClient';
import { postImageMultipart } from './imageUploadClient';
import type { FoodEntry } from '../../types/foodEntries';
import type { FoodEntryMeal } from '../../types/foodEntryMeals';

/**
 * Per-entry override photos for the diary.
 *
 * These write only to the entry row. The parent food or meal template is never
 * touched, which is what lets one logged serving carry its own picture while
 * every other entry of the same food keeps falling back to the library photo.
 */

export const setFoodEntryImages = async (
  entryId: string,
  order: string[],
  newUris: string[],
): Promise<FoodEntry> =>
  postImageMultipart<FoodEntry>({
    endpoint: `/api/food-entries/${entryId}/image`,
    serviceName: 'Food Entries API',
    operation: 'set entry image',
    order,
    newUris,
  });

export const clearFoodEntryImage = async (entryId: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/food-entries/${entryId}/image`,
    serviceName: 'Food Entries API',
    operation: 'clear entry image',
    method: 'DELETE',
  });

export const setFoodEntryMealImages = async (
  entryId: string,
  order: string[],
  newUris: string[],
): Promise<FoodEntryMeal> =>
  postImageMultipart<FoodEntryMeal>({
    endpoint: `/api/food-entry-meals/${entryId}/image`,
    serviceName: 'Food Entry Meals API',
    operation: 'set logged meal image',
    order,
    newUris,
  });

export const clearFoodEntryMealImage = async (
  entryId: string,
): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/food-entry-meals/${entryId}/image`,
    serviceName: 'Food Entry Meals API',
    operation: 'clear logged meal image',
    method: 'DELETE',
  });
