import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      Toast.show({ type: 'error', text1: t('foodSave.failed', { defaultValue: 'Failed to save food' }), text2: t('common.tryAgain', { defaultValue: 'Please try again.' }) });
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
