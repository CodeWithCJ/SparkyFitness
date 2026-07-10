import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { deleteFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import { normalizeDate } from '../utils/dateUtils';
import {
  dailySummaryQueryKey,
  foodEntryMealDetailQueryKey,
  foodsQueryKey,
  recentMealsQueryKeyRoot,
} from './queryKeys';
import { mobileT } from '../localization';

interface UseDeleteFoodEntryMealOptions {
  mealId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteFoodEntryMeal({
  mealId,
  entryDate,
  onSuccess,
}: UseDeleteFoodEntryMealOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: () => deleteFoodEntryMeal(mealId),
    onSuccess: () => {
      onSuccess?.();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: mobileT('delete.failedTitle'),
        text2: mobileT('common.retry'),
      });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(mobileT('delete.mealTitle'), mobileT('delete.mealDescription'), [
      { text: mobileT('common.cancel'), style: 'cancel' },
      { text: mobileT('common.delete'), style: 'destructive', onPress: () => mutation.mutate() },
    ]);
  };

  const deleteEntry = () => mutation.mutate();

  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(normalizedDate) });
    queryClient.invalidateQueries({ queryKey: foodEntryMealDetailQueryKey(mealId) });
    queryClient.invalidateQueries({ queryKey: recentMealsQueryKeyRoot, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
  };

  return {
    confirmAndDelete,
    deleteEntry,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
