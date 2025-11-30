import { apiCall } from './api';

export interface FoodSuggestion {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_type: string;
  description?: string;
  preparation_time?: string;
  servings?: number;
}

export const createFoodInDatabase = async (foodSuggestion: FoodSuggestion, activeUserId: string): Promise<string> => {
  const response = await apiCall('/foods/create-or-get', {
    method: 'POST',
    body: { foodSuggestion, activeUserId },
  });
  return response.foodId;
};

export const addFoodEntry = async (foodSuggestion: FoodSuggestion, foodId: string, activeUserId: string, targetDate: string): Promise<void> => {
  await apiCall('/food-entries', {
    method: 'POST',
    body: {
      user_id: activeUserId,
      food_id: foodId,
      meal_type: foodSuggestion.meal_type,
      quantity: foodSuggestion.quantity,
      unit: foodSuggestion.unit,
      entry_date: targetDate,
    },
  });
};