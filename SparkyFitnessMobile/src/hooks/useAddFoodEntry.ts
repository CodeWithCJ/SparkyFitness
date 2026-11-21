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
import {
  createFoodEntry,
  type CreateFoodEntryPayload,
} from '../services/api/foodEntriesApi';
import type { ImageUploadArgs } from '../utils/pickerImages';
import { invalidateFoodCache } from './invalidateFoodCache';
import { invalidateMealUsageCaches } from './useMeals';
import type { FoodEntry } from '../types/foodEntries';
import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodItem, FoodVariantDetail } from '../types/foods';
import {
  baseServingVariantKey,
  hasDistinctMetricServingContext,
  servingVariantKey,
} from '../utils/foodDetails';
import { persistExternalVariants } from '../utils/persistExternalVariants';
import { queueAfterConnectionFailure } from '../offline/queueAfterFailure';
import {
  isQueueableFoodEntry,
  queueFoodEntry,
} from '../offline/foodEntryHandOver';
import { newUuid } from '../utils/ids';

const PENDING_ENTRY_PREFIX = 'pending-';

/** True for an entry that is waiting on the phone, not yet on the server. */
export function isPendingEntry(entry: Pick<FoodEntry, 'id'>): boolean {
  return entry.id.startsWith(PENDING_ENTRY_PREFIX);
}

/**
 * A diary entry as it will read once uploaded, for the screens that carry on
 * with the entry they were handed. Its id is the replay key, marked pending.
 */
function pendingEntryFrom(
  clientId: string,
  payload: CreateFoodEntryPayload
): FoodEntry {
  return {
    id: `${PENDING_ENTRY_PREFIX}${clientId}`,
    food_id: payload.food_id,
    variant_id: payload.variant_id,
    meal_type: '',
    meal_type_id: payload.meal_type_id,
    quantity: payload.quantity,
    unit: payload.unit,
    notes: payload.notes,
    food_name: payload.food_name,
    brand_name: payload.brand_name,
    entry_date: payload.entry_date,
    entry_time: payload.entry_time,
    serving_size: payload.serving_size ?? payload.quantity,
    serving_unit: payload.serving_unit ?? payload.unit,
    calories: payload.calories ?? 0,
  };
}

/**
 * Logs an entry that needs nothing created first. It carries a replay key
 * from the first request on, so a request that reached the server but lost
 * its answer is logged once when it is sent again. When the server cannot be
 * reached the entry is kept on the phone and uploads later, never after a
 * timeout (the server may have it already).
 */
async function createOrQueueFoodEntry(
  payload: CreateFoodEntryPayload
): Promise<FoodEntry> {
  const clientId = newUuid();
  try {
    return await createFoodEntry({ ...payload, client_id: clientId });
  } catch (error) {
    const queued =
      isQueueableFoodEntry(payload) &&
      (await queueAfterConnectionFailure(error, () =>
        queueFoodEntry(clientId, payload)
      ));
    if (queued) return pendingEntryFrom(clientId, payload);
    throw error;
  }
}

export interface AddFoodEntryInput {
  saveFoodPayload?: SaveFoodPayload;
  /** Reuse the food saved by this form's earlier attempt without another POST. */
  savedFood?: FoodItem;
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
  onFoodSaved?: (food: FoodItem) => void;
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
export async function resolveSelectedVariant(
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
    | undefined
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
    (variant) => servingVariantKey(variant) === exactKey
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactDefault) return exactDefault;
  if (exactMatches.length > 1) {
    throw new Error(SELECTED_VARIANT_RESOLUTION_ERROR);
  }

  const baseKey = baseServingVariantKey(selectedIdentity);
  const legacyMatches = allVariants.filter(
    (variant) =>
      !hasDistinctMetricServingContext(variant) &&
      baseServingVariantKey(variant) === baseKey
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
        const saved =
          input.savedFood ??
          (await saveFood(input.saveFoodPayload, input.saveFoodImages));
        if (!input.savedFood) options?.onFoodSaved?.(saved);

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
            saved.default_variant
          );
          variantId = resolvedVariant.id;
          unit = resolvedVariant.serving_unit;
        }

        if (!variantId) {
          throw new Error(
            'Server did not return a variant ID for the saved food'
          );
        }

        return createFoodEntry({
          ...input.createEntryPayload,
          food_id: saved.id,
          variant_id: variantId,
          unit,
        });
      }
      return createOrQueueFoodEntry(input.createEntryPayload);
    },
    onSuccess: (entry) => {
      if (isPendingEntry(entry)) {
        Toast.show({
          type: 'info',
          text1: t('foodEntryAdd.queued', {
            defaultValue: 'Saved on this phone',
          }),
          text2: t('foodEntryAdd.queuedMessage', {
            defaultValue: 'It uploads when your server can be reached.',
          }),
        });
      } else {
        invalidateCache(entry.entry_date);
      }
      if (entry.meal_id) {
        invalidateMealUsageCaches(queryClient);
      }
      options?.onSuccess?.(entry);
    },
    onError: (error) => {
      const text2 =
        error instanceof Error &&
        error.message === SELECTED_VARIANT_RESOLUTION_ERROR
          ? t('foodEntryAdd.errors.chooseDifferentServing', {
              defaultValue: 'Choose a different serving.',
            })
          : t('foodEntryAdd.errors.tryAgain', {
              defaultValue: 'Please try again.',
            });
      Toast.show({
        type: 'error',
        text1: t('foodEntryAdd.errors.failedToAddFood', {
          defaultValue: 'Failed to add food',
        }),
        text2,
      });
    },
  });

  const invalidateCache = (date: string) => {
    invalidateFoodCache(queryClient, date);
  };

  return {
    addEntry: mutation.mutate,
    addEntryAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    invalidateCache,
  };
}
