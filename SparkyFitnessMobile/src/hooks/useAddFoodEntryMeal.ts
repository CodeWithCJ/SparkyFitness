import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { createFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import type {
  FoodEntryMeal,
  FoodEntryMealCreateData,
} from '../types/foodEntryMeals';
import { accountGeneration } from '../offline/accountGeneration';
import { queueAfterConnectionFailure } from '../offline/queueAfterFailure';
import {
  isQueueableFoodEntryMeal,
  queueFoodEntryMeal,
} from '../offline/foodEntryMealHandOver';
import { isPendingEntryId, pendingEntryId } from '../offline/foodEntryHandOver';
import { newUuid } from '../utils/ids';
import { invalidateFoodCache } from './invalidateFoodCache';
import { invalidateMealUsageCaches } from './useMeals';

/** A logged meal as it will read once uploaded, for the screens that carry on. */
function pendingMealFrom(
  clientId: string,
  payload: FoodEntryMealCreateData
): FoodEntryMeal {
  return {
    id: pendingEntryId(clientId),
    user_id: '',
    meal_template_id: payload.meal_template_id ?? null,
    meal_type: payload.meal_type,
    meal_type_id: payload.meal_type_id ?? null,
    entry_date: payload.entry_date,
    entry_time: payload.entry_time,
    name: payload.name,
    description: payload.description ?? null,
    notes: payload.notes ?? null,
    quantity: payload.quantity,
    unit: payload.unit,
    foods: [],
  };
}

/**
 * Logs a meal. It carries a replay key from the first request on, so a request
 * that reached the server but lost its answer logs the meal once when it is
 * sent again. When the server cannot be reached a meal that names a saved
 * meal is kept on the phone and uploads later (never after a timeout, since
 * the server may have it already).
 */
async function createOrQueueMeal(
  payload: FoodEntryMealCreateData
): Promise<FoodEntryMeal> {
  const clientId = newUuid();
  const startedUnder = accountGeneration();
  try {
    return await createFoodEntryMeal({ ...payload, client_id: clientId });
  } catch (error) {
    const queued =
      isQueueableFoodEntryMeal(payload) &&
      (await queueAfterConnectionFailure(
        error,
        () => queueFoodEntryMeal(clientId, payload),
        startedUnder
      ));
    if (queued) return pendingMealFrom(clientId, payload);
    throw error;
  }
}

interface UseAddFoodEntryMealOptions {
  onSuccess?: (meal: FoodEntryMeal) => void;
}

export function useAddFoodEntryMeal(options?: UseAddFoodEntryMealOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: FoodEntryMealCreateData) =>
      createOrQueueMeal(payload),
    onSuccess: (meal) => {
      if (isPendingEntryId(meal.id)) {
        Toast.show({
          type: 'info',
          text1: t('foodEntryMeal.queued', {
            defaultValue: 'Saved on this phone',
          }),
          text2: t('foodEntryMeal.queuedMessage', {
            defaultValue: 'It uploads when your server can be reached.',
          }),
        });
      } else {
        invalidateCache(meal.entry_date);
        invalidateMealUsageCaches(queryClient);
      }
      options?.onSuccess?.(meal);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('foodEntryMeal.failed', {
          defaultValue: 'Failed to add meal',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const invalidateCache = (date: string) => {
    invalidateFoodCache(queryClient, date);
  };

  return {
    addMeal: mutation.mutate,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
