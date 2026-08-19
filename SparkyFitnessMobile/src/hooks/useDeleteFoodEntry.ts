import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
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
      Toast.show({ type: 'error', text1: i18n.t('foodEntryView.errors.deleteFailed', { defaultValue: 'Failed to delete' }), text2: i18n.t('common.tryAgain', { defaultValue: 'Please try again.' }) });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(i18n.t('foodEntryView.deleteEntry', { defaultValue: 'Delete Entry' }), i18n.t('foodEntryView.deleteConfirm', { defaultValue: 'Are you sure you want to delete this food entry?' }), [
      { text: i18n.t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      { text: i18n.t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => mutation.mutate() },
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
