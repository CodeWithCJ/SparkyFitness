import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CopyFoodEntriesPayload) => copyFoodEntries(payload),
    onSuccess: (_data, payload) => {
      // Only the target day changes; the source day is left untouched.
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(payload.targetDate) });
      Toast.show({ type: 'success', text1: 'Meal copied' });
      options?.onSuccess?.(payload);
    },
    onError: () => {
      Toast.show({ type: 'error', text1: 'Failed to copy meal', text2: 'Please try again.' });
    },
  });

  return {
    copyMeal: mutation.mutate,
    isPending: mutation.isPending,
  };
}
