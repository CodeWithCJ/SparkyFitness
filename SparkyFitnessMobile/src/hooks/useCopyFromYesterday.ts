import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  copyFoodEntriesFromYesterday,
  copyAllFoodEntriesFromYesterday,
} from '../services/api/foodEntriesApi';
import { invalidateFoodCache } from './invalidateFoodCache';

/**
 * A copy-from-yesterday action: either a set of checked meals (copied one at a
 * time through `copy-yesterday`) or the whole day (one `copy-all-yesterday`
 * request). The meal names are the meal types' names, which the name-matched
 * `copy-yesterday` endpoint expects.
 */
export type CopyFromYesterdayPayload =
  | { kind: 'selected'; mealNames: string[]; targetDate: string }
  | { kind: 'all'; targetDate: string };

export function useCopyFromYesterday() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: CopyFromYesterdayPayload) => {
      if (payload.kind === 'all') {
        return copyAllFoodEntriesFromYesterday({
          targetDate: payload.targetDate,
        });
      }
      // Serially: the endpoint is per-meal, and keeping the order lets the
      // first failure surface before the rest are attempted.
      for (const mealType of payload.mealNames) {
        await copyFoodEntriesFromYesterday({
          mealType,
          targetDate: payload.targetDate,
        });
      }
    },
    onSuccess: (_data, payload) => {
      // Only the target day changes; the source day is left untouched.
      invalidateFoodCache(queryClient, payload.targetDate);
      Toast.show({
        type: 'success',
        text1: t('copyFromYesterday.success', {
          defaultValue: 'Copied from yesterday',
        }),
      });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('copyFromYesterday.failed', {
          defaultValue: 'Failed to copy from yesterday',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  return {
    copyFromYesterday: mutation.mutate,
    isPending: mutation.isPending,
  };
}
