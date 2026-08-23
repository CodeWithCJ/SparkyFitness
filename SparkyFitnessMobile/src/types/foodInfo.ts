import type { FoodItem, TopFoodItem } from './foods';
import type { ExternalFoodItem, ExternalFoodVariant } from './externalFoods';
import type { Meal, MealIngredientDraft } from './meals';
import type { BarcodeFood } from '../services/api/externalFoodSearchApi';
import type { TFunction } from 'i18next';
import { localizeNutrientKey } from '../utils/nutrientLocalization';
import { parseDecimalInput, toFiniteNumber } from '../utils/numericInput';

/** Convert a numeric value to a form-compatible string. Returns '' for null/undefined. */
export const toFormString = (v: number | null | undefined): string =>
  v != null ? String(v) : '';

/** Parse an optional form string to a number. Returns undefined for empty strings. */
export const parseOptional = (s: string): number | undefined =>
  s === '' ? undefined : (parseDecimalInput(s) || 0);

function toOptionalFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }

  const numericValue = toFiniteNumber(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}


/** Ordered list of extra nutrient fields for display and form conversion. */
export const EXTRA_NUTRIENT_FIELDS = [
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'sugars', label: 'Sugars', unit: 'g' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'saturatedFat', label: 'Saturated Fat', unit: 'g' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'transFat', label: 'Trans Fat', unit: 'g' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'potassium', label: 'Potassium', unit: 'mg', additional: true },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'calcium', label: 'Calcium', unit: 'mg', additional: true },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'iron', label: 'Iron', unit: 'mg', additional: true },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', additional: true },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata; rendered labels are localized at presentation.
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', additional: true },
] as const;

type ExtraNutrientKey = typeof EXTRA_NUTRIENT_FIELDS[number]['key'];

export interface NutrientDisplayItem {
  /** Application-owned key; custom nutrient names may remain literal. */
  label: string;
  value: number;
  unit: string;
}

export interface BuildNutrientDisplayListOptions {
  // When true and `carbs` is provided, a "Total Carbs" row is inserted in the
  // primary list immediately after the carb-cluster entries (Fiber, Sugars).
  // Used by callers that have swapped the macro-bar Carbs label to "Net Carbs"
  // so users can still see the unsubtracted total without losing the row.
  showNetCarbs?: boolean;
  carbs?: number;
}

/** Build primary + additional display lists from a camelCase nutrient source. */
export function buildNutrientDisplayList(
  source: Partial<Record<ExtraNutrientKey, number>>,
  options: BuildNutrientDisplayListOptions & { t?: TFunction } = {},
) {
  const primary: NutrientDisplayItem[] = [];
  const additional: NutrientDisplayItem[] = [];
  for (const field of EXTRA_NUTRIENT_FIELDS) {
    const value = source[field.key];
    if (value == null) continue;
    const item: NutrientDisplayItem = { label: options.t ? localizeNutrientKey(options.t, field.key) : field.label, value, unit: field.unit };
    if ('additional' in field && field.additional) {
      additional.push(item);
    } else {
      primary.push(item);
    }
  }

  if (options.showNetCarbs && options.carbs !== undefined) {
    const carbClusterLabels = new Set([options.t ? localizeNutrientKey(options.t, 'fiber') : 'Fiber', options.t ? localizeNutrientKey(options.t, 'sugars') : 'Sugars']);
    let insertIdx = 0;
    for (let i = 0; i < primary.length; i++) {
      if (carbClusterLabels.has(primary[i].label)) {
        insertIdx = i + 1;
      }
    }
    primary.splice(insertIdx, 0, {
      // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical nutrient metadata; presentation localizes this label when a translator is available.
      label: options.t ? localizeNutrientKey(options.t, 'totalCarbs') : 'Total Carbs',
      value: options.carbs,
      unit: 'g',
    });
  }

  return { primary, additional };
}

export interface FoodInfoItem {
  id: string;
  name: string;
  brand: string | null;
  barcode?: string | null;
  provider_type?: string;
  provider_external_id?: string;
  is_custom?: boolean;
  userId?: string;
  sharedWithPublic?: boolean;
  servingSize: number;
  servingUnit: string;
  servingDescription?: string;
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
  provider_verified?: boolean;
  // Photos. `images` is set for already-saved foods and meals; the two URL
  // fields carry a provider result's photo before it has been imported, and
  // must survive as far as the create payload or the food is saved without
  // one. See docs/content/8.developer/12.food-provider-images.md.
  images?: string[] | null;
  image_url?: string | null;
  image_source_url?: string | null;
  // Yield count for meal-source items — surfaces "meal makes N servings"
  // context in the diary-add screen for serving-unit meals where the
  // per-serving size suffix is suppressed.
  mealTotalServings?: number;
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
  barcode: item.barcode ?? null,
  userId: item.user_id,
  sharedWithPublic: item.shared_with_public,
  provider_type: item.provider_type ?? undefined,
  provider_external_id: item.provider_external_id ?? undefined,
  provider_verified: item.provider_verified,
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
  images: item.images ?? null,
  source: 'local',
  originalItem: item,
});

export const externalFoodItemToFoodInfo = (item: ExternalFoodItem): FoodInfoItem => ({
  id: item.id,
  name: item.name,
  brand: item.brand,
  barcode: item.barcode ?? null,
  provider_type: item.provider_type,
  provider_external_id: item.provider_external_id,
  is_custom: item.is_custom,
  servingSize: item.serving_size,
  servingUnit: item.serving_unit,
  servingDescription: item.serving_description,
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
  provider_verified: item.provider_verified,
  images: item.images ?? null,
  image_url: item.image_url ?? null,
  image_source_url: item.image_source_url ?? null,
  source: 'external',
  originalItem: item,
});

export const mealToFoodInfo = (meal: Meal): FoodInfoItem => {
  const scale = (food: Meal['foods'][number]) =>
    food.serving_size === 0 ? 0 : food.quantity / food.serving_size;

  // Expose ONE serving's nutrition (full recipe ÷ total_servings) so the
  // diary-add screen's quantity/serving_size math produces correct values.
  // Default quantity = serving_size (one serving) ⇒ scale = 1 ⇒ exactly one
  // serving's nutrition logged. Bumping quantity scales linearly.
  const totalServings = meal.total_servings || 1;
  const perServing = (value: number) =>
    totalServings > 0 ? value / totalServings : value;

  const sumField = (field: keyof Meal['foods'][number]) =>
    meal.foods.reduce((sum, f) => {
      const v = f[field];
      return typeof v === 'number' ? sum + v * scale(f) : sum;
    }, 0);

  const calories = perServing(sumField('calories'));
  const protein = perServing(sumField('protein'));
  const carbs = perServing(sumField('carbs'));
  const fat = perServing(sumField('fat'));

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
    fiber: hasField('dietary_fiber') ? Math.round(perServing(sumField('dietary_fiber'))) : undefined,
    saturatedFat: hasField('saturated_fat') ? Math.round(perServing(sumField('saturated_fat'))) : undefined,
    sodium: hasField('sodium') ? Math.round(perServing(sumField('sodium'))) : undefined,
    sugars: hasField('sugars') ? Math.round(perServing(sumField('sugars'))) : undefined,
    transFat: hasField('trans_fat') ? Math.round(perServing(sumField('trans_fat'))) : undefined,
    potassium: hasField('potassium') ? Math.round(perServing(sumField('potassium'))) : undefined,
    calcium: hasField('calcium') ? Math.round(perServing(sumField('calcium'))) : undefined,
    iron: hasField('iron') ? Math.round(perServing(sumField('iron'))) : undefined,
    cholesterol: hasField('cholesterol') ? Math.round(perServing(sumField('cholesterol'))) : undefined,
    vitaminA: hasField('vitamin_a') ? Math.round(perServing(sumField('vitamin_a'))) : undefined,
    vitaminC: hasField('vitamin_c') ? Math.round(perServing(sumField('vitamin_c'))) : undefined,
    mealTotalServings: totalServings,
    images: meal.images ?? null,
    source: 'meal',
    originalItem: meal,
  };
};

export const mealIngredientDraftToFoodInfo = (
  ingredient: MealIngredientDraft,
): FoodInfoItem => {
  const servingUnit =
    toTrimmedString(ingredient.unit) ||
    toTrimmedString(ingredient.serving_unit) ||
    'serving';

  return {
    id: ingredient.food_id || '',
    name: ingredient.food_name || 'Food',
    brand: ingredient.brand,
    servingSize: toFiniteNumber(ingredient.serving_size),
    servingUnit,
    calories: toFiniteNumber(ingredient.calories),
    protein: toFiniteNumber(ingredient.protein),
    carbs: toFiniteNumber(ingredient.carbs),
    fat: toFiniteNumber(ingredient.fat),
    fiber: toOptionalFiniteNumber(ingredient.dietary_fiber),
    saturatedFat: toOptionalFiniteNumber(ingredient.saturated_fat),
    sodium: toOptionalFiniteNumber(ingredient.sodium),
    sugars: toOptionalFiniteNumber(ingredient.sugars),
    transFat: toOptionalFiniteNumber(ingredient.trans_fat),
    potassium: toOptionalFiniteNumber(ingredient.potassium),
    calcium: toOptionalFiniteNumber(ingredient.calcium),
    iron: toOptionalFiniteNumber(ingredient.iron),
    cholesterol: toOptionalFiniteNumber(ingredient.cholesterol),
    vitaminA: toOptionalFiniteNumber(ingredient.vitamin_a),
    vitaminC: toOptionalFiniteNumber(ingredient.vitamin_c),
    customNutrients: ingredient.custom_nutrients ?? null,
    variantId: toTrimmedString(ingredient.variant_id) || undefined,
    source: 'local',
    originalItem: ingredient,
  };
};
