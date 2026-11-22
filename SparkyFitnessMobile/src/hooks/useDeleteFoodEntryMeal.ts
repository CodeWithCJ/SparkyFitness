import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountGeneration } from '../offline/accountGeneration';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import { deleteFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import { queueFoodEntryMealDelete } from '../offline/foodEntryMealDeleteHandOver';
import { serverMayBeDown } from '../utils/serverErrors';
import { normalizeDate } from '../utils/dateUtils';
import { foodEntryMealDetailQueryKey } from './queryKeys';
import { invalidateFoodCache } from './invalidateFoodCache';
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
    mutationFn: async () => {
      const startedUnder = accountGeneration();
      try {
        await deleteFoodEntryMeal(mealId);
      } catch (error) {
        // With the server away the removal is kept and sent later. Deleting
        // is safe to send again, so even a timeout is kept.
        if (
          accountGeneration() === startedUnder &&
          serverMayBeDown(error) &&
          (await queueFoodEntryMealDelete(mealId, entryDate))
        ) {
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      onSuccess?.();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('editLoggedMeal.errors.deleteFailed', {
          defaultValue: 'Failed to delete meal',
        }),
        text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      i18n.t('editLoggedMeal.actions.deleteMeal', {
        defaultValue: 'Delete Meal',
      }),
      i18n.t('editLoggedMeal.deleteConfirm', {
        defaultValue: 'Delete this meal?',
      }),
      [
        {
          text: i18n.t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: i18n.t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => mutation.mutate(),
        },
      ]
    );
  };

  const deleteEntry = () => mutation.mutate();

  const invalidateCache = () => {
    invalidateFoodCache(queryClient, normalizedDate);
    queryClient.invalidateQueries({
      queryKey: foodEntryMealDetailQueryKey(mealId),
    });
    invalidateMealUsageCaches(queryClient);
  };

  return {
    confirmAndDelete,
    deleteEntry,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
