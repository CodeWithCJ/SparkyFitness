import { sanitizeCustomNutrients } from './foodUtils.js';
import type { FoodEntrySnapshot } from '../types/nutrition.js';

/**
 * The denormalized nutrition a `food_entries` row carries alongside its
 * `food_id`/`variant_id`.
 *
 * Diary rows snapshot their food's nutrition at log time so that editing the
 * underlying food later never silently rewrites history. Every path that
 * creates a food entry from a stored variant must build this the same way —
 * it is 22 fields, and two hand-written copies would drift the first time a
 * nutrient is added.
 *
 * Note this does NOT scale by quantity: the row stores the variant's
 * per-serving values and the quantity separately, exactly as
 * `buildLeafFoodEntries` has always done.
 */
export interface VariantNutritionSource {
  serving_size: number | string | null;
  serving_unit: string | null;
  calories?: number | string | null;
  protein?: number | string | null;
  carbs?: number | string | null;
  fat?: number | string | null;
  saturated_fat?: number | string | null;
  polyunsaturated_fat?: number | string | null;
  monounsaturated_fat?: number | string | null;
  trans_fat?: number | string | null;
  cholesterol?: number | string | null;
  sodium?: number | string | null;
  potassium?: number | string | null;
  dietary_fiber?: number | string | null;
  sugars?: number | string | null;
  vitamin_a?: number | string | null;
  vitamin_c?: number | string | null;
  calcium?: number | string | null;
  iron?: number | string | null;
  glycemic_index?: string | null;
  custom_nutrients?: Record<string, unknown> | null;
}

export interface FoodNameSource {
  name: string;
  brand?: string | null;
}

export function buildFoodEntrySnapshot(
  food: FoodNameSource,
  variant: VariantNutritionSource
): FoodEntrySnapshot {
  return {
    food_name: food.name,
    brand_name: food.brand,
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
    custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
  } as FoodEntrySnapshot;
}
