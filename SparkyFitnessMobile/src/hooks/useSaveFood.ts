import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { saveFood, type SaveFoodPayload } from '../services/api/foodsApi';
import { favoritesQueryKey, foodsQueryKey } from './queryKeys';

export function useSaveFood() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: SaveFoodPayload) => saveFood(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
      // Keep an edited food's name/nutrition fresh in the Favorites section
      // (separate query root, 5-min staleTime).
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    },
    onError: () => {
      Toast.show({ type: 'error', text1: 'Failed to save food', text2: 'Please try again.' });
    },
  });

  return {
    saveFood: mutation.mutate,
    saveFoodAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSaved: mutation.isSuccess,
  };
}
