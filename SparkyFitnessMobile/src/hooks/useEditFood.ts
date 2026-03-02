import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { updateFood, updateFoodVariant, updateFoodSnapshot } from '../services/api/foodsApi';
import { dailySummaryQueryKey, foodsQueryKey, foodVariantsQueryKey } from './queryKeys';
import type { FoodFormData } from '../components/FoodForm';
import type { FoodEntry } from '../types/foodEntries';

const parseOptional = (s: string): number | undefined =>
  s === '' ? undefined : (parseFloat(s) || 0);

interface UseEditFoodOptions {
  entry: FoodEntry;
  onSuccess?: (updatedEntry: FoodEntry) => void;
}

export function useEditFood({ entry, onSuccess }: UseEditFoodOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = entry.entry_date.split('T')[0];

  const mutation = useMutation({
    mutationFn: async (data: FoodFormData) => {
      const foodId = entry.food_id!;
      const variantId = entry.variant_id!;

      await updateFood(foodId, {
        name: data.name,
        brand: data.brand || null,
      });

      await updateFoodVariant(variantId, {
        food_id: foodId,
        serving_size: parseFloat(data.servingSize) || 0,
        serving_unit: data.servingUnit || 'serving',
        calories: parseFloat(data.calories) || 0,
        protein: parseFloat(data.protein) || 0,
        carbs: parseFloat(data.carbs) || 0,
        fat: parseFloat(data.fat) || 0,
        dietary_fiber: parseOptional(data.fiber),
        saturated_fat: parseOptional(data.saturatedFat),
        sodium: parseOptional(data.sodium),
        sugars: parseOptional(data.sugars),
      });

      await updateFoodSnapshot({ foodId, variantId });

      const updatedEntry: FoodEntry = {
        ...entry,
        food_name: data.name,
        brand_name: data.brand || undefined,
        serving_size: parseFloat(data.servingSize) || 0,
        unit: data.servingUnit || 'serving',
        calories: parseFloat(data.calories) || 0,
        protein: parseFloat(data.protein) || 0,
        carbs: parseFloat(data.carbs) || 0,
        fat: parseFloat(data.fat) || 0,
        dietary_fiber: parseOptional(data.fiber),
        saturated_fat: parseOptional(data.saturatedFat),
        sodium: parseOptional(data.sodium),
        sugars: parseOptional(data.sugars),
      };

      return updatedEntry;
    },
    onSuccess: (updatedEntry) => {
      onSuccess?.(updatedEntry);
    },
    onError: (error) => {
      const message = error instanceof Error && error.message.includes('403')
        ? "You don't have permission to edit this food."
        : 'Please try again.';
      Alert.alert('Failed to save changes', message);
    },
  });

  const invalidateCache = () => {
    // refetchType 'all' ensures the query is refetched immediately even if the
    // diary screen has no active observers (native tabs may unmount it).
    // This avoids stale data when the user navigates back within the 30s
    // useRefetchOnFocus cooldown window.
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(normalizedDate), refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
    queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(entry.food_id!) });
  };

  return {
    editFood: mutation.mutate,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
