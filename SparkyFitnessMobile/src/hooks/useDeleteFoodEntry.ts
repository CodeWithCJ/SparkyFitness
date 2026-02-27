import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { deleteFoodEntry } from '../services/api/foodEntriesApi';
import { dailySummaryQueryKey } from './queryKeys';

interface UseDeleteFoodEntryOptions {
  entryId: string;
  entryDate: string;
  onSuccess?: () => void;
}

export function useDeleteFoodEntry({ entryId, entryDate, onSuccess }: UseDeleteFoodEntryOptions) {
  const queryClient = useQueryClient();
  const normalizedDate = entryDate.split('T')[0];

  const mutation = useMutation({
    mutationFn: () => deleteFoodEntry(entryId),
    onSuccess: () => {
      onSuccess?.();
    },
    onError: () => {
      Alert.alert('Failed to delete', 'Please try again.');
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
