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
import { dailySummaryQueryKey, foodsQueryKey } from './queryKeys';
import { invalidateMealUsageCaches } from './useMeals';
import type { FoodEntry } from '../types/foodEntries';
import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodVariantDetail } from '../types/foods';
import {
  baseServingVariantKey,
  servingVariantKey,
} from '../utils/foodDetails';
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
 * Resolve the stored variant for the user's selected serving. Prefer an exact
 * encoded unit; only fall back to a legacy unencoded unit when it is unique.
 */
async function resolveSelectedVariant(
  foodId: string,
  selectedServingSize: number,
  selectedServingUnit: string,
): Promise<FoodVariantDetail | undefined> {
  try {
    const allVariants = await fetchFoodVariants(foodId);
    const selectedIdentity = {
      serving_size: selectedServingSize,
      serving_unit: selectedServingUnit,
    };
    const exactKey = servingVariantKey(selectedIdentity);
    const exactMatch = allVariants.find(
      variant => servingVariantKey(variant) === exactKey,
    );
    if (exactMatch) return exactMatch;

    const baseKey = baseServingVariantKey(selectedIdentity);
    const legacyMatches = allVariants.filter(
      variant => baseServingVariantKey(variant) === baseKey,
    );
    return legacyMatches.length === 1 ? legacyMatches[0] : undefined;
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

        // If the user selected a non-default external serving, resolve the
        // persisted row and use both its id and actual stored unit. This also
        // handles one unambiguous legacy row without metric context.
        if (!input.saveThenCreateVariantPayload) {
          const selectedServingSize = input.saveFoodPayload.serving_size;
          const selectedServingUnit = input.saveFoodPayload.serving_unit;
          const resolvedVariant = await resolveSelectedVariant(
            saved.id,
            selectedServingSize,
            selectedServingUnit,
          );
          if (resolvedVariant) {
            variantId = resolvedVariant.id;
            unit = resolvedVariant.serving_unit;
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
        invalidateMealUsageCaches(queryClient);
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
