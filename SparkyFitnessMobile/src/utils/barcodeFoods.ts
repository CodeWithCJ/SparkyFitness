import type { BarcodeLookupResult } from '../services/api/externalFoodSearchApi';
import type { FoodInfoItem } from '../types/foodInfo';
import { selectDisplayVariant } from './foodDetails';

export interface BarcodeLookupContext {
  barcode: string;
  providerId?: string | null;
  providerName?: string;
  accountId?: string;
}

/** Used by the initial scan and a later source switch, including local hits. */
export function barcodeResultToFoodInfo(
  result: BarcodeLookupResult,
  barcode: string
): FoodInfoItem {
  if (!result.food) throw new Error('Barcode result has no food');
  const food = result.food;
  const isLocal = result.source === 'local';
  const { displayVariant, orderedVariants } = selectDisplayVariant(
    food.default_variant,
    food.variants
  );
  const variant = isLocal ? food.default_variant : displayVariant;
  return {
    id: isLocal ? food.id! : (food.provider_external_id ?? food.id ?? ''),
    name: food.name,
    brand: food.brand,
    barcode: food.barcode ?? barcode,
    provider_type: food.provider_type,
    provider_external_id: food.provider_external_id ?? undefined,
    is_custom: food.is_custom,
    servingSize: variant.serving_size,
    servingUnit: variant.serving_unit,
    servingDescription: variant.serving_description,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    fiber: variant.dietary_fiber,
    saturatedFat: variant.saturated_fat,
    sodium: variant.sodium,
    sugars: variant.sugars,
    transFat: variant.trans_fat,
    potassium: variant.potassium,
    calcium: variant.calcium,
    iron: variant.iron,
    caffeineMg: variant.caffeine_mg,
    waterMl: variant.water_ml,
    alcoholG: variant.alcohol_g,
    cholesterol: variant.cholesterol,
    vitaminA: variant.vitamin_a,
    vitaminC: variant.vitamin_c,
    customNutrients: variant.custom_nutrients,
    allergens: variant.allergens ?? null,
    traces: variant.traces ?? null,
    variantId: variant.id,
    source: isLocal ? 'local' : 'external',
    provider_verified: food.provider_verified,
    images: food.images ?? null,
    image_url: food.image_url ?? null,
    image_source_url: food.image_source_url ?? null,
    externalVariants: isLocal
      ? undefined
      : orderedVariants?.map((v) => ({
          ...v,
          serving_description:
            v.serving_description ?? `${v.serving_size} ${v.serving_unit}`,
          fiber: v.dietary_fiber,
        })),
    originalItem: food,
  };
}
