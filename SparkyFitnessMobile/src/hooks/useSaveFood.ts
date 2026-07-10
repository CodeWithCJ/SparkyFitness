import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { saveFood, type SaveFoodPayload } from '../services/api/foodsApi';
import { foodsQueryKey } from './queryKeys';
import { mobileT } from '../localization';

export function useSaveFood() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: SaveFoodPayload) => saveFood(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: mobileT('foodEntry.saveFoodFailed'),
        text2: mobileT('common.retry'),
      });
    },
  });

  return {
    saveFood: mutation.mutate,
    saveFoodAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSaved: mutation.isSuccess,
  };
}
