import type { Food, FoodVariant, NutritionixItem } from '@/types/food';

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export const convertNutritionixToFood = (
  item: NutritionixItem,
  nutrientData?: NutritionixItem
): Food => {
  const source = nutrientData || item;

  const defaultVariant: FoodVariant = {
    id: 'default',
    serving_size: item.serving_size || 0,
    serving_unit: item.serving_unit || 'unit',
    calories: source.calories || 0,
    protein: source.protein || 0,
    carbs: source.carbs || 0,
    fat: source.fat || 0,
    saturated_fat: source.saturated_fat || 0,
    polyunsaturated_fat: source.polyunsaturated_fat || 0,
    monounsaturated_fat: source.monounsaturated_fat || 0,
    trans_fat: source.trans_fat || 0,
    cholesterol: source.cholesterol || 0,
    sodium: source.sodium || 0,
    potassium: source.potassium || 0,
    dietary_fiber: source.dietary_fiber || 0,
    sugars: source.sugars || 0,
    vitamin_a: source.vitamin_a || 0,
    vitamin_c: source.vitamin_c || 0,
    calcium: source.calcium || 0,
    iron: source.iron || 0,
    is_default: true,
    glycemic_index: source.glycemic_index || 'None',
  };

  return {
    id: '',
    name: source.food_name || source.name,
    brand: source.brand_name || source.brand,
    is_custom: false,
    provider_external_id: item.id,
    provider_type: 'nutritionix',
    // Nutritionix's instant search exposes the photo as `image`; every other
    // provider calls it `image_url`. Normalize here so the result card renders
    // it and the import carries it, like the rest of the providers.
    image_url: source.image || item.image || null,
    default_variant: defaultVariant,
    variants: [defaultVariant],
    glycemic_index: source.glycemic_index || 'None',
  };
};

// A provider's detail response can flag a different default serving than the
// one the search card displayed (e.g. FatSecret cards advertise "Per 100g"
// while details default to "1 small"). Re-flag the fetched variants so the
// serving the user clicked stays the default in the edit form and on import.
export const pinDefaultVariantToServing = (
  detailed: Food,
  serving?: Pick<
    FoodVariant,
    'serving_size' | 'serving_unit' | 'serving_description'
  >
): Food => {
  const variants = detailed.variants;
  if (!serving || !variants || variants.length === 0) return detailed;

  const sameServing = (v: FoodVariant) =>
    v.serving_size === serving.serving_size &&
    v.serving_unit.trim().toLowerCase() ===
      serving.serving_unit.trim().toLowerCase();

  const candidates = variants.filter(sameServing);
  if (candidates.length === 0) {
    return detailed;
  }

  // Same-named servings can differ only by description ("1 serving (200 g)"
  // vs "1 serving (400 g)"); prefer the exact description when we have one,
  // and otherwise keep the provider's default when it's among the candidates.
  const match =
    candidates.find(
      (v) =>
        serving.serving_description &&
        v.serving_description === serving.serving_description
    ) ??
    candidates.find((v) => v.is_default) ??
    candidates[0];

  if (!match || match.is_default) {
    return detailed;
  }

  const pinned = variants.map((v) => ({ ...v, is_default: v === match }));
  return {
    ...detailed,
    default_variant: pinned.find((v) => v.is_default),
    variants: pinned,
  };
};

export const isUUID = (uuid: string) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};
