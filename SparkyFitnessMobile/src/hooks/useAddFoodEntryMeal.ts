import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { createFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import type {
  FoodEntryMeal,
  FoodEntryMealCreateData,
} from '../types/foodEntryMeals';
import { dailySummaryQueryKey, foodsQueryKey } from './queryKeys';
import { invalidateMealUsageCaches } from './useMeals';

interface UseAddFoodEntryMealOptions {
  onSuccess?: (meal: FoodEntryMeal) => void;
}

export function useAddFoodEntryMeal(options?: UseAddFoodEntryMealOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: FoodEntryMealCreateData) => createFoodEntryMeal(payload),
    onSuccess: (meal) => {
      invalidateMealUsageCaches(queryClient);
      options?.onSuccess?.(meal);
    },
    onError: () => {
      Toast.show({ type: 'error', text1: 'Failed to add meal', text2: 'Please try again.' });
    },
  });

  const invalidateCache = (date: string) => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
  };

  return {
    addMeal: mutation.mutate,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
