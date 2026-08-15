import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { saveFood, type SaveFoodPayload } from '../services/api/foodsApi';
import { favoritesQueryKey, foodsQueryKey } from './queryKeys';
import type { ImageUploadArgs } from '../utils/pickerImages';

export type SaveFoodImages = ImageUploadArgs;

type SaveFoodVariables = {
  payload: SaveFoodPayload;
  images?: SaveFoodImages;
};

export function useSaveFood() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ payload, images }: SaveFoodVariables) =>
      saveFood(payload, images),
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

  // Images stay an optional trailing argument so the many existing callers
  // that never touch photos keep their `saveFoodAsync(payload)` call.
  return {
    saveFood: (payload: SaveFoodPayload, images?: SaveFoodImages) =>
      mutation.mutate({ payload, images }),
    saveFoodAsync: (payload: SaveFoodPayload, images?: SaveFoodImages) =>
      mutation.mutateAsync({ payload, images }),
    isPending: mutation.isPending,
    isSaved: mutation.isSuccess,
  };
}
