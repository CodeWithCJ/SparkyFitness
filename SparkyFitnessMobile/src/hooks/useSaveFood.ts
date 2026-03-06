import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
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
      Alert.alert('Failed to save food', 'Please try again.');
    },
  });

  return {
    saveFood: mutation.mutate,
    isPending: mutation.isPending,
    isSaved: mutation.isSuccess,
  };
}
