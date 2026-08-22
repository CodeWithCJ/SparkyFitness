import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  copyFoodEntries,
  type CopyFoodEntriesPayload,
} from '../services/api/foodEntriesApi';
import { dailySummaryQueryKey } from './queryKeys';

interface UseCopyFoodEntriesOptions {
  onSuccess?: (payload: CopyFoodEntriesPayload) => void;
}

export function useCopyFoodEntries(options?: UseCopyFoodEntriesOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CopyFoodEntriesPayload) => copyFoodEntries(payload),
    onSuccess: (_data, payload) => {
      // Only the target day changes; the source day is left untouched.
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(payload.targetDate) });
      Toast.show({ type: 'success', text1: t('foodEntryCopy.success', { defaultValue: 'Meal copied' }) });
      options?.onSuccess?.(payload);
    },
    onError: () => {
      Toast.show({ type: 'error', text1: t('foodEntryCopy.failed', { defaultValue: 'Failed to copy meal' }), text2: t('common.tryAgain', { defaultValue: 'Please try again.' }) });
    },
  });

  return {
    copyMeal: mutation.mutate,
    isPending: mutation.isPending,
  };
}
