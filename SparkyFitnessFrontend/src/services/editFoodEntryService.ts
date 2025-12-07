import { apiCall } from './api';
import { getFoodById } from './foodService';
import { Food, FoodVariant, FoodEntry } from '@/types/food'; // Import Food type

export const loadFoodVariants = async (foodId: string): Promise<FoodVariant[]> => {
  return apiCall(`/foods/food-variants?food_id=${foodId}`, {
    method: 'GET',
  });
};

export const updateFoodEntry = async (entryId: string, payload: { quantity: number; unit: string; variant_id?: string | null }): Promise<void> => {
  await apiCall(`/food-entries/${entryId}`, {
    method: 'PUT',
    body: payload,
  });
};

