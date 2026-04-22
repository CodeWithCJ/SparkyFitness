import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { deleteFood } from '../services/api/foodsApi';
import { foodVariantsQueryKey, foodsQueryKey } from './queryKeys';

interface UseDeleteFoodOptions {
  foodId: string;
  onSuccess?: () => void;
}

export function useDeleteFood({ foodId, onSuccess }: UseDeleteFoodOptions) {
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
      Toast.show({ type: 'error', text1: 'Failed to delete food', text2: message });
    },
  });

  const confirmAndDelete = () => {
    Alert.alert(
      'Delete Food',
      'Are you sure you want to delete this food? Existing logged entries will stay unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  const invalidateCaches = () => {
    queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(foodId) });
    queryClient.invalidateQueries({ queryKey: foodsQueryKey, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['foodsLibrary'], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['foodSearch'], refetchType: 'all' });
  };

  return {
    confirmAndDelete,
    invalidateCaches,
    isPending: mutation.isPending,
  };
}
