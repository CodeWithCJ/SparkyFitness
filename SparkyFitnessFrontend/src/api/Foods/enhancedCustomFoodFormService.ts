import { apiCall } from '../api';
import { buildPayloadRequest } from '../imageRequest';

import type { Food, FoodVariant } from '@/types/food';
import {
  buildNamedFoodPortion,
  parseNamedFoodPortion,
} from '@workspace/shared';

export interface FoodCreateProgress {
  savedFood?: Food;
  metadataSignature?: string;
  referenceSignature?: string;
  baselineVariantIds?: string[];
  attemptedVariantKeys?: string[];
}

/** Draft indices refer to the complete variants array submitted to saveFood. */
export type ManagedFoodPortion = { id: string } | { draftIndex: number };

function variantKey(variant: FoodVariant): string {
  return `${Number(variant.serving_size)}|${variant.serving_unit.trim().toLocaleLowerCase()}`;
}

function metadataSignature(food: Food): string {
  return JSON.stringify({ ...food, id: undefined });
}

function referenceSignature(variant: FoodVariant | undefined): string {
  return JSON.stringify(variant ? { ...variant, id: undefined } : null);
}

function rebaseManagedPortions(
  variants: FoodVariant[],
  reference: FoodVariant | undefined,
  managedPortions: readonly ManagedFoodPortion[] = []
): FoodVariant[] {
  if (!reference) return variants;
  return variants.map((variant, index) => {
    if (
      !managedPortions.some((selection) =>
        'id' in selection
          ? selection.id === variant.id
          : !variant.id && selection.draftIndex === index
      )
    )
      return variant;
    const definition = parseNamedFoodPortion(variant.serving_unit);
    if (!definition) return variant;
    const portion = buildNamedFoodPortion(reference, {
      ...definition,
      amount: definition.amount * variant.serving_size,
    });
    if (!portion)
      throw new Error(
        'The saved food reference cannot calculate this portion.'
      );
    return {
      ...variant,
      ...portion,
      serving_size: variant.serving_size,
      serving_unit: variant.serving_unit,
      allergens: reference.allergens ?? variant.allergens,
      traces: reference.traces ?? variant.traces,
    };
  });
}

export const loadFoodVariants = async (
  foodId: string
): Promise<FoodVariant[]> => {
  return apiCall(`/foods/food-variants?food_id=${foodId}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404 errors, return empty array instead
  });
};

export const createFoodVariant = async (
  foodId: string,
  variant: Omit<FoodVariant, 'id'>
): Promise<FoodVariant> => {
  return apiCall('/foods/food-variants', {
    method: 'POST',
    body: {
      food_id: foodId,
      serving_size: variant.serving_size,
      serving_unit: variant.serving_unit,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      saturated_fat: variant.saturated_fat,
      polyunsaturated_fat: variant.polyunsaturated_fat,
      monounsaturated_fat: variant.monounsaturated_fat,
      trans_fat: variant.trans_fat,
      cholesterol: variant.cholesterol,
      sodium: variant.sodium,
      potassium: variant.potassium,
      dietary_fiber: variant.dietary_fiber,
      sugars: variant.sugars,
      vitamin_a: variant.vitamin_a,
      vitamin_c: variant.vitamin_c,
      calcium: variant.calcium,
      iron: variant.iron,
      caffeine_mg: variant.caffeine_mg,
      water_ml: variant.water_ml,
      alcohol_g: variant.alcohol_g,
      abv_percent: variant.abv_percent,
      glycemic_index: variant.glycemic_index,
      is_default: false,
      custom_nutrients: variant.custom_nutrients || {},
      source: variant.source,
      ai_confidence: variant.ai_confidence,
    },
  });
};

/** The server's parseFoodBody unwraps the payload from a `foodData` field. */
const buildFoodRequest = (
  payload: Record<string, unknown>,
  imageFiles?: File[]
) => buildPayloadRequest(payload, 'foodData', imageFiles);

export const saveFood = async (
  foodData: Food,
  variants: FoodVariant[],
  userId: string,
  foodId?: string,
  imageFiles?: File[],
  onFoodPersisted?: (food: Food) => void,
  options: {
    createProgress?: FoodCreateProgress;
    managedPortions?: readonly ManagedFoodPortion[];
  } = {}
): Promise<Food> => {
  let savedFood: Food;

  if (foodId) {
    // A new-food POST may have reused an existing barcode/provider record.
    // Resume that append operation without replacing its metadata or units.
    const resumeCreate =
      options.createProgress?.savedFood?.id === foodId
        ? options.createProgress
        : undefined;
    const metadataChanged =
      resumeCreate?.metadataSignature !== undefined &&
      (metadataSignature(foodData) !== resumeCreate.metadataSignature ||
        !!imageFiles?.length);
    savedFood =
      resumeCreate?.savedFood && !metadataChanged
        ? resumeCreate.savedFood
        : await apiCall(`/foods/${foodId}`, {
            method: 'PUT',
            ...buildFoodRequest(
              {
                ...foodData,
                barcode: foodData.barcode,
                provider_external_id: foodData.provider_external_id,
                provider_type: foodData.provider_type,
                provider_verified: foodData.provider_verified,
                // Images the user kept; newly attached files are appended server-side.
                images: foodData.images ?? [],
              },
              imageFiles
            ),
          });
    if (resumeCreate && savedFood?.id) {
      resumeCreate.savedFood = savedFood;
      resumeCreate.metadataSignature = metadataSignature({
        ...foodData,
        images: savedFood.images ?? foodData.images,
      });
    }
    if (savedFood?.id) onFoodPersisted?.(savedFood);

    // Fetch existing variants to determine what to update/delete/insert
    const existingVariants = await loadFoodVariants(foodId);
    if (resumeCreate && !resumeCreate.baselineVariantIds)
      resumeCreate.baselineVariantIds = existingVariants.flatMap((variant) =>
        variant.id ? [variant.id] : []
      );
    const referenceChanged =
      resumeCreate?.referenceSignature !== undefined &&
      referenceSignature(variants[0]) !== resumeCreate.referenceSignature;
    const storedReference =
      savedFood?.default_variant ??
      existingVariants.find((variant) => variant.is_default);
    const updatedReference =
      referenceChanged && variants[0]
        ? { ...variants[0], id: storedReference?.id, is_default: true }
        : undefined;
    const requestedVariants = resumeCreate
      ? [
          ...(updatedReference ? [updatedReference] : []),
          ...rebaseManagedPortions(
            variants,
            updatedReference ?? storedReference ?? variants[0],
            options.managedPortions
          ).slice(1),
        ]
      : variants;

    // A previous bulk request may have committed before its response failed.
    // Match drafts without IDs to read-back rows before creating or deleting
    // anything, including the default row from a partially completed create.
    const claimedIds = new Set(
      requestedVariants.flatMap((variant) => (variant.id ? [variant.id] : []))
    );
    const reconciledVariants = requestedVariants.map((variant) => {
      if (variant.id) return variant;
      const existing = existingVariants.find(
        (candidate) =>
          candidate.id &&
          !claimedIds.has(candidate.id) &&
          variantKey(candidate) === variantKey(variant)
      );
      if (!existing?.id) return variant;
      claimedIds.add(existing.id);
      return { ...variant, id: existing.id };
    });
    const variantsToCreate = reconciledVariants.filter((v) => !v.id);
    const variantsToUpdate = reconciledVariants.filter(
      (variant) =>
        variant.id &&
        (!resumeCreate ||
          variant.id === updatedReference?.id ||
          !resumeCreate.baselineVariantIds?.includes(variant.id))
    );
    const variantsToDelete = existingVariants.filter(
      (ev) =>
        !reconciledVariants.some((v) => v.id === ev.id) &&
        (!resumeCreate ||
          (!!ev.id &&
            !resumeCreate.baselineVariantIds?.includes(ev.id) &&
            !!resumeCreate.attemptedVariantKeys?.includes(variantKey(ev))))
    );
    if (resumeCreate)
      resumeCreate.attemptedVariantKeys = [
        ...new Set([
          ...(resumeCreate.attemptedVariantKeys ?? []),
          ...requestedVariants
            .filter((variant) => !variant.is_default)
            .map(variantKey),
        ]),
      ];

    // Update existing variants
    for (const variant of variantsToUpdate) {
      await apiCall(`/foods/food-variants/${variant.id}`, {
        method: 'PUT',
        body: {
          food_id: foodId, // Ensure food_id is passed for authorization/validation
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories,
          protein: variant.protein,
          carbs: variant.carbs,
          fat: variant.fat,
          saturated_fat: variant.saturated_fat,
          polyunsaturated_fat: variant.polyunsaturated_fat,
          monounsaturated_fat: variant.monounsaturated_fat,
          trans_fat: variant.trans_fat,
          cholesterol: variant.cholesterol,
          sodium: variant.sodium,
          potassium: variant.potassium,
          dietary_fiber: variant.dietary_fiber,
          sugars: variant.sugars,
          vitamin_a: variant.vitamin_a,
          vitamin_c: variant.vitamin_c,
          calcium: variant.calcium,
          iron: variant.iron,
          caffeine_mg: variant.caffeine_mg,
          water_ml: variant.water_ml,
          alcohol_g: variant.alcohol_g,
          abv_percent: variant.abv_percent,
          is_default: variant.is_default || false,
          glycemic_index: variant.glycemic_index,
          custom_nutrients: variant.custom_nutrients || {},
          source: variant.source,
          ai_confidence: variant.ai_confidence,
          allergens: variant.allergens ?? null,
          traces: variant.traces ?? null,
        },
      });
      if (resumeCreate && variant.id === updatedReference?.id) {
        savedFood = { ...savedFood, default_variant: variant };
        resumeCreate.savedFood = savedFood;
        resumeCreate.referenceSignature = referenceSignature(variants[0]);
        onFoodPersisted?.(savedFood);
      }
    }

    // Create new variants
    if (variantsToCreate.length > 0) {
      const newVariantsData = variantsToCreate.map((variant) => ({
        food_id: foodId,
        serving_size: variant.serving_size,
        serving_unit: variant.serving_unit,
        calories: variant.calories,
        protein: variant.protein,
        carbs: variant.carbs,
        fat: variant.fat,
        saturated_fat: variant.saturated_fat,
        polyunsaturated_fat: variant.polyunsaturated_fat,
        monounsaturated_fat: variant.monounsaturated_fat,
        trans_fat: variant.trans_fat,
        cholesterol: variant.cholesterol,
        sodium: variant.sodium,
        potassium: variant.potassium,
        dietary_fiber: variant.dietary_fiber,
        sugars: variant.sugars,
        vitamin_a: variant.vitamin_a,
        vitamin_c: variant.vitamin_c,
        calcium: variant.calcium,
        iron: variant.iron,
        caffeine_mg: variant.caffeine_mg,
        water_ml: variant.water_ml,
        alcohol_g: variant.alcohol_g,
        abv_percent: variant.abv_percent,
        is_default: variant.is_default || false, // Pass is_default flag
        glycemic_index: variant.glycemic_index,
        custom_nutrients: variant.custom_nutrients || {}, // Include custom nutrients
        source: variant.source,
        ai_confidence: variant.ai_confidence,
        allergens: variant.allergens ?? null,
        traces: variant.traces ?? null,
      }));
      await apiCall('/foods/food-variants/bulk', {
        method: 'POST',
        body: newVariantsData,
      });
    }

    // Delete removed variants
    for (const variantToDelete of variantsToDelete) {
      await apiCall(`/foods/food-variants/${variantToDelete.id}`, {
        method: 'DELETE',
      });
    }
  } else {
    // Create new food
    // The first variant in the array is always the primary unit for the food
    const primaryVariant = variants[0];
    if (!primaryVariant) {
      throw new Error('Primary variant is undefined');
    }
    const foodToCreate = {
      name: foodData.name,
      brand: foodData.brand,
      user_id: userId,
      is_custom: true,
      is_quick_food: foodData.is_quick_food || false,
      barcode: foodData.barcode,
      // The update branch spreads foodData, but this object is explicit, so a
      // new field has to be listed here or it is silently dropped on create.
      notes: foodData.notes ?? null,
      provider_external_id: foodData.provider_external_id,
      provider_type: foodData.provider_type,
      provider_verified: foodData.provider_verified,
      // Ordered image list, same contract as the update branch. Without this
      // a newly created food drops its images entirely: uploads still landed
      // (the server appends them by placeholder) but any URL already in the
      // list — notably a provider photo carried over from an import — was lost.
      images: foodData.images ?? [],
      // Pass primary variant details to createFood, which will create the default variant
      serving_size: primaryVariant.serving_size,
      serving_unit: primaryVariant.serving_unit,
      calories: primaryVariant.calories,
      protein: primaryVariant.protein,
      carbs: primaryVariant.carbs,
      fat: primaryVariant.fat,
      saturated_fat: primaryVariant.saturated_fat,
      polyunsaturated_fat: primaryVariant.polyunsaturated_fat,
      monounsaturated_fat: primaryVariant.monounsaturated_fat,
      trans_fat: primaryVariant.trans_fat,
      cholesterol: primaryVariant.cholesterol,
      sodium: primaryVariant.sodium,
      potassium: primaryVariant.potassium,
      dietary_fiber: primaryVariant.dietary_fiber,
      sugars: primaryVariant.sugars,
      vitamin_a: primaryVariant.vitamin_a,
      vitamin_c: primaryVariant.vitamin_c,
      calcium: primaryVariant.calcium,
      iron: primaryVariant.iron,
      caffeine_mg: primaryVariant.caffeine_mg,
      water_ml: primaryVariant.water_ml,
      alcohol_g: primaryVariant.alcohol_g,
      abv_percent: primaryVariant.abv_percent,
      is_default: true, // Explicitly mark as default for new food creation
      glycemic_index: primaryVariant.glycemic_index,
      custom_nutrients: primaryVariant.custom_nutrients || {}, // Include custom nutrients
      source: primaryVariant.source,
      ai_confidence: primaryVariant.ai_confidence,
    };

    savedFood = await apiCall('/foods', {
      method: 'POST',
      ...buildFoodRequest(foodToCreate, imageFiles),
    });
    // Preserve the identity and consumed images even if additional variants
    // fail. The form can resume against this food on the next Save attempt.
    onFoodPersisted?.(savedFood);
    const progress = options.createProgress;
    if (progress) {
      progress.savedFood = savedFood;
      progress.metadataSignature = metadataSignature({
        ...foodData,
        images: savedFood.images ?? foodData.images,
      });
      progress.referenceSignature = referenceSignature(primaryVariant);
    }

    // Insert additional variants (starting from the second variant)
    let additionalVariants = rebaseManagedPortions(
      variants,
      savedFood.default_variant ?? primaryVariant,
      options.managedPortions
    ).slice(1);
    if (
      additionalVariants.length > 0 &&
      (progress || options.managedPortions?.length)
    ) {
      const baseline = await loadFoodVariants(savedFood.id);
      if (progress) {
        progress.baselineVariantIds = baseline.flatMap((variant) =>
          variant.id ? [variant.id] : []
        );
        progress.attemptedVariantKeys = additionalVariants.map(variantKey);
      }
      additionalVariants = additionalVariants.filter(
        (variant) =>
          !baseline.some(
            (existing) => variantKey(existing) === variantKey(variant)
          )
      );
    }
    const additionalVariantsToInsert = additionalVariants.map((variant) => ({
      food_id: savedFood.id,
      serving_size: variant.serving_size,
      serving_unit: variant.serving_unit,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      saturated_fat: variant.saturated_fat,
      polyunsaturated_fat: variant.polyunsaturated_fat,
      monounsaturated_fat: variant.monounsaturated_fat,
      trans_fat: variant.trans_fat,
      cholesterol: variant.cholesterol,
      sodium: variant.sodium,
      potassium: variant.potassium,
      dietary_fiber: variant.dietary_fiber,
      sugars: variant.sugars,
      vitamin_a: variant.vitamin_a,
      vitamin_c: variant.vitamin_c,
      calcium: variant.calcium,
      iron: variant.iron,
      caffeine_mg: variant.caffeine_mg,
      water_ml: variant.water_ml,
      alcohol_g: variant.alcohol_g,
      abv_percent: variant.abv_percent,
      is_default: false, // Explicitly mark as not default for additional variants
      glycemic_index: variant.glycemic_index,
      custom_nutrients: variant.custom_nutrients || {}, // Include custom nutrients
      source: variant.source,
      ai_confidence: variant.ai_confidence,
      allergens: variant.allergens ?? null,
      traces: variant.traces ?? null,
    }));

    if (additionalVariantsToInsert.length > 0) {
      await apiCall('/foods/food-variants/bulk', {
        method: 'POST',
        body: additionalVariantsToInsert,
      });
    }
  }
  return savedFood;
};
