import { apiCall } from './api';
import type { FoodVariant } from '@/types/food';

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

