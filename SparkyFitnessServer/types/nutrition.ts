/**
 * Shared nutrition shapes for the food domain.
 *
 * These replace the `any` parameter signatures that the food models and
 * services historically used. They describe what the code actually reads, so
 * they are intentionally permissive about nullability: values arrive from
 * user input, CSV imports, and external providers, all of which routinely
 * omit individual nutrients.
 */

/** A numeric nutrient value as it arrives before sanitization. */
export type NutrientValue = number | string | null | undefined;

/**
 * Free-form custom nutrients, keyed by the user's nutrient name.
 *
 * Values are `unknown` rather than a narrower union because they pass through
 * `sanitizeCustomNutrients`, which accepts and returns arbitrary JSON.
 */
export type CustomNutrients = Record<string, unknown>;

/** The nutrient fields carried on a food variant or an entry snapshot. */
export interface NutrientFields {
  calories?: NutrientValue;
  protein?: NutrientValue;
  carbs?: NutrientValue;
  fat?: NutrientValue;
  saturated_fat?: NutrientValue;
  polyunsaturated_fat?: NutrientValue;
  monounsaturated_fat?: NutrientValue;
  trans_fat?: NutrientValue;
  cholesterol?: NutrientValue;
  sodium?: NutrientValue;
  potassium?: NutrientValue;
  dietary_fiber?: NutrientValue;
  sugars?: NutrientValue;
  vitamin_a?: NutrientValue;
  vitamin_c?: NutrientValue;
  calcium?: NutrientValue;
  iron?: NutrientValue;
  glycemic_index?: string | null;
  custom_nutrients?: CustomNutrients | null;
}

/**
 * The nutrition snapshot copied onto a diary entry at log time, so the entry
 * keeps the values it was logged with even if the food is later edited.
 */
export interface FoodEntrySnapshot extends NutrientFields {
  food_name?: string | null;
  // Present when the snapshot describes a logged meal rather than a food.
  meal_name?: string | null;
  brand_name?: string | null;
  serving_size?: NutrientValue;
  serving_unit?: string | null;
  allergens?: string[] | null;
  traces?: string[] | null;
  /**
   * The parent food's photos, applied to entries that are still showing what
   * they inherited at log time. Entries with their own diary-set photo keep it.
   */
  images?: string[] | null;
}

/** A serving option for a food, as stored in `food_variants`. */
export interface FoodVariantInput extends NutrientFields {
  id?: string;
  food_id?: string;
  user_id?: string;
  // Present on rows read back from the database; used to pick the newest match.
  updated_at?: string | Date | null;
  serving_size?: NutrientValue;
  serving_unit?: string | null;
  is_default?: boolean | null;
  source?: string | null;
  ai_confidence?: string | null;
  allergens?: string[] | null;
  traces?: string[] | null;
}

/**
 * The fields accepted when creating or updating a diary food entry.
 *
 * Extends the snapshot because callers may supply nutrient overrides inline
 * (quick-add foods, provider imports) rather than relying on a food variant.
 */
export interface FoodEntryInput extends FoodEntrySnapshot {
  user_id?: string;
  food_id?: string | null;
  meal_id?: string | null;
  food_entry_meal_id?: string | null;
  meal_plan_template_id?: string | null;
  variant_id?: string | null;
  meal_type?: string | null;
  meal_type_id?: string | null;
  entry_date?: string;
  entry_time?: string | null;
  quantity?: NutrientValue;
  unit?: string | null;
  source?: string | null;
  source_id?: string | null;
  images?: string[] | null;
  // Per-occurrence markdown note. Unlike the nutrition snapshot this is never
  // derived from the parent food or meal, so it is not part of
  // FoodEntrySnapshot and is never rewritten by a snapshot resync.
  notes?: string | null;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
  // Set when the entry was generated from a meal plan.
  meal_plan_id?: string | null;
}

/** An ingredient inside a meal: either a food, or a linked child meal. */
export interface MealFoodInput extends NutrientFields {
  item_type?: 'food' | 'meal' | null;
  food_id?: string | null;
  child_meal_id?: string | null;
  variant_id?: string | null;
  quantity?: NutrientValue;
  unit?: string | null;
  food_name?: string | null;
  serving_size?: NutrientValue;
  serving_unit?: string | null;
}

/**
 * The meal-template fields accepted when creating or updating a meal.
 *
 * Serving values are `unknown` because callers hand them straight through from
 * request bodies into query parameters without narrowing; they are never read
 * as numbers here, only bound to SQL.
 */
export interface MealInput {
  user_id?: string;
  name?: string;
  description?: string | null;
  is_public?: boolean | null;
  serving_size?: unknown;
  serving_unit?: string | null;
  total_servings?: unknown;
  images?: string[] | null;
  /** Owner-authored markdown reference note (e.g. a recipe). */
  notes?: string | null;
  foods?: MealFoodInput[];
}

/** A scheduled meal-plan entry, or a saved meal-plan template row. */
export interface MealPlanInput {
  user_id?: string;
  meal_id?: string | null;
  food_id?: string | null;
  variant_id?: string | null;
  meal_type?: string | null;
  meal_type_id?: string | null;
  // Callers pass either a calendar-day string or a Date; both bind to SQL.
  plan_date?: string | Date | null;
  day_of_week?: number | null;
  is_template?: boolean | null;
  template_name?: string | null;
  meal_plan_template_id?: string | null;
  quantity?: NutrientValue;
  unit?: string | null;
}
