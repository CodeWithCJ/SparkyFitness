import { apiFetch } from './apiClient';
import type { FoodEntry } from '../../types/foodEntries';

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
