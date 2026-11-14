import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { createFoodEntry } from '../services/api/foodEntriesApi';
import type { FoodEntry } from '../types/foodEntries';
import { buildFoodEntryCopyPayload } from '../utils/foodEntryCopy';
import { invalidateFoodCache } from './invalidateFoodCache';

interface CopyFoodEntryInput {
  entry: FoodEntry;
  targetDate: string;
  targetMealTypeId: string;
  /** 'HH:MM' to log the copy at; omitted keeps the original's time. */
  entryTime?: string;
}

/** Logs a single diary food again on another day or meal. */
export function useCopyFoodEntry(options?: { onSuccess?: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      entry,
      targetDate,
      targetMealTypeId,
      entryTime,
    }: CopyFoodEntryInput) =>
      createFoodEntry(
        buildFoodEntryCopyPayload(
          entry,
          targetDate,
          targetMealTypeId,
          entryTime
        )
      ),
    onSuccess: (_data, { targetDate }) => {
      // Only the target day changes; the source entry is left untouched.
      invalidateFoodCache(queryClient, targetDate);
      Toast.show({
        type: 'success',
        text1: t('foodEntryCopy.foodSuccess', { defaultValue: 'Food copied' }),
      });
      options?.onSuccess?.();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('foodEntryCopy.foodFailed', {
          defaultValue: 'Failed to copy food',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  // isPending only updates on the next render, so a quick double tap could
  // send two creates. The ref blocks a second copy until the first settles.
  const inFlight = useRef(false);
  const { mutate } = mutation;
  const copyFood = useCallback(
    (input: CopyFoodEntryInput) => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutate(input, {
        onSettled: () => {
          inFlight.current = false;
        },
      });
    },
    [mutate]
  );

  return { copyFood, isPending: mutation.isPending };
}
