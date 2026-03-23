import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { saveFood, type SaveFoodPayload } from '../services/api/foodsApi';
import { foodsQueryKey } from './queryKeys';

export function useSaveFood() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: SaveFoodPayload) => saveFood(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
    },
    onError: () => {
      Toast.show({ type: 'error', text1: 'Failed to save food', text2: 'Please try again.' });
    },
  });

  return {
    saveFood: mutation.mutate,
    isPending: mutation.isPending,
    isSaved: mutation.isSuccess,
  };
}
