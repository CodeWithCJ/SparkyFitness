import { apiCall } from '../api';
import type { MealFood } from '@/types/meal';
import type { FoodEntryMeal } from '@/types/meal';
import type { FoodEntry } from '@/types/food';
import { DayData } from '@/types/diary';

export interface FoodEntryUpdateData {
  quantity?: number;
  unit?: string;
}

export interface FoodEntryCreateData {
  user_id?: string;
  food_id: string;
  meal_type: string;
  meal_type_id?: string;
  quantity: number;
  unit: string;
  entry_date: string;
  variant_id?: string | null;
}
export const updateFoodEntry = async (
  id: string,
  data: FoodEntryUpdateData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const response = await apiCall(`/food-entries/${id}`, {
    method: 'PUT',
    body: data,
  });
  return response;
};

export const loadMiniNutritionTrendData = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<DayData[]> => {
  const params = new URLSearchParams({
    userId,
    startDate,
    endDate,
  });
  const data = await apiCall(
    `/reports/mini-nutrition-trends?${params.toString()}`,
    {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    }
  );
  return data || []; // Return empty array if 404 (no data found)
};

export const createFoodEntry = async (
  data: FoodEntryCreateData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const response = await apiCall('/food-entries', {
    method: 'POST',
    body: data,
  });
  return response;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const removeFoodEntry = async (id: string): Promise<any> => {
  const response = await apiCall(`/food-entries/${id}`, {
    method: 'DELETE',
  });
  return response;
};

export const loadFoodEntries = async (date: string): Promise<FoodEntry[]> => {
  const response = await apiCall(`/food-entries/by-date/${date}`, {
    method: 'GET',
  });
  return response;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const loadDiaryGoals = async (date: string): Promise<any> => {
  // Adjust return type as needed
  const response = await apiCall(`/goals/by-date/${date}`, {
    method: 'GET',
  });
  return response;
};

export const copyFoodEntries = async (
  sourceDate: string,
  sourceMealType: string,
  targetDate: string,
  targetMealType: string
): Promise<unknown> => {
  const response = await apiCall('/food-entries/copy', {
    method: 'POST',
    body: { sourceDate, sourceMealType, targetDate, targetMealType },
  });
  return response;
};

export const copyFoodEntriesFromYesterday = async (
  mealType: string,
  targetDate: string
): Promise<unknown> => {
  const response = await apiCall('/food-entries/copy-yesterday', {
    method: 'POST',
    body: { mealType, targetDate },
  });
  return response;
};

// New interfaces and functions for food_entry_meals
export interface FoodEntryMealCreateData {
  meal_template_id?: string | null;
  meal_type: string;
  entry_date: string;
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  foods: MealFood[];
}

export interface FoodEntryMealUpdateData {
  name?: string;
  description?: string;
  meal_type?: string;
  entry_date?: string;
  quantity?: number;
  unit?: string;
  foods: MealFood[]; // Foods must be provided for update
}

export const createFoodEntryMeal = async (
  data: FoodEntryMealCreateData
): Promise<FoodEntryMeal> => {
  const response = await apiCall('/food-entry-meals', {
    method: 'POST',
    body: data,
  });
  return response;
};

export const updateFoodEntryMeal = async (
  foodEntryMealId: string,
  data: FoodEntryMealUpdateData
): Promise<FoodEntryMeal> => {
  const response = await apiCall(`/food-entry-meals/${foodEntryMealId}`, {
    method: 'PUT',
    body: data,
  });
  return response;
};

export const getFoodEntryMealWithComponents = async (
  foodEntryMealId: string
): Promise<FoodEntryMeal> => {
  const response = await apiCall(`/food-entry-meals/${foodEntryMealId}`, {
    method: 'GET',
  });
  return response;
};

export const getFoodEntryMealsByDate = async (
  date: string
): Promise<FoodEntryMeal[]> => {
  const response = await apiCall(`/food-entry-meals/by-date/${date}`, {
    method: 'GET',
  });
  return response;
};

export const deleteFoodEntryMeal = async (
  foodEntryMealId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const response = await apiCall(`/food-entry-meals/${foodEntryMealId}`, {
    method: 'DELETE',
  });
  return response;
};
