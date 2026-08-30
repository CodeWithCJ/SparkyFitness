import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  FoodPhotoLogRequest,
  FoodPhotoLogResponse,
} from '@workspace/shared';
import { createPhotoLoggedMeal } from '../services/api/foodEntryMealsApi';
import { dailySummaryQueryKey, foodsQueryKey } from './queryKeys';
import { invalidateMealUsageCaches } from './useMeals';

interface UseCreatePhotoLoggedMealOptions {
  onSuccess?: (result: FoodPhotoLogResponse) => void;
}

export function useCreatePhotoLoggedMeal(
  options?: UseCreatePhotoLoggedMealOptions
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: FoodPhotoLogRequest) =>
      createPhotoLoggedMeal(payload),
    onSuccess: (result) => {
      invalidateMealUsageCaches(queryClient);
      options?.onSuccess?.(result);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoLogEntry.failed', {
          defaultValue: 'Failed to log estimate',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  // The default staleTime is Infinity, so nothing refetches unless we say so.
  const invalidateCache = (date: string) => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
  };

  return {
    logEstimateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
