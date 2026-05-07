import type { ExternalFoodVariant } from '../types/externalFoods';
import type { FoodInfoItem } from '../types/foodInfo';
import type { FoodVariantDetail } from '../types/foods';
import type { FoodUnitVariant } from '../types/foodUnitVariants';
import type { CreateFoodVariantPayload } from '../services/api/foodsApi';

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

export function unitVariantToDisplayValues(variant: FoodUnitVariant): FoodDisplayValues {
  return {
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
  };
}

export function foodInfoToUnitVariant(item: FoodInfoItem): FoodUnitVariant {
  return {
    id: item.variantId,
    serving_size: item.servingSize,
    serving_unit: item.servingUnit,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    saturated_fat: item.saturatedFat,
    trans_fat: item.transFat,
    cholesterol: item.cholesterol,
    sodium: item.sodium,
    potassium: item.potassium,
    dietary_fiber: item.fiber,
    sugars: item.sugars,
    vitamin_a: item.vitaminA,
    vitamin_c: item.vitaminC,
    calcium: item.calcium,
    iron: item.iron,
    custom_nutrients: item.customNutrients ?? null,
  };
}

export function localVariantToUnitVariant(variant: FoodVariantDetail): FoodUnitVariant {
  return {
    id: variant.id,
    food_id: variant.food_id,
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
    glycemic_index: variant.glycemic_index,
    custom_nutrients: variant.custom_nutrients ?? null,
  };
}

export function externalVariantToUnitVariant(
  variant: ExternalFoodVariant,
  id?: string,
): FoodUnitVariant {
  return {
    id,
    serving_size: variant.serving_size,
    serving_unit: variant.serving_unit,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    saturated_fat: variant.saturated_fat,
    trans_fat: variant.trans_fat,
    cholesterol: variant.cholesterol,
    sodium: variant.sodium,
    potassium: variant.potassium,
    dietary_fiber: variant.fiber,
    sugars: variant.sugars,
    vitamin_a: variant.vitamin_a,
    vitamin_c: variant.vitamin_c,
    calcium: variant.calcium,
    iron: variant.iron,
  };
}

export function formatVariantLabel(values: Pick<FoodDisplayValues, 'servingSize' | 'servingUnit' | 'calories'>): string {
  return `${values.servingSize} ${values.servingUnit} (${values.calories} cal)`;
}

export function buildLocalVariantOptions(
  variants?: FoodVariantDetail[],
): FoodVariantOptionData[] {
  return (variants ?? []).map((variant) => ({
    id: variant.id,
    label: formatVariantLabel({
      servingSize: variant.serving_size,
      servingUnit: variant.serving_unit,
      calories: variant.calories,
    }),
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

export function buildLocalUnitVariants(
  variants?: FoodVariantDetail[],
): FoodUnitVariant[] {
  return (variants ?? []).map(localVariantToUnitVariant);
}

export function buildExternalUnitVariants(
  variants?: ExternalFoodVariant[],
): FoodUnitVariant[] {
  return (variants ?? []).map((variant, index) =>
    externalVariantToUnitVariant(variant, `ext-${index}`),
  );
}

export function buildCreateFoodVariantInput(
  variant: FoodUnitVariant,
): Omit<CreateFoodVariantPayload, 'food_id'> {
  return {
    serving_size: variant.serving_size,
    serving_unit: variant.serving_unit,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
    dietary_fiber: variant.dietary_fiber,
    saturated_fat: variant.saturated_fat,
    polyunsaturated_fat: variant.polyunsaturated_fat,
    monounsaturated_fat: variant.monounsaturated_fat,
    sodium: variant.sodium,
    sugars: variant.sugars,
    trans_fat: variant.trans_fat,
    potassium: variant.potassium,
    calcium: variant.calcium,
    iron: variant.iron,
    cholesterol: variant.cholesterol,
    vitamin_a: variant.vitamin_a,
    vitamin_c: variant.vitamin_c,
    glycemic_index: variant.glycemic_index,
    custom_nutrients: variant.custom_nutrients ?? undefined,
  };
}

export function buildCreateFoodVariantPayload(
  foodId: string,
  variant: FoodUnitVariant,
): CreateFoodVariantPayload {
  return {
    food_id: foodId,
    ...buildCreateFoodVariantInput(variant),
  };
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
