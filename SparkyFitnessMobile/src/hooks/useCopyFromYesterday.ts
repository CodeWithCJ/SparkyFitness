import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  copyFoodEntriesFromYesterday,
  copyAllFoodEntriesFromYesterday,
} from '../services/api/foodEntriesApi';
import { getActiveServerConfig } from '../services/storage';
import { invalidateFoodCache } from './invalidateFoodCache';

/**
 * A copy-from-yesterday action: either a set of checked meals (copied one at a
 * time through `copy-yesterday`) or the whole day (one `copy-all-yesterday`
 * request). The meal ids are the meal types' ids, which the `copy-yesterday`
 * endpoint resolves unambiguously — a custom type can share a system type's
 * name, so sending the id avoids resolving to the wrong meal.
 */
export type CopyFromYesterdayPayload =
  | { kind: 'selected'; mealIds: string[]; targetDate: string }
  | { kind: 'all'; targetDate: string };

export function useCopyFromYesterday() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: CopyFromYesterdayPayload) => {
      // Pin the account the copy started for, so a mid-copy account switch
      // cannot redirect the remaining requests to the new account.
      const serverConfig = await getActiveServerConfig();
      if (payload.kind === 'all') {
        return copyAllFoodEntriesFromYesterday(
          {
            targetDate: payload.targetDate,
          },
          serverConfig ?? undefined
        );
      }
      // Serially: the endpoint is per-meal, and keeping the order lets the
      // first failure surface before the rest are attempted.
      for (const mealId of payload.mealIds) {
        await copyFoodEntriesFromYesterday(
          {
            mealType: mealId,
            targetDate: payload.targetDate,
          },
          serverConfig ?? undefined
        );
      }
    },
    onSuccess: (_data, _payload) => {
      Toast.show({
        type: 'success',
        text1: t('copyFromYesterday.success', {
          defaultValue: 'Copied from yesterday',
        }),
      });
    },
    onSettled: (_data, _error, payload) => {
      // Only the target day changes; the source day is left untouched. Invalidate
      // on settle, not just success, so a partial failure (some meals copied
      // before one fails) still refreshes the target day's cache.
      invalidateFoodCache(queryClient, payload.targetDate);
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
