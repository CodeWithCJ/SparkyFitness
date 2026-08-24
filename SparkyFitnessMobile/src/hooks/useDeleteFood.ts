import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { deleteFood } from '../services/api/foodsApi';
import { favoritesQueryKey, foodVariantsQueryKey, foodsQueryKey } from './queryKeys';

interface UseDeleteFoodOptions {
  foodId: string;
  onSuccess?: () => void;
}

export function useDeleteFood({ foodId, onSuccess }: UseDeleteFoodOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => deleteFood(foodId),
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      const message = error instanceof Error && error.message.includes('403')
        ? "You don't have permission to delete this food."
        : 'Please try again.';
      Toast.show({ type: 'error', text1: t('foodDelete.failed', { defaultValue: 'Failed to delete food' }), text2: message });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      t('foodDelete.title', { defaultValue: 'Delete Food' }),
      t('foodDelete.message', { defaultValue: 'Are you sure you want to delete this food? Existing logged entries will stay unchanged.' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  const invalidateCaches = () => {
    queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(foodId) });
    queryClient.invalidateQueries({ queryKey: foodsQueryKey, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['foodsLibrary'], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['foodSearch'], refetchType: 'all' });
    // Favorites are a separate query root; a deleted food is cascade-removed
    // server-side, so refetch so it drops out of the Favorites section too.
    queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
  };

  return {
    confirmAndDelete,
    invalidateCaches,
    isPending: mutation.isPending,
  };
}
