import { apiCall } from "./api";
import { MealFood } from '@/types/meal'; // Import MealFood
import { FoodEntryMeal } from '@/types/meal'; // New import
import { FoodEntry } from '@/types/food'; // New import

interface FoodEntryUpdateData {
  quantity?: number;
  unit?: string;
}

export const updateFoodEntry = async (id: string, data: FoodEntryUpdateData): Promise<any> => {
  const response = await apiCall(`/food-entries/${id}`, {
    method: 'PUT',
    body: data,
  });
  return response;
};

export interface FoodEntryCreateData {
  user_id: string;
  food_id: string;
  meal_type: string;
  quantity: number;
  unit: string;
  entry_date: string;
  variant_id?: string | null;
}

export const createFoodEntry = async (data: FoodEntryCreateData): Promise<any> => {
  const response = await apiCall('/food-entries', {
    method: 'POST',
    body: data,
  });
  return response;
};

export const removeFoodEntry = async (id: string): Promise<any> => {
  const response = await apiCall(`/food-entries/${id}`, {
    method: 'DELETE',
  });
  return response;
};

export const loadFoodEntries = async (userId: string, date: string): Promise<FoodEntry[]> => {
  const response = await apiCall(`/food-entries/by-date/${date}?userId=${userId}`, {
    method: 'GET',
  });
  return response;
};

export const loadGoals = async (userId: string, date: string): Promise<any> => { // Adjust return type as needed
  const response = await apiCall(`/goals/by-date/${date}?userId=${userId}`, {
    method: 'GET',
  });
  return response;
};

export const copyFoodEntries = async (
  sourceDate: string,
  sourceMealType: string,
  targetDate: string,
  targetMealType: string,
): Promise<any> => {
  const response = await apiCall('/food-entries/copy', {
    method: 'POST',
    body: { sourceDate, sourceMealType, targetDate, targetMealType },
  });
  return response;
};

export const copyFoodEntriesFromYesterday = async (mealType: string, targetDate: string): Promise<any> => {
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

export const createFoodEntryMeal = async (data: FoodEntryMealCreateData): Promise<FoodEntryMeal> => {
  const response = await apiCall('/food-entry-meals', {
    method: 'POST',
    body: data,
  });
  return response;
};

export const updateFoodEntryMeal = async (foodEntryMealId: string, data: FoodEntryMealUpdateData): Promise<FoodEntryMeal> => {
  const response = await apiCall(`/food-entry-meals/${foodEntryMealId}`, {
    method: 'PUT',
    body: data,
  });
  return response;
};

export const getFoodEntryMealWithComponents = async (userId: string, foodEntryMealId: string): Promise<FoodEntryMeal> => {
  const response = await apiCall(`/food-entry-meals/${foodEntryMealId}?userId=${userId}`, {
    method: 'GET',
  });
  return response;
};

export const getFoodEntryMealsByDate = async (userId: string, date: string): Promise<FoodEntryMeal[]> => {
  const response = await apiCall(`/food-entry-meals/by-date/${date}?userId=${userId}`, {
    method: 'GET',
  });
  return response;
};

export const deleteFoodEntryMeal = async (foodEntryMealId: string): Promise<any> => {
  const response = await apiCall(`/food-entry-meals/${foodEntryMealId}`, {
    method: 'DELETE',
  });
  return response;
};