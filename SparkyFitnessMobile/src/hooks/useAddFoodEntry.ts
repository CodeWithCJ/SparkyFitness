import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { saveFood, type SaveFoodPayload } from '../services/api/foodsApi';
import { createFoodEntry, type CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { dailySummaryQueryKey, foodsQueryKey } from './queryKeys';
import type { FoodEntry } from '../types/foodEntries';

export interface AddFoodEntryInput {
  saveFoodPayload?: SaveFoodPayload;
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
        if (!saved.default_variant.id) {
          throw new Error('Server did not return a variant ID for the saved food');
        }
        return createFoodEntry({
          ...input.createEntryPayload,
          food_id: saved.id,
          variant_id: saved.default_variant.id,
        });
      }
      return createFoodEntry(input.createEntryPayload);
    },
    onSuccess: (entry) => {
      options?.onSuccess?.(entry);
    },
    onError: () => {
      Alert.alert('Failed to add food', 'Please try again.');
    },
  });

  const invalidateCache = (date: string) => {
    queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
    queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
  };

  return {
    addEntry: mutation.mutate,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
