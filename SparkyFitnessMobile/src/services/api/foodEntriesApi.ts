import { apiFetch } from './apiClient';
import type { FoodEntry } from '../../types/foodEntries';

export interface CreateFoodEntryPayload {
  meal_type_id: string;
  quantity: number;
  unit: string;
  entry_date: string;
  // Linked food entry
  food_id?: string;
  variant_id?: string;
  // Standalone entry
  food_name?: string;
  brand_name?: string;
  serving_size?: number;
  serving_unit?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  saturated_fat?: number;
  sodium?: number;
  dietary_fiber?: number;
  sugars?: number;
  // Meal entry
  meal_id?: string;
}

/**
 * Creates a food entry.
 */
export const createFoodEntry = async (payload: CreateFoodEntryPayload): Promise<FoodEntry> => {
  return apiFetch<FoodEntry>({
    endpoint: '/api/food-entries/',
    serviceName: 'Food Entries API',
    operation: 'create food entry',
    method: 'POST',
    body: payload,
  });
};

/**
 * Deletes a food entry by ID.
 */
export const deleteFoodEntry = async (id: string): Promise<void> => {
  await apiFetch<void>({
    endpoint: `/api/food-entries/${id}`,
    serviceName: 'Food Entries API',
    operation: 'delete food entry',
    method: 'DELETE',
  });
};

/**
 * Fetches food entries for a given date.
 */
export const fetchFoodEntries = async (date: string): Promise<FoodEntry[]> => {
  return apiFetch<FoodEntry[]>({
    endpoint: `/api/food-entries/by-date/${date}`,
    serviceName: 'Food Entries API',
    operation: 'fetch food entries',
  });
};

/**
 * Calculates total calories consumed from food entries.
 * Formula: sum((entry.calories * quantity) / serving_size)
 */
export const calculateCaloriesConsumed = (entries: FoodEntry[]): number => {
  return entries.reduce((total, entry) => {
    if (entry.serving_size === 0) {
      return total;
    }
    return total + (entry.calories * entry.quantity) / entry.serving_size;
  }, 0);
};

/**
 * Calculates a macro nutrient total from food entries.
 * Uses same formula as calories: (value * quantity) / serving_size
 */
const calculateMacro = (entries: FoodEntry[], field: keyof FoodEntry): number => {
  return entries.reduce((total, entry) => {
    if (entry.serving_size === 0) {
      return total;
    }
    const value = entry[field];
    if (typeof value !== 'number') {
      return total;
    }
    return total + (value * entry.quantity) / entry.serving_size;
  }, 0);
};

export const calculateProtein = (entries: FoodEntry[]): number => calculateMacro(entries, 'protein');
export const calculateCarbs = (entries: FoodEntry[]): number => calculateMacro(entries, 'carbs');
export const calculateFat = (entries: FoodEntry[]): number => calculateMacro(entries, 'fat');
export const calculateFiber = (entries: FoodEntry[]): number => calculateMacro(entries, 'dietary_fiber');
