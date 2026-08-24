import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  setFoodEntryImages,
  clearFoodEntryImage,
  setFoodEntryMealImages,
  clearFoodEntryMealImage,
} from '../services/api/entryImagesApi';
import { dailySummaryQueryKey, foodEntryMealDetailQueryKey } from './queryKeys';
import { splitPickerImages, type PickerImage } from '../utils/pickerImages';

/**
 * Diary per-entry photo mutations.
 *
 * The default staleTime is Infinity, so each of these invalidates the day it
 * changed — the diary will not refetch on its own.
 */

type EntryImageOptions<TResult> = {
  entryDate: string;
  /** Extra keys to invalidate beyond the day summary. */
  extraKeys?: readonly (readonly unknown[])[];
  onSuccess?: (result: TResult) => void;
  errorText: string;
};

/**
 * One mutation shape for all four endpoints: set and clear differ only in what
 * they call and what they take, so the invalidation and error handling live
 * here once.
 */
function useEntryImageMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  options: EntryImageOptions<TResult>,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { entryDate, extraKeys, onSuccess, errorText } = options;

  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(entryDate),
      });
      for (const queryKey of extraKeys ?? []) {
        queryClient.invalidateQueries({ queryKey });
      }
      onSuccess?.(result);
    },
    onError: () => {
      Toast.show({ type: 'error', text1: errorText, text2: t('common.pleaseTryAgain', { defaultValue: 'Please try again.' }) });
    },
  });
}

export function useSetFoodEntryImages(
  entryId: string,
  entryDate: string,
  options?: { onSuccess?: (result: Awaited<ReturnType<typeof setFoodEntryImages>>) => void },
) {
  const { t } = useTranslation();
  const mutation = useEntryImageMutation(
    (items: PickerImage[]) => {
      const { order, newUris } = splitPickerImages(items);
      return setFoodEntryImages(entryId, order, newUris);
    },
    {
      entryDate,
      onSuccess: options?.onSuccess,
      errorText: t('entryImage.saveFailed', { defaultValue: 'Failed to save photo' }),
    },
  );

  return {
    setImages: mutation.mutate,
    setImagesAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useClearFoodEntryImage(
  entryId: string,
  entryDate: string,
  options?: { onSuccess?: () => void },
) {
  const { t } = useTranslation();
  const mutation = useEntryImageMutation<void, void>(() => clearFoodEntryImage(entryId), {
    entryDate,
    onSuccess: options?.onSuccess,
    errorText: t('entryImage.removeFailed', { defaultValue: 'Failed to remove photo' }),
  });

  return { clearImage: () => mutation.mutate(), isPending: mutation.isPending };
}

export function useSetFoodEntryMealImages(
  entryId: string,
  entryDate: string,
  options?: { onSuccess?: () => void },
) {
  const { t } = useTranslation();
  const mutation = useEntryImageMutation(
    (items: PickerImage[]) => {
      const { order, newUris } = splitPickerImages(items);
      return setFoodEntryMealImages(entryId, order, newUris);
    },
    {
      entryDate,
      extraKeys: [foodEntryMealDetailQueryKey(entryId)],
      onSuccess: options?.onSuccess,
      errorText: t('entryImage.saveFailed', { defaultValue: 'Failed to save photo' }),
    },
  );

  return {
    setImages: mutation.mutate,
    setImagesAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useClearFoodEntryMealImage(
  entryId: string,
  entryDate: string,
  options?: { onSuccess?: () => void },
) {
  const { t } = useTranslation();
  const mutation = useEntryImageMutation<void, void>(
    () => clearFoodEntryMealImage(entryId),
    {
      entryDate,
      extraKeys: [foodEntryMealDetailQueryKey(entryId)],
      onSuccess: options?.onSuccess,
      errorText: t('entryImage.removeFailed', { defaultValue: 'Failed to remove photo' }),
    },
  );

  return { clearImage: () => mutation.mutate(), isPending: mutation.isPending };
}
