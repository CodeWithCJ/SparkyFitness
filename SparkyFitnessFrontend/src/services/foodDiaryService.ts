import { apiCall } from './api';

import { Food, FoodVariant } from '@/types/food';
import { FoodEntry } from '@/types/food'; // Import FoodEntry from food.d.ts
import { ExpandedGoals } from '@/types/goals'; // Import ExpandedGoals

export const loadFoodEntries = async (userId: string, selectedDate: string): Promise<FoodEntry[]> => {
  const params = new URLSearchParams({
    userId,
    selectedDate,
  });
  const data = await apiCall(`/food-entries?${params.toString()}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404
  });
  // Add debug log to inspect raw data from API
  if (data) {
    data.forEach((entry: any) => {
      console.debug("foodDiaryService: Raw API data for food entry:", {
        foodName: entry.food_name,
        glycemicIndex: entry.glycemic_index,
      });
    });
  }
  return data || []; // Return empty array if 404 (no food entries found)
};

export const loadGoals = async (userId: string, selectedDate: string): Promise<ExpandedGoals> => {
  const params = new URLSearchParams({
    date: selectedDate,
  });
  const data = await apiCall(`/goals/for-date?${params.toString()}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404
  });
  // Ensure all fields are numbers, providing defaults if null or undefined
  return {
    calories: data?.calories ?? 2000,
    protein: data?.protein ?? 150,
    carbs: data?.carbs ?? 250,
    fat: data?.fat ?? 67,
    water_goal_ml: data?.water_goal_ml ?? 8,
    saturated_fat: data?.saturated_fat ?? 20,
    polyunsaturated_fat: data?.polyunsaturated_fat ?? 10,
    monounsaturated_fat: data?.monounsaturated_fat ?? 25,
    trans_fat: data?.trans_fat ?? 0,
    cholesterol: data?.cholesterol ?? 300,
    sodium: data?.sodium ?? 2300,
    potassium: data?.potassium ?? 3500,
    dietary_fiber: data?.dietary_fiber ?? 25,
    sugars: data?.sugars ?? 50,
    vitamin_a: data?.vitamin_a ?? 900,
    vitamin_c: data?.vitamin_c ?? 90,
    calcium: data?.calcium ?? 1000,
    iron: data?.iron ?? 18,
    target_exercise_calories_burned: data?.target_exercise_calories_burned ?? 0,
    target_exercise_duration_minutes: data?.target_exercise_duration_minutes ?? 0,
    protein_percentage: data?.protein_percentage ?? null,
    carbs_percentage: data?.carbs_percentage ?? null,
    fat_percentage: data?.fat_percentage ?? null,
    breakfast_percentage: data?.breakfast_percentage ?? 25,
    lunch_percentage: data?.lunch_percentage ?? 25,
    dinner_percentage: data?.dinner_percentage ?? 25,
    snacks_percentage: data?.snacks_percentage ?? 25,
  };
};

export const addFoodEntry = async (payload: {
  user_id: string;
  food_id: string;
  meal_type: string;
  quantity: number;
  unit: string;
  variant_id?: string;
  entry_date: string;
}): Promise<FoodEntry> => {
  return apiCall('/food-entries', {
    method: 'POST',
    body: payload,
  });
};

export const addMealToDiary = async (mealId: string, mealType: string, entryDate: string): Promise<void> => {
  return apiCall('/foods/food-entries/add-meal', {
    method: 'POST',
    body: { mealId, mealType, entryDate },
  });
};

export const removeFoodEntry = async (entryId: string): Promise<void> => {
  return apiCall(`/food-entries/${entryId}`, {
    method: 'DELETE',
  });
};

export const copyFoodEntries = async (sourceDate: string, sourceMealType: string, targetDate: string, targetMealType: string): Promise<FoodEntry[]> => {
  return apiCall('/food-entries/copy', {
    method: 'POST',
    body: { sourceDate, sourceMealType, targetDate, targetMealType },
  });
};

export const copyFoodEntriesFromYesterday = async (mealType: string, targetDate: string): Promise<FoodEntry[]> => {
  return apiCall('/food-entries/copy-yesterday', {
    method: 'POST',
    body: { mealType, targetDate },
  });
};