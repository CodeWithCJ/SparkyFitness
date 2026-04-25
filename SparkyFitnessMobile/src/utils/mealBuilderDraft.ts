import type { MealIngredientDraft } from '../types/meals';
import type { FoodItem } from '../types/foods';
import type { FoodDisplayValues } from './foodDetails';

interface BuildMealIngredientDraftInput {
  foodId: string;
  variantId: string;
  quantity: number;
  unit?: string;
  foodName: string;
  brand?: string | null;
  values: FoodDisplayValues;
}

export function buildMealIngredientDraft({
  foodId,
  variantId,
  quantity,
  unit,
  foodName,
  brand,
  values,
}: BuildMealIngredientDraftInput): MealIngredientDraft {
  return {
    food_id: foodId,
    variant_id: variantId,
    quantity,
    unit: unit ?? values.servingUnit,
    food_name: foodName,
    brand: brand ?? null,
    serving_size: values.servingSize,
    serving_unit: values.servingUnit,
    calories: values.calories,
    protein: values.protein,
    carbs: values.carbs,
    fat: values.fat,
    dietary_fiber: values.fiber,
    saturated_fat: values.saturatedFat,
    sodium: values.sodium,
    sugars: values.sugars,
    trans_fat: values.transFat,
    potassium: values.potassium,
    calcium: values.calcium,
    iron: values.iron,
    cholesterol: values.cholesterol,
    vitamin_a: values.vitaminA,
    vitamin_c: values.vitaminC,
  };
}

export function buildMealIngredientDraftFromSavedFood(
  food: FoodItem,
  quantity: number,
  unit?: string,
): MealIngredientDraft {
  if (!food.default_variant.id) {
    throw new Error('Server did not return a variant ID for the saved food');
  }

  return {
    food_id: food.id,
    variant_id: food.default_variant.id,
    quantity,
    unit: unit ?? food.default_variant.serving_unit,
    food_name: food.name,
    brand: food.brand ?? null,
    serving_size: food.default_variant.serving_size,
    serving_unit: food.default_variant.serving_unit,
    calories: food.default_variant.calories,
    protein: food.default_variant.protein,
    carbs: food.default_variant.carbs,
    fat: food.default_variant.fat,
    dietary_fiber: food.default_variant.dietary_fiber,
    saturated_fat: food.default_variant.saturated_fat,
    sodium: food.default_variant.sodium,
    sugars: food.default_variant.sugars,
    trans_fat: food.default_variant.trans_fat,
    potassium: food.default_variant.potassium,
    calcium: food.default_variant.calcium,
    iron: food.default_variant.iron,
    cholesterol: food.default_variant.cholesterol,
    vitamin_a: food.default_variant.vitamin_a,
    vitamin_c: food.default_variant.vitamin_c,
  };
}
