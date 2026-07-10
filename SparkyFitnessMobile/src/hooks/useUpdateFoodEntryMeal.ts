import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { updateFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import type {
  FoodEntryMeal,
  FoodEntryMealUpdateData,
} from '../types/foodEntryMeals';
import { normalizeDate } from '../utils/dateUtils';
import {
  dailySummaryQueryKey,
  foodEntryMealDetailQueryKey,
  foodsQueryKey,
  recentMealsQueryKeyRoot,
} from './queryKeys';
import { mobileT } from '../localization';

interface UseUpdateFoodEntryMealOptions {
  mealId: string;
  entryDate: string;
  onSuccess?: (meal: FoodEntryMeal) => void;
}

export function useUpdateFoodEntryMeal({
  mealId,
  entryDate,
  onSuccess,
}: UseUpdateFoodEntryMealOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: (payload: FoodEntryMealUpdateData) => updateFoodEntryMeal(mealId, payload),
    onSuccess: (meal) => {
      onSuccess?.(meal);
    },
    onError: (error) => {
      const message = error instanceof Error && error.message.includes('403')
        ? mobileT('editLoggedMeal.noPermission')
        : mobileT('common.retry');
      Toast.show({
        type: 'error',
        text1: mobileT('editLoggedMeal.updateFailed'),
        text2: message,
      });
    },
  });

  const invalidateCache = (newDate?: string) => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(normalizedDate), refetchType: 'all' });
    if (newDate && newDate !== normalizedDate) {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(newDate), refetchType: 'all' });
    }
    queryClient.invalidateQueries({ queryKey: foodEntryMealDetailQueryKey(mealId) });
    queryClient.invalidateQueries({ queryKey: recentMealsQueryKeyRoot, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
  };

  return {
    updateMeal: mutation.mutate,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
