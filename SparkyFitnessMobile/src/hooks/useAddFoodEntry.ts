import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  createFoodVariant,
  fetchFoodVariants,
  type CreateFoodVariantPayload,
  saveFood,
  type SaveFoodPayload,
} from '../services/api/foodsApi';
import { createFoodEntry, type CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { dailySummaryQueryKey, foodsQueryKey, recentMealsQueryKeyRoot } from './queryKeys';
import type { FoodEntry } from '../types/foodEntries';
import type { ExternalFoodVariant } from '../types/externalFoods';
import { persistExternalVariants } from '../utils/persistExternalVariants';

export interface AddFoodEntryInput {
  saveFoodPayload?: SaveFoodPayload;
  saveThenCreateVariantPayload?: Omit<CreateFoodVariantPayload, 'food_id'>;
  /**
   * All external provider variants for the food being added.
   * After persisting missing variants, the hook matches the user's selected
   * variant (saveThenCreateVariantPayload or saveFoodPayload.serving_size/unit)
   * against the persisted food_variants to pick the correct variant_id.
   */
  externalVariants?: ExternalFoodVariant[];
  createEntryPayload: CreateFoodEntryPayload;
}

interface UseAddFoodEntryOptions {
  onSuccess?: (entry: FoodEntry) => void;
}

/**
 * Resolve the DB variant_id that matches the user's selected serving,
 * after persistExternalVariants has ensured all provider variants exist.
 */
async function resolveSelectedVariantId(
  foodId: string,
  selectedServingSize: number,
  selectedServingUnit: string,
): Promise<string | undefined> {
  try {
    const allVariants = await fetchFoodVariants(foodId);
    const match = allVariants.find(
      (v) => v.serving_size === selectedServingSize && v.serving_unit === selectedServingUnit
    );
    return match?.id;
  } catch {
    return undefined;
  }
}

export function useAddFoodEntry(options?: UseAddFoodEntryOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: AddFoodEntryInput) => {
      if (input.saveFoodPayload) {
        const saved = await saveFood(input.saveFoodPayload);

        let variantId = saved.default_variant?.id;
        let unit = input.createEntryPayload.unit;

        if (input.saveThenCreateVariantPayload) {
          const createdVariant = await createFoodVariant({
            food_id: saved.id,
            ...input.saveThenCreateVariantPayload,
          });
          variantId = createdVariant.id;
          unit = createdVariant.serving_unit;
        }

        // Persist any missing external provider variants.
        await persistExternalVariants(saved, input.externalVariants);

        // If we used the default variant but the user actually selected a
        // different external serving (e.g. "1 Portion" instead of "100 g"),
        // look up the correct persisted variant id.
        if (!input.saveThenCreateVariantPayload) {
          const selectedServingSize = input.saveFoodPayload.serving_size;
          const selectedServingUnit = input.saveFoodPayload.serving_unit;
          const resolvedId = await resolveSelectedVariantId(
            saved.id,
            selectedServingSize,
            selectedServingUnit,
          );
          if (resolvedId) {
            variantId = resolvedId;
          }
          // If the user's selected variant differs from the default, also
          // update the entry unit to match the selected variant's unit.
          if (input.externalVariants) {
            const selected = input.externalVariants.find(
              (v) => v.serving_size === selectedServingSize && v.serving_unit === selectedServingUnit,
            );
            if (selected) {
              unit = selected.serving_unit;
            }
          }
        }

        if (!variantId) {
          throw new Error('Server did not return a variant ID for the saved food');
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
    onSuccess: (entry) => {
      if (entry.meal_id) {
        queryClient.invalidateQueries({ queryKey: recentMealsQueryKeyRoot, refetchType: 'all' });
      }
      options?.onSuccess?.(entry);
    },
    onError: () => {
      Toast.show({ type: 'error', text1: 'Failed to add food', text2: 'Please try again.' });
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
