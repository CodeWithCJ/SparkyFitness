import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import { updateFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import type {
  FoodEntryMeal,
  FoodEntryMealUpdateData,
} from '../types/foodEntryMeals';
import { queueFoodEntryMealUpdate } from '../offline/foodEntryMealUpdateHandOver';
import type { FoodEntry } from '../types/foodEntries';
import { serverMayBeDown } from '../utils/serverErrors';
import { normalizeDate } from '../utils/dateUtils';
import { foodEntryMealDetailQueryKey } from './queryKeys';
import { invalidateFoodCache } from './invalidateFoodCache';
import { invalidateMealUsageCaches } from './useMeals';

interface UseUpdateFoodEntryMealOptions {
  mealId: string;
  entryDate: string;
  onSuccess?: (meal: FoodEntryMeal) => void;
  /** Called when the change is kept on the phone to upload later. */
  onKeptOnPhone?: () => void;
}

/** A save: the request, and what the meal reads like while it waits. */
interface MealChange {
  payload: FoodEntryMealUpdateData;
  /** The meal as one Diary entry: name, meal, date, time, note and totals. */
  display: Partial<FoodEntry>;
}

interface KeptOnPhone {
  keptOnPhone: true;
}

export function useUpdateFoodEntryMeal({
  mealId,
  entryDate,
  onSuccess,
  onKeptOnPhone,
}: UseUpdateFoodEntryMealOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: async ({
      payload,
      display,
    }: MealChange): Promise<FoodEntryMeal | KeptOnPhone> => {
      try {
        return await updateFoodEntryMeal(mealId, payload);
      } catch (error) {
        // With the server away the saved meal is kept and sent later. It holds
        // the whole meal, so sending it twice leaves the same meal and even a
        // timeout is kept.
        if (
          serverMayBeDown(error) &&
          (await queueFoodEntryMealUpdate(mealId, entryDate, payload, display))
        ) {
          return { keptOnPhone: true };
        }
        throw error;
      }
    },
    onSuccess: (meal) => {
      if ('keptOnPhone' in meal) {
        Toast.show({
          type: 'info',
          text1: i18n.t('foodEntryAdd.queued', {
            defaultValue: 'Saved on this phone',
          }),
          text2: i18n.t('foodEntryAdd.queuedMessage', {
            defaultValue: 'It uploads when your server can be reached.',
          }),
        });
        onKeptOnPhone?.();
        return;
      }
      onSuccess?.(meal);
    },
    onError: (error) => {
      const message =
        error instanceof Error && error.message.includes('403')
          ? i18n.t('editLoggedMeal.errors.permission', {
              defaultValue: "You don't have permission to edit this meal.",
            })
          : i18n.t('common.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({
        type: 'error',
        text1: i18n.t('editLoggedMeal.errors.saveFailed', {
          defaultValue: 'Failed to save meal',
        }),
        text2: message,
      });
    },
  });

  const invalidateCache = (newDate?: string) => {
    invalidateFoodCache(queryClient, normalizedDate);
    if (newDate && newDate !== normalizedDate) {
      invalidateFoodCache(queryClient, newDate);
    }
    queryClient.invalidateQueries({
      queryKey: foodEntryMealDetailQueryKey(mealId),
    });
    invalidateMealUsageCaches(queryClient);
  };

  return {
    updateMeal: (
      payload: FoodEntryMealUpdateData,
      display: Partial<FoodEntry>
    ) => mutation.mutate({ payload, display }),
    isPending: mutation.isPending,
    invalidateCache,
  };
}
