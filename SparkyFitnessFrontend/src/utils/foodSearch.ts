import type { Food, FoodVariant, NutritionixItem } from '@/types/food';

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
    default_variant: defaultVariant,
    variants: [defaultVariant],
    glycemic_index: source.glycemic_index || 'None',
  };
};

export const isUUID = (uuid: string) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};
