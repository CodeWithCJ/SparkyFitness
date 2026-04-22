import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodInfoItem } from '../types/foodInfo';
import type { FoodVariantDetail } from '../types/foods';

export interface FoodDisplayValues {
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  saturatedFat?: number;
  sodium?: number;
  sugars?: number;
  transFat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitaminA?: number;
  vitaminC?: number;
}

export interface FoodVariantOptionData extends FoodDisplayValues {
  id: string;
  label: string;
}

export function foodInfoToDisplayValues(item: FoodInfoItem): FoodDisplayValues {
  return {
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    fiber: item.fiber,
    saturatedFat: item.saturatedFat,
    sodium: item.sodium,
    sugars: item.sugars,
    transFat: item.transFat,
    potassium: item.potassium,
    calcium: item.calcium,
    iron: item.iron,
    cholesterol: item.cholesterol,
    vitaminA: item.vitaminA,
    vitaminC: item.vitaminC,
  };
}

export function buildLocalVariantOptions(
  variants?: FoodVariantDetail[],
): FoodVariantOptionData[] {
  return (variants ?? []).map((variant) => ({
    id: variant.id,
    label: `${variant.serving_size} ${variant.serving_unit} (${variant.calories} cal)`,
    servingSize: variant.serving_size,
    servingUnit: variant.serving_unit,
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
    cholesterol: variant.cholesterol,
    vitaminA: variant.vitamin_a,
    vitaminC: variant.vitamin_c,
  }));
}

export function buildExternalVariantOptions(
  variants?: ExternalFoodVariant[],
): FoodVariantOptionData[] {
  return (variants ?? []).map((variant, index) => ({
    id: `ext-${index}`,
    label: `${variant.serving_description} (${variant.calories} cal)`,
    servingSize: variant.serving_size,
    servingUnit: variant.serving_unit,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    fiber: variant.fiber,
    saturatedFat: variant.saturated_fat,
    sodium: variant.sodium,
    sugars: variant.sugars,
    transFat: variant.trans_fat,
    potassium: variant.potassium,
    calcium: variant.calcium,
    iron: variant.iron,
    cholesterol: variant.cholesterol,
    vitaminA: variant.vitamin_a,
    vitaminC: variant.vitamin_c,
  }));
}

export function resolveFoodDisplayValues({
  item,
  selectedVariantId,
  localVariantOptions = [],
  externalVariantOptions = [],
}: {
  item: FoodInfoItem;
  selectedVariantId?: string;
  localVariantOptions?: FoodVariantOptionData[];
  externalVariantOptions?: FoodVariantOptionData[];
}): FoodDisplayValues {
  if (selectedVariantId) {
    const selectedVariant =
      localVariantOptions.find((variant) => variant.id === selectedVariantId)
      ?? externalVariantOptions.find((variant) => variant.id === selectedVariantId);

    if (selectedVariant) {
      return selectedVariant;
    }
  }

  return foodInfoToDisplayValues(item);
}

export function applyDisplayValuesToFoodInfo(
  item: FoodInfoItem,
  displayValues: FoodDisplayValues,
  variantId?: string,
): FoodInfoItem {
  return {
    ...item,
    servingSize: displayValues.servingSize,
    servingUnit: displayValues.servingUnit,
    calories: displayValues.calories,
    protein: displayValues.protein,
    carbs: displayValues.carbs,
    fat: displayValues.fat,
    fiber: displayValues.fiber,
    saturatedFat: displayValues.saturatedFat,
    sodium: displayValues.sodium,
    sugars: displayValues.sugars,
    transFat: displayValues.transFat,
    potassium: displayValues.potassium,
    calcium: displayValues.calcium,
    iron: displayValues.iron,
    cholesterol: displayValues.cholesterol,
    vitaminA: displayValues.vitaminA,
    vitaminC: displayValues.vitaminC,
    variantId,
  };
}
