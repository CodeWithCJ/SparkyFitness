import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import { deleteFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import { normalizeDate } from '../utils/dateUtils';
import {
  dailySummaryQueryKey,
  foodEntryMealDetailQueryKey,
  foodsQueryKey,
} from './queryKeys';
import { invalidateMealUsageCaches } from './useMeals';

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
      Toast.show({ type: 'error', text1: i18n.t('editLoggedMeal.errors.deleteFailed', { defaultValue: 'Failed to delete meal' }), text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }) });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(i18n.t('editLoggedMeal.actions.deleteMeal', { defaultValue: 'Delete Meal' }), i18n.t('editLoggedMeal.deleteConfirm', { defaultValue: 'Delete this meal?' }), [
      { text: i18n.t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      { text: i18n.t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => mutation.mutate() },
    ]);
  };

  const deleteEntry = () => mutation.mutate();

  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(normalizedDate) });
    queryClient.invalidateQueries({ queryKey: foodEntryMealDetailQueryKey(mealId) });
    invalidateMealUsageCaches(queryClient);
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
  };

  return {
    confirmAndDelete,
    deleteEntry,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
