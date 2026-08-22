import { useTranslation } from 'react-i18next';
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
import type { ImageUploadArgs } from '../utils/pickerImages';
import { dailySummaryQueryKey, foodsQueryKey } from './queryKeys';
import { invalidateMealUsageCaches } from './useMeals';
import type { FoodEntry } from '../types/foodEntries';
import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodVariantDetail } from '../types/foods';
import {
  baseServingVariantKey,
  hasDistinctMetricServingContext,
  servingVariantKey,
} from '../utils/foodDetails';
import { persistExternalVariants } from '../utils/persistExternalVariants';

export interface AddFoodEntryInput {
  saveFoodPayload?: SaveFoodPayload;
  /**
   * Photos to upload with the food being created. Without this, a food created
   * from the diary saves with no picture even though the user attached one.
   */
  saveFoodImages?: ImageUploadArgs;
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

type StoredServingReference = Pick<
  FoodVariantDetail,
  'id' | 'serving_size' | 'serving_unit'
>;

const SELECTED_VARIANT_RESOLUTION_ERROR =
  'Could not uniquely resolve the selected serving variant';

/**
 * Resolve the stored variant for the user's selected serving. Prefer one exact
 * encoded unit; only fall back to one legacy unencoded unit. The server-returned
 * default is safe only when its normalized identity exactly matches selection.
 */
async function resolveSelectedVariant(
  foodId: string,
  selectedServingSize: number,
  selectedServingUnit: string,
  defaultVariant:
    | {
        id?: string;
        serving_size: number;
        serving_unit: string;
      }
    | null
    | undefined,
): Promise<StoredServingReference> {
  const selectedIdentity = {
    serving_size: selectedServingSize,
    serving_unit: selectedServingUnit,
  };
  const exactKey = servingVariantKey(selectedIdentity);
  const exactDefault =
    defaultVariant?.id && servingVariantKey(defaultVariant) === exactKey
      ? {
          id: defaultVariant.id,
          serving_size: defaultVariant.serving_size,
          serving_unit: defaultVariant.serving_unit,
        }
      : undefined;

  let allVariants: FoodVariantDetail[];
  try {
    allVariants = await fetchFoodVariants(foodId);
  } catch {
    if (exactDefault) return exactDefault;
    throw new Error(SELECTED_VARIANT_RESOLUTION_ERROR);
  }

  const exactMatches = allVariants.filter(
    variant => servingVariantKey(variant) === exactKey,
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactDefault) return exactDefault;
  if (exactMatches.length > 1) {
    throw new Error(SELECTED_VARIANT_RESOLUTION_ERROR);
  }

  const baseKey = baseServingVariantKey(selectedIdentity);
  const legacyMatches = allVariants.filter(
    variant =>
      !hasDistinctMetricServingContext(variant) &&
      baseServingVariantKey(variant) === baseKey,
  );
  if (legacyMatches.length === 1) return legacyMatches[0];

  throw new Error(SELECTED_VARIANT_RESOLUTION_ERROR);
}

export function useAddFoodEntry(options?: UseAddFoodEntryOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: AddFoodEntryInput) => {
      if (input.saveFoodPayload) {
        const saved = await saveFood(input.saveFoodPayload, input.saveFoodImages);

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
            saved.default_variant,
          );
          variantId = resolvedVariant.id;
          unit = resolvedVariant.serving_unit;
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
    onError: (error) => {
      const text2 =
        error instanceof Error && error.message === SELECTED_VARIANT_RESOLUTION_ERROR
          ? t('foodEntryAdd.errors.chooseDifferentServing', { defaultValue: 'Choose a different serving.' })
          : t('foodEntryAdd.errors.tryAgain', { defaultValue: 'Please try again.' });
      Toast.show({ type: 'error', text1: t('foodEntryAdd.errors.failedToAddFood', { defaultValue: 'Failed to add food' }), text2 });
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
