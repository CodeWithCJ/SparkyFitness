import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  createFoodVariant,
  type CreateFoodVariantPayload,
  saveFood,
  type SaveFoodPayload,
} from '../services/api/foodsApi';
import {
  createFoodEntry,
  type CreateFoodEntryPayload,
} from '../services/api/foodEntriesApi';
import {
  dailySummaryQueryKey,
  foodsQueryKey,
  recentMealsQueryKeyRoot,
} from './queryKeys';
import type { FoodEntry } from '../types/foodEntries';
import { mobileT } from '../localization';

export interface AddFoodEntryInput {
  saveFoodPayload?: SaveFoodPayload;
  saveThenCreateVariantPayload?: Omit<CreateFoodVariantPayload, 'food_id'>;
  createEntryPayload: CreateFoodEntryPayload;
}

interface UseAddFoodEntryOptions {
  onSuccess?: (entry: FoodEntry) => void;
}

export function useAddFoodEntry(options?: UseAddFoodEntryOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: AddFoodEntryInput) => {
      if (input.saveFoodPayload) {
        const saved = await saveFood(input.saveFoodPayload);

        let variantId = saved.default_variant.id;
        let unit = input.createEntryPayload.unit;

        if (input.saveThenCreateVariantPayload) {
          const createdVariant = await createFoodVariant({
            food_id: saved.id,
            ...input.saveThenCreateVariantPayload,
          });
          variantId = createdVariant.id;
          unit = createdVariant.serving_unit;
        }

        if (!variantId) {
          throw new Error(
            'Server did not return a variant ID for the saved food',
          );
        }

        return createFoodEntry({
          ...input.createEntryPayload,
          food_id: saved.id,
          variant_id: variantId,
          unit,
        });
      }
      return createFoodEntry(input.createEntryPayload);
    },
    onSuccess: entry => {
      if (entry.meal_id) {
        queryClient.invalidateQueries({
          queryKey: recentMealsQueryKeyRoot,
          refetchType: 'all',
        });
      }
      options?.onSuccess?.(entry);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: mobileT('foodEntry.addFoodFailed'),
        text2: mobileT('common.retry'),
      });
    },
  });

  const invalidateCache = (date: string) => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
  };

  return {
    addEntry: mutation.mutate,
    addEntryAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
