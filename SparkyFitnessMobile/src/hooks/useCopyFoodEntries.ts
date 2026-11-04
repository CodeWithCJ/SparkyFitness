import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  copyFoodEntries,
  type CopyFoodEntriesPayload,
} from '../services/api/foodEntriesApi';
import { invalidateFoodCache } from './invalidateFoodCache';

interface UseCopyFoodEntriesOptions {
  onSuccess?: (payloads: CopyFoodEntriesPayload[]) => void;
}

interface CopyResult {
  copied: CopyFoodEntriesPayload[];
  failedCount: number;
}

/**
 * Copies one meal to one or more target days. The server endpoint takes a
 * single target, so each day is sent in turn. A day that fails does not stop
 * the rest; the copy only counts as failed when no day was copied.
 */
async function copyToEachDay(
  payloads: CopyFoodEntriesPayload[]
): Promise<CopyResult> {
  const copied: CopyFoodEntriesPayload[] = [];
  let failedCount = 0;
  for (const payload of payloads) {
    try {
      await copyFoodEntries(payload);
      copied.push(payload);
    } catch {
      failedCount += 1;
    }
  }
  if (copied.length === 0) {
    throw new Error('Failed to copy meal');
  }
  return { copied, failedCount };
}

export function useCopyFoodEntries(options?: UseCopyFoodEntriesOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: copyToEachDay,
    onSuccess: ({ copied, failedCount }) => {
      // Only the target days change; the source day is left untouched.
      for (const payload of copied) {
        invalidateFoodCache(queryClient, payload.targetDate);
      }
      if (failedCount > 0) {
        Toast.show({
          type: 'error',
          text1: t('foodEntryCopy.partial', {
            defaultValue: 'Copied to {{copied}} of {{total}} days',
            copied: copied.length,
            total: copied.length + failedCount,
          }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
      } else {
        Toast.show({
          type: 'success',
          text1:
            copied.length > 1
              ? t('foodEntryCopy.successDays', {
                  count: copied.length,
                  defaultValue: 'Meal copied to {{count}} days',
                  defaultValue_one: 'Meal copied to {{count}} day',
                  defaultValue_other: 'Meal copied to {{count}} days',
                })
              : t('foodEntryCopy.success', { defaultValue: 'Meal copied' }),
        });
      }
      options?.onSuccess?.(copied);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('foodEntryCopy.failed', {
          defaultValue: 'Failed to copy meal',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  return {
    copyMeal: mutation.mutate,
    isPending: mutation.isPending,
  };
}
