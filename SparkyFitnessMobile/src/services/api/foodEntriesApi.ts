import { apiFetch } from './apiClient';
import { ApiError } from './errors';
import type { FoodEntry } from '../../types/foodEntries';
import type { ServerConfig } from '../storage';
import type {
  LastCookedFoodEntry,
  LastCookedFoodEntryResponse,
  CopyReviewedFoodEntriesFromUserPayload,
  CopySelectedFoodEntriesFromUserPayload,
  CopyReviewedFoodEntriesToUserPayload,
  CopySelectedFoodEntriesToUserPayload,
} from '@workspace/shared';

export interface CreateFoodEntryPayload {
  meal_type_id: string;
  quantity: number;
  unit: string;
  entry_date: string;
  entry_time?: string | null;
  /** Per-occurrence markdown note; never derived from the food's own note. */
  notes?: string | null;
  /** Cooked weight eaten, in `unit`; `quantity` is then the raw weight. */
  cooked_quantity?: number | null;
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
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  sodium?: number;
  dietary_fiber?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  caffeine_mg?: number;
  water_ml?: number;
  alcohol_g?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number> | null;
  // Meal entry
  meal_id?: string;
  /**
   * Replay key (uuid). The server answers a repeat of the same key with the
   * entry it already stored and logs nothing, so a request sent again after a
   * lost answer cannot log twice.
   */
  client_id?: string;
}

/**
 * Fetches every food entry in an inclusive `YYYY-MM-DD` range.
 */
export const fetchFoodEntriesRange = async (
  startDate: string,
  endDate: string
): Promise<FoodEntry[]> => {
  return apiFetch<FoodEntry[]>({
    endpoint: `/api/food-entries/range/${encodeURIComponent(
      startDate
    )}/${encodeURIComponent(endDate)}`,
    serviceName: 'Food Entries API',
    operation: 'fetch food entries range',
  });
};

/**
 * Creates a food entry.
 */
export const createFoodEntry = async (
  payload: CreateFoodEntryPayload,
  /** Send to this server, not whichever is active when the request goes out. */
  serverConfig?: ServerConfig
): Promise<FoodEntry> => {
  return apiFetch<FoodEntry>({
    endpoint: '/api/food-entries/',
    serviceName: 'Food Entries API',
    operation: 'create food entry',
    method: 'POST',
    body: payload,
    serverConfig,
  });
};

export interface UpdateFoodEntryPayload {
  quantity?: number;
  unit?: string;
  meal_type_id?: string;
  variant_id?: string;
  entry_date?: string;
  entry_time?: string | null;
  /** Omit to leave the stored note alone; send null to clear it. */
  notes?: string | null;
  /**
   * Cooked weight eaten, in `unit`. Send it with every quantity or unit
   * change: the server clears it when either changes without it.
   */
  cooked_quantity?: number | null;
  // Nutrition snapshot overrides (server applies to entry snapshot)
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
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  caffeine_mg?: number;
  water_ml?: number;
  alcohol_g?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  custom_nutrients?: Record<string, string | number> | null;
}

/**
 * The last entry of a food that was weighed cooked, used to pre-fill the
 * batch yield (#3534). Null when there is none, and on a server that predates
 * the endpoint.
 */
export const fetchLastCookedFoodEntry = async (
  foodId: string
): Promise<LastCookedFoodEntry | null> => {
  try {
    const response = await apiFetch<LastCookedFoodEntryResponse>({
      endpoint: `/api/food-entries/last-cooked?food_id=${encodeURIComponent(
        foodId
      )}`,
      serviceName: 'Food Entries API',
      operation: 'fetch last cooked food entry',
    });
    return response?.entry ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) return null;
    throw error;
  }
};

/**
 * Updates a food entry by ID.
 */
export const updateFoodEntry = async (
  id: string,
  payload: UpdateFoodEntryPayload,
  serverConfig?: ServerConfig
): Promise<FoodEntry> => {
  return apiFetch<FoodEntry>({
    endpoint: `/api/food-entries/${id}`,
    serviceName: 'Food Entries API',
    operation: 'update food entry',
    method: 'PUT',
    body: payload,
    serverConfig,
  });
};

/**
 * Deletes a food entry by ID.
 */
export const deleteFoodEntry = async (
  id: string,
  serverConfig?: ServerConfig
): Promise<void> => {
  await apiFetch<void>({
    endpoint: `/api/food-entries/${id}`,
    serviceName: 'Food Entries API',
    operation: 'delete food entry',
    method: 'DELETE',
    serverConfig,
  });
};

export interface CopyFoodEntriesPayload {
  sourceDate: string;
  sourceMealType: string;
  targetDate: string;
  targetMealType: string;
}

/**
 * Copies the food entries from one date/meal type into another date/meal type.
 * Meal types are matched by name (case-insensitive) server-side. The source
 * entries are left untouched.
 */
export const copyFoodEntries = async (
  payload: CopyFoodEntriesPayload
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/food-entries/copy',
    serviceName: 'Food Entries API',
    operation: 'copy food entries',
    method: 'POST',
    body: payload,
  });
};

export interface CopyFoodEntriesFromYesterdayPayload {
  mealType: string;
  targetDate: string;
}

/**
 * Copies one meal from the previous day into the same meal on `targetDate`.
 * The source day is `targetDate - 1`, computed server-side. `mealType` is the
 * meal type's id, which the server resolves before any name match, so a custom
 * type sharing a system type's name is not resolved to the system one. An empty
 * source meal copies nothing. `serverConfig` pins the account the copy started
 * for, so a mid-copy account switch cannot redirect it elsewhere.
 */
export const copyFoodEntriesFromYesterday = async (
  payload: CopyFoodEntriesFromYesterdayPayload,
  serverConfig?: ServerConfig
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/food-entries/copy-yesterday',
    serviceName: 'Food Entries API',
    operation: 'copy food entries from yesterday',
    method: 'POST',
    body: payload,
    serverConfig,
  });
};

export interface CopyAllFoodEntriesFromYesterdayPayload {
  targetDate: string;
}

/**
 * Copies every meal with data on the previous day into `targetDate`. The source
 * day is `targetDate - 1`, computed server-side. `serverConfig` pins the account
 * the copy started for, so a mid-copy account switch cannot redirect it.
 */
export const copyAllFoodEntriesFromYesterday = async (
  payload: CopyAllFoodEntriesFromYesterdayPayload,
  serverConfig?: ServerConfig
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/food-entries/copy-all-yesterday',
    serviceName: 'Food Entries API',
    operation: 'copy all food entries from yesterday',
    method: 'POST',
    body: payload,
    serverConfig,
  });
};

/**
 * Copies a complete meal from an explicitly selected family diary user.
 * The server preserves composite-meal containers for this whole-meal route.
 */
export const copyReviewedFoodEntriesFromUser = async (
  payload: CopyReviewedFoodEntriesFromUserPayload
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/food-entries/copy-reviewed-from-user',
    serviceName: 'Food Entries API',
    operation: 'copy reviewed food entries from family user',
    method: 'POST',
    body: payload,
  });
};

/**
 * Copies selected entries from an explicitly selected family diary user.
 */
export const copySelectedFoodEntriesFromUser = async (
  payload: CopySelectedFoodEntriesFromUserPayload
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/food-entries/copy-selected-from-user',
    serviceName: 'Food Entries API',
    operation: 'copy selected food entries from family user',
    method: 'POST',
    body: payload,
  });
};

export const copyReviewedFoodEntriesToUser = async (
  payload: CopyReviewedFoodEntriesToUserPayload
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/food-entries/copy-reviewed-to-user',
    serviceName: 'Food Entries API',
    operation: 'copy reviewed food entries to family user',
    method: 'POST',
    body: payload,
  });
};

export const copySelectedFoodEntriesToUser = async (
  payload: CopySelectedFoodEntriesToUserPayload
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/food-entries/copy-selected-to-user',
    serviceName: 'Food Entries API',
    operation: 'copy selected food entries to family user',
    method: 'POST',
    body: payload,
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
const calculateMacro = (
  entries: FoodEntry[],
  field: keyof FoodEntry
): number => {
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

export const calculateProtein = (entries: FoodEntry[]): number =>
  calculateMacro(entries, 'protein');
export const calculateCarbs = (entries: FoodEntry[]): number =>
  calculateMacro(entries, 'carbs');
export const calculateFat = (entries: FoodEntry[]): number =>
  calculateMacro(entries, 'fat');
export const calculateFiber = (entries: FoodEntry[]): number =>
  calculateMacro(entries, 'dietary_fiber');

/**
 * Aggregates all custom nutrient values across food entries.
 * Uses the same (value * quantity) / serving_size formula as calculateMacro.
 * Returns a map of nutrient name → total consumed value.
 */
export const calculateCustomNutrientTotals = (
  entries: FoodEntry[]
): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.custom_nutrients || entry.serving_size === 0) continue;
    for (const [name, rawValue] of Object.entries(entry.custom_nutrients)) {
      const value =
        typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
      if (isNaN(value)) continue;
      const scaled = (value * entry.quantity) / entry.serving_size;
      totals[name] = (totals[name] ?? 0) + scaled;
    }
  }
  return totals;
};
