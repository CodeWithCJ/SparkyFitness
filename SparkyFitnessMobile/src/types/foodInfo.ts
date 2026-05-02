import type { FoodItem, TopFoodItem } from './foods';
import type { ExternalFoodItem, ExternalFoodVariant } from './externalFoods';
import type { Meal, MealIngredientDraft } from './meals';
import type { BarcodeFood } from '../services/api/externalFoodSearchApi';
import { parseDecimalInput } from '../utils/numericInput';

/** Convert a numeric value to a form-compatible string. Returns '' for null/undefined. */
export const toFormString = (v: number | null | undefined): string =>
  v != null ? String(v) : '';

/** Parse an optional form string to a number. Returns undefined for empty strings. */
export const parseOptional = (s: string): number | undefined =>
  s === '' ? undefined : (parseDecimalInput(s) || 0);

/** Ordered list of extra nutrient fields for display and form conversion. */
export const EXTRA_NUTRIENT_FIELDS = [
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sugars', label: 'Sugars', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated Fat', unit: 'g' },
  { key: 'transFat', label: 'Trans Fat', unit: 'g' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', additional: true },
  { key: 'calcium', label: 'Calcium', unit: 'mg', additional: true },
  { key: 'iron', label: 'Iron', unit: 'mg', additional: true },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', additional: true },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', additional: true },
] as const;

type ExtraNutrientKey = typeof EXTRA_NUTRIENT_FIELDS[number]['key'];

export interface NutrientDisplayItem {
  label: string;
  value: number;
  unit: string;
}

/** Build primary + additional display lists from a camelCase nutrient source. */
export function buildNutrientDisplayList(source: Partial<Record<ExtraNutrientKey, number>>) {
  const primary: NutrientDisplayItem[] = [];
  const additional: NutrientDisplayItem[] = [];
  for (const field of EXTRA_NUTRIENT_FIELDS) {
    const value = source[field.key];
    if (value == null) continue;
    const item: NutrientDisplayItem = { label: field.label, value, unit: field.unit };
    if ('additional' in field && field.additional) {
      additional.push(item);
    } else {
      primary.push(item);
    }
  }
  return { primary, additional };
}

export interface FoodInfoItem {
  id: string;
  name: string;
  brand: string | null;
  userId?: string;
  sharedWithPublic?: boolean;
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
  customNutrients?: Record<string, string | number> | null;
  variantId?: string;
  externalVariants?: ExternalFoodVariant[];
  source: 'local' | 'external' | 'meal';
  originalItem:
    | FoodItem
    | TopFoodItem
    | ExternalFoodItem
    | Meal
    | MealIngredientDraft
    | BarcodeFood;
}

export const foodItemToFoodInfo = (item: FoodItem | TopFoodItem ): FoodInfoItem => ({
  id: item.id,
  name: item.name,
  brand: item.brand,
  userId: item.user_id,
  sharedWithPublic: item.shared_with_public,
  servingSize: item.default_variant.serving_size,
  servingUnit: item.default_variant.serving_unit,
  calories: item.default_variant.calories,
  protein: item.default_variant.protein,
  carbs: item.default_variant.carbs,
  fat: item.default_variant.fat,
  fiber: item.default_variant.dietary_fiber,
  saturatedFat: item.default_variant.saturated_fat,
  sodium: item.default_variant.sodium,
  sugars: item.default_variant.sugars,
  transFat: item.default_variant.trans_fat,
  potassium: item.default_variant.potassium,
  calcium: item.default_variant.calcium,
  iron: item.default_variant.iron,
  cholesterol: item.default_variant.cholesterol,
  vitaminA: item.default_variant.vitamin_a,
  vitaminC: item.default_variant.vitamin_c,
  customNutrients: item.default_variant.custom_nutrients ?? null,
  variantId: item.default_variant.id,
  source: 'local',
  originalItem: item,
});

export const externalFoodItemToFoodInfo = (item: ExternalFoodItem): FoodInfoItem => ({
  id: item.id,
  name: item.name,
  brand: item.brand,
  servingSize: item.serving_size,
  servingUnit: item.serving_unit,
  calories: item.calories,
  protein: item.protein,
  carbs: item.carbs,
  fat: item.fat,
  fiber: item.fiber,
  saturatedFat: item.saturated_fat,
  sodium: item.sodium,
  sugars: item.sugars,
  transFat: item.trans_fat,
  potassium: item.potassium,
  calcium: item.calcium,
  iron: item.iron,
  cholesterol: item.cholesterol,
  vitaminA: item.vitamin_a,
  vitaminC: item.vitamin_c,
  externalVariants: item.variants,
  source: 'external',
  originalItem: item,
});

export const mealToFoodInfo = (meal: Meal): FoodInfoItem => {
  const scale = (food: Meal['foods'][number]) =>
    food.serving_size === 0 ? 0 : food.quantity / food.serving_size;

  const sumField = (field: keyof Meal['foods'][number]) =>
    meal.foods.reduce((sum, f) => {
      const v = f[field];
      return typeof v === 'number' ? sum + v * scale(f) : sum;
    }, 0);

  const calories = sumField('calories');
  const protein = sumField('protein');
  const carbs = sumField('carbs');
  const fat = sumField('fat');

  const hasField = (field: keyof Meal['foods'][number]) =>
    meal.foods.some((f) => f[field] != null);

  return {
    id: meal.id,
    name: meal.name,
    brand: null,
    servingSize: meal.serving_size,
    servingUnit: meal.serving_unit,
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    fiber: hasField('dietary_fiber') ? Math.round(sumField('dietary_fiber')) : undefined,
    saturatedFat: hasField('saturated_fat') ? Math.round(sumField('saturated_fat')) : undefined,
    sodium: hasField('sodium') ? Math.round(sumField('sodium')) : undefined,
    sugars: hasField('sugars') ? Math.round(sumField('sugars')) : undefined,
    transFat: hasField('trans_fat') ? Math.round(sumField('trans_fat')) : undefined,
    potassium: hasField('potassium') ? Math.round(sumField('potassium')) : undefined,
    calcium: hasField('calcium') ? Math.round(sumField('calcium')) : undefined,
    iron: hasField('iron') ? Math.round(sumField('iron')) : undefined,
    cholesterol: hasField('cholesterol') ? Math.round(sumField('cholesterol')) : undefined,
    vitaminA: hasField('vitamin_a') ? Math.round(sumField('vitamin_a')) : undefined,
    vitaminC: hasField('vitamin_c') ? Math.round(sumField('vitamin_c')) : undefined,
    source: 'meal',
    originalItem: meal,
  };
};

export const mealIngredientDraftToFoodInfo = (
  ingredient: MealIngredientDraft,
): FoodInfoItem => ({
  id: ingredient.food_id,
  name: ingredient.food_name || 'Food',
  brand: ingredient.brand,
  servingSize: ingredient.serving_size,
  servingUnit: ingredient.serving_unit,
  calories: ingredient.calories,
  protein: ingredient.protein,
  carbs: ingredient.carbs,
  fat: ingredient.fat,
  fiber: ingredient.dietary_fiber,
  saturatedFat: ingredient.saturated_fat,
  sodium: ingredient.sodium,
  sugars: ingredient.sugars,
  transFat: ingredient.trans_fat,
  potassium: ingredient.potassium,
  calcium: ingredient.calcium,
  iron: ingredient.iron,
  cholesterol: ingredient.cholesterol,
  vitaminA: ingredient.vitamin_a,
  vitaminC: ingredient.vitamin_c,
  variantId: ingredient.variant_id,
  source: 'local',
  originalItem: ingredient,
});
