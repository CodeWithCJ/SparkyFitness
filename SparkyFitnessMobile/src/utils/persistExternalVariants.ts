import {
  createFoodVariant,
  fetchFoodVariants,
  type CreateFoodVariantPayload,
} from '../services/api/foodsApi';
import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodVariantDetail } from '../types/foods';

type SavedFoodWithDefaultVariant = {
  id: string;
  default_variant?: {
    serving_size?: number;
    serving_unit?: string;
  } | null;
};

function variantKey(
  variant: { serving_size?: number; serving_unit?: string } | null | undefined,
) {
  return `${variant?.serving_size}:${variant?.serving_unit}`;
}

/**
 * Persist all external provider variants as local food_variants for a saved food.
 *
 * The initial POST /api/foods stores exactly one default_variant. Providers like
 * Yazio can return several serving sizes, so save the remaining variants too,
 * while keeping the operation idempotent for repeated saves/deduped foods.
 */
export async function persistExternalVariants(
  savedFood: SavedFoodWithDefaultVariant,
  externalVariants: ExternalFoodVariant[] | undefined,
) {
  if (!externalVariants || externalVariants.length === 0) return;

  let existingByKey = new Map<string, FoodVariantDetail>();
  let fetchedExistingVariants = false;
  try {
    const existing = await fetchFoodVariants(savedFood.id);
    existingByKey = new Map(
      existing.map(variant => [variantKey(variant), variant]),
    );
    fetchedExistingVariants = true;
  } catch {
    // If we can't check existing variants, fall back to the saved default only.
    // A possible duplicate is less harmful than missing all alternate servings.
  }

  const defaultKey = variantKey(savedFood.default_variant);

  await Promise.all(
    externalVariants.map(async variant => {
      const key = variantKey(variant);
      const existingVariant = existingByKey.get(key);
      if (existingVariant) {
        return;
      }
      if (!fetchedExistingVariants && key === defaultKey) return;

      try {
        await createFoodVariant({
          food_id: savedFood.id,
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories,
          protein: variant.protein,
          carbs: variant.carbs,
          fat: variant.fat,
          saturated_fat: variant.saturated_fat,
          sodium: variant.sodium,
          dietary_fiber: variant.fiber,
          sugars: variant.sugars,
          trans_fat: variant.trans_fat,
          potassium: variant.potassium,
          calcium: variant.calcium,
          iron: variant.iron,
          cholesterol: variant.cholesterol,
          vitamin_a: variant.vitamin_a,
          vitamin_c: variant.vitamin_c,
        } as CreateFoodVariantPayload);
      } catch {
        // Non-blocking: one provider variant failing should not prevent logging.
      }
    }),
  );
}
