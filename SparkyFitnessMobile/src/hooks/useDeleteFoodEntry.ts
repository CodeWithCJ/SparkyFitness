import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { deleteFoodEntry } from '../services/api/foodEntriesApi';
import { normalizeDate } from '../utils/dateUtils';
import { dailySummaryQueryKey } from './queryKeys';

interface UseDeleteFoodEntryOptions {
  entryId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteFoodEntry({ entryId, entryDate, onSuccess }: UseDeleteFoodEntryOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = normalizeDate(entryDate);

  const mutation = useMutation({
    mutationFn: () => deleteFoodEntry(entryId),
    onSuccess: () => {
      onSuccess?.();
    },
    onError: () => {
      Toast.show({ type: 'error', text1: 'Failed to delete', text2: 'Please try again.' });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert('Delete Entry', 'Are you sure you want to delete this food entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => mutation.mutate() },
    ]);
  };

  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(normalizedDate) });
  };

  return {
    confirmAndDelete,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
