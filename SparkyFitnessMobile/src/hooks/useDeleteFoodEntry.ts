import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { deleteFoodEntry } from '../services/api/foodEntriesApi';
import { normalizeDate } from '../utils/dateUtils';
import { dailySummaryQueryKey } from './queryKeys';
import { mobileT } from '../localization';

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
      Toast.show({
        type: 'error',
        text1: mobileT('delete.failedTitle'),
        text2: mobileT('common.retry'),
      });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(mobileT('delete.foodEntryTitle'), mobileT('delete.foodEntryDescription'), [
      { text: mobileT('common.cancel'), style: 'cancel' },
      { text: mobileT('common.delete'), style: 'destructive', onPress: () => mutation.mutate() },
    ]);
  };

  const deleteEntry = () => mutation.mutate();

  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(normalizedDate) });
  };

  return {
    confirmAndDelete,
    deleteEntry,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
