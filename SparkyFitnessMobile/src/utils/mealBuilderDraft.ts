import type { MealFood, MealFoodPayload, MealIngredientDraft } from '../types/meals';
import type { FoodEntryMealFood } from '../types/foodEntryMeals';
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

function toFiniteNumber(value: unknown): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function toFiniteString(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : fallback;
}

function normalizeMealIngredientDraft(
  draft: MealIngredientDraft,
): MealIngredientDraft {
  return {
    ...draft,
    quantity: toFiniteNumber(draft.quantity),
    unit: toFiniteString(draft.unit, draft.serving_unit || 'serving'),
    serving_size: toFiniteNumber(draft.serving_size),
    serving_unit: toFiniteString(draft.serving_unit, 'serving'),
    calories: toFiniteNumber(draft.calories),
    protein: toFiniteNumber(draft.protein),
    carbs: toFiniteNumber(draft.carbs),
    fat: toFiniteNumber(draft.fat),
    dietary_fiber:
      draft.dietary_fiber == null ? undefined : toFiniteNumber(draft.dietary_fiber),
    saturated_fat:
      draft.saturated_fat == null ? undefined : toFiniteNumber(draft.saturated_fat),
    sodium: draft.sodium == null ? undefined : toFiniteNumber(draft.sodium),
    sugars: draft.sugars == null ? undefined : toFiniteNumber(draft.sugars),
    trans_fat:
      draft.trans_fat == null ? undefined : toFiniteNumber(draft.trans_fat),
    potassium:
      draft.potassium == null ? undefined : toFiniteNumber(draft.potassium),
    calcium: draft.calcium == null ? undefined : toFiniteNumber(draft.calcium),
    iron: draft.iron == null ? undefined : toFiniteNumber(draft.iron),
    cholesterol:
      draft.cholesterol == null ? undefined : toFiniteNumber(draft.cholesterol),
    vitamin_a:
      draft.vitamin_a == null ? undefined : toFiniteNumber(draft.vitamin_a),
    vitamin_c:
      draft.vitamin_c == null ? undefined : toFiniteNumber(draft.vitamin_c),
  };
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
  return normalizeMealIngredientDraft({
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
  });
}

export function buildMealIngredientDraftFromSavedFood(
  food: FoodItem,
  quantity: number,
  unit?: string,
): MealIngredientDraft {
  if (!food.default_variant.id) {
    throw new Error('Server did not return a variant ID for the saved food');
  }

  return normalizeMealIngredientDraft({
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
  });
}

export function toMealFoodPayload(food: FoodEntryMealFood): MealFoodPayload {
  return {
    food_id: food.food_id,
    variant_id: food.variant_id,
    quantity: food.quantity,
    unit: food.unit,
    food_name: food.food_name,
    serving_size: food.serving_size,
    serving_unit: food.serving_unit,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    saturated_fat: food.saturated_fat,
    polyunsaturated_fat: food.polyunsaturated_fat,
    monounsaturated_fat: food.monounsaturated_fat,
    trans_fat: food.trans_fat,
    cholesterol: food.cholesterol,
    sodium: food.sodium,
    potassium: food.potassium,
    dietary_fiber: food.dietary_fiber,
    sugars: food.sugars,
    vitamin_a: food.vitamin_a,
    vitamin_c: food.vitamin_c,
    calcium: food.calcium,
    iron: food.iron,
    glycemic_index: food.glycemic_index,
    custom_nutrients: food.custom_nutrients,
  };
}

export function buildMealIngredientDraftFromMealFood(food: MealFood): MealIngredientDraft {
  return normalizeMealIngredientDraft({
    food_id: food.food_id,
    variant_id: food.variant_id,
    quantity: food.quantity,
    unit: food.unit,
    food_name: food.food_name,
    brand: food.brand,
    serving_size: food.serving_size,
    serving_unit: food.serving_unit,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    dietary_fiber: food.dietary_fiber,
    saturated_fat: food.saturated_fat,
    sodium: food.sodium,
    sugars: food.sugars,
    trans_fat: food.trans_fat,
    potassium: food.potassium,
    calcium: food.calcium,
    iron: food.iron,
    cholesterol: food.cholesterol,
    vitamin_a: food.vitamin_a,
    vitamin_c: food.vitamin_c,
    custom_nutrients: food.custom_nutrients,
  });
}
