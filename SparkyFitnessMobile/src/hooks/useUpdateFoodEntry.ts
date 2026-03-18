import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { updateFoodEntry, type UpdateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { normalizeDate } from '../utils/dateUtils';
import { dailySummaryQueryKey } from './queryKeys';
import type { FoodEntry } from '../types/foodEntries';

interface UseUpdateFoodEntryOptions {
  entryId: string;
  entryDate: string;
  onSuccess?: (updatedEntry: FoodEntry) => void;
}

export function useUpdateFoodEntry({ entryId, entryDate, onSuccess }: UseUpdateFoodEntryOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: (payload: UpdateFoodEntryPayload) => updateFoodEntry(entryId, payload),
    onSuccess: (updatedEntry) => {
      onSuccess?.(updatedEntry);
    },
    onError: (error) => {
      const message = error instanceof Error && error.message.includes('403')
        ? "You don't have permission to edit this entry."
        : 'Please try again.';
      Alert.alert('Failed to save changes', message);
    },
  });

  const invalidateCache = (newDate?: string) => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(normalizedDate), refetchType: 'all' });
    if (newDate && newDate !== normalizedDate) {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(newDate), refetchType: 'all' });
    }
  };

  return {
    updateEntry: mutation.mutate,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
