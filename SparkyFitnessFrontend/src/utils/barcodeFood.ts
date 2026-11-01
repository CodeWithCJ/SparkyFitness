import { FOOD_PROVIDER_TYPES, type NormalizedFood } from '@workspace/shared';
import type { Food, FoodVariant, GlycemicIndex } from '@/types/food';

function glycemicIndex(value: string | undefined): GlycemicIndex | undefined {
  switch (value) {
    case 'None':
    case 'Very Low':
    case 'Low':
    case 'Medium':
    case 'High':
    case 'Very High':
      return value;
    default:
      return undefined;
  }
}

function foodVariant(variant: NormalizedFood['default_variant']): FoodVariant {
  return { ...variant, glycemic_index: glycemicIndex(variant.glycemic_index) };
}

/** Keep a chosen source's identity and original portions together on import. */
export function barcodeFoodToFood(food: NormalizedFood): Food {
  return {
    ...food,
    id: food.id ?? '',
    provider_type:
      food.provider_type === 'nutritionix'
        ? 'nutritionix'
        : FOOD_PROVIDER_TYPES.find((type) => type === food.provider_type),
    default_variant: foodVariant(food.default_variant),
    variants: food.variants?.map(foodVariant),
  };
}
