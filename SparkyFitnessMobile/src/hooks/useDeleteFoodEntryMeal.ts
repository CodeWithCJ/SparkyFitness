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
      Toast.show({ type: 'error', text1: 'Failed to delete', text2: 'Please try again.' });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert('Delete Meal', 'Delete this meal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => mutation.mutate() },
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
