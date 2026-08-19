import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: FoodEntryMealCreateData) => createFoodEntryMeal(payload),
    onSuccess: (meal) => {
      invalidateMealUsageCaches(queryClient);
      options?.onSuccess?.(meal);
    },
    onError: () => {
      Toast.show({ type: 'error', text1: t('foodEntryMeal.failed', { defaultValue: 'Failed to add meal' }), text2: t('common.tryAgain', { defaultValue: 'Please try again.' }) });
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
