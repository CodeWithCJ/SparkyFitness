import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { saveFood, type SaveFoodPayload } from '../services/api/foodsApi';
import {
  foodFromWaiting,
  isPendingFoodId,
  isQueueableFoodCreate,
  queueFoodCreate,
} from '../offline/foodCreateHandOver';
import { accountGeneration } from '../offline/accountGeneration';
import { queueAfterConnectionFailure } from '../offline/queueAfterFailure';
import { newUuid } from '../utils/ids';
import type { FoodItem } from '../types/foods';
import { favoritesQueryKey, foodsQueryKey } from './queryKeys';
import type { ImageUploadArgs } from '../utils/pickerImages';

export type SaveFoodImages = ImageUploadArgs;

type SaveFoodVariables = {
  payload: SaveFoodPayload;
  images?: SaveFoodImages;
  notificationCurrent?: () => boolean;
  /**
   * A food made only for the library may be kept on the phone when the server
   * cannot be reached; it then comes back under a pending id.
   */
  keepOffline?: boolean;
};

/** Saves a food; a plain one made for the library may wait on the phone. */
async function saveOrKeep({
  payload,
  images,
  keepOffline,
}: SaveFoodVariables): Promise<FoodItem> {
  const queueable =
    keepOffline === true &&
    isQueueableFoodCreate({
      food: payload,
      hasImages: Boolean(images),
      hasExtraServings: false,
    });
  if (!queueable) return saveFood(payload, images);
  const clientId = newUuid();
  const startedUnder = accountGeneration();
  try {
    return await saveFood({ ...payload, client_id: clientId }, images);
  } catch (error) {
    const queued = await queueAfterConnectionFailure(
      error,
      () => queueFoodCreate(clientId, null, payload, null),
      startedUnder
    );
    if (queued) return foodFromWaiting(clientId, payload);
    throw error;
  }
}

export function useSaveFood() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (variables: SaveFoodVariables) => saveOrKeep(variables),
    onSuccess: (food) => {
      if (isPendingFoodId(food.id)) {
        Toast.show({
          type: 'info',
          text1: t('foodSave.queued', { defaultValue: 'Saved on this phone' }),
          text2: t('foodSave.queuedMessage', {
            defaultValue: 'It uploads when your server can be reached.',
          }),
        });
      }
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
      // Keep an edited food's name/nutrition fresh in the Favorites section
      // (separate query root, 5-min staleTime).
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    },
    onError: (_error, variables) => {
      if (variables.notificationCurrent?.() === false) return;
      Toast.show({
        type: 'error',
        text1: t('foodSave.failed', { defaultValue: 'Failed to save food' }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  // Images stay an optional trailing argument so the many existing callers
  // that never touch photos keep their `saveFoodAsync(payload)` call.
  return {
    saveFood: (payload: SaveFoodPayload, images?: SaveFoodImages) =>
      mutation.mutate({ payload, images }),
    saveFoodAsync: (
      payload: SaveFoodPayload,
      images?: SaveFoodImages,
      notificationCurrent?: () => boolean,
      keepOffline?: boolean
    ) =>
      mutation.mutateAsync({
        payload,
        images,
        notificationCurrent,
        keepOffline,
      }),
    isPending: mutation.isPending,
    isSaved: mutation.isSuccess,
  };
}
