import {
  createFoodVariant,
  fetchFoodVariants,
  type CreateFoodVariantPayload,
} from '../services/api/foodsApi';
import type { ExternalFoodVariant } from '../types/externalFoods';
import {
  baseServingVariantKey,
  hasDistinctMetricServingContext,
  servingVariantKey,
  toPersistedServingUnit,
} from './foodDetails';

type SavedFoodWithDefaultVariant = {
  id: string;
  default_variant?: {
    serving_size?: number;
    serving_unit?: string;
  } | null;
};

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

  const existingKeys = new Set<string>();
  const legacyExistingBaseKeyCounts = new Map<string, number>();
  let fetchedExistingVariants = false;
  try {
    const existing = await fetchFoodVariants(savedFood.id);
    existing.forEach(variant => {
      existingKeys.add(servingVariantKey(variant));
      if (!hasDistinctMetricServingContext(variant)) {
        const baseKey = baseServingVariantKey(variant);
        legacyExistingBaseKeyCounts.set(
          baseKey,
          (legacyExistingBaseKeyCounts.get(baseKey) ?? 0) + 1,
        );
      }
    });
    fetchedExistingVariants = true;
  } catch {
    // If we can't check existing variants, fall back to the saved default only.
    // A possible duplicate is less harmful than missing all alternate servings.
  }

  const defaultKey = servingVariantKey(savedFood.default_variant ?? {});
  const externalBaseKeyCounts = externalVariants.reduce((counts, variant) => {
    const key = baseServingVariantKey(variant);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const variantsToCreate = externalVariants.filter(variant => {
    const key = servingVariantKey(variant);
    if (existingKeys.has(key)) return false;
    const baseKey = baseServingVariantKey(variant);
    if (
      externalBaseKeyCounts.get(baseKey) === 1 &&
      legacyExistingBaseKeyCounts.get(baseKey) === 1
    ) {
      return false;
    }
    if (!fetchedExistingVariants && key === defaultKey) return false;
    existingKeys.add(key);
    return true;
  });

  await Promise.all(
    variantsToCreate.map(async variant => {
      try {
        await createFoodVariant({
          food_id: savedFood.id,
          serving_size: variant.serving_size,
          serving_unit: toPersistedServingUnit(variant),
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
        } satisfies CreateFoodVariantPayload);
      } catch {
        // Non-blocking: one provider variant failing should not prevent logging.
      }
    }),
  );
}
