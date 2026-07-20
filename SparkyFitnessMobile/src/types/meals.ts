// 'food' (default, omitted by legacy servers) or 'meal' when this ingredient
// links a reusable sub-meal instead of a food. See MEAL_COMPOSITION_PLAN.md.
export type MealComponentType = 'food' | 'meal';

export interface MealFood {
  id: string;
  item_type?: MealComponentType;
  food_id?: string;
  // Set when item_type === 'meal': the linked sub-meal's identity/serving
  // metadata. Nutrient fields below carry the sub-meal's server-resolved
  // full-recipe totals, scaled the same way as a food row (quantity/serving_size).
  child_meal_id?: string;
  child_meal_name?: string;
  child_meal_serving_size?: number;
  child_meal_serving_unit?: string;
  child_meal_total_servings?: number;
  variant_id?: string;
  quantity: number;
  unit: string;
  food_name: string;
  brand: string | null;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
}

export interface MealFoodPayload {
  item_type?: MealComponentType;
  food_id?: string;
  child_meal_id?: string;
  variant_id?: string;
  quantity: number;
  unit: string;
  food_name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
  serving_size?: number;
  serving_unit?: string;
}

export interface CreateMealPayload {
  name: string;
  description?: string | null;
  is_public?: boolean;
  serving_size?: number;
  serving_unit?: string;
  total_servings?: number;
  foods: MealFoodPayload[];
}

export interface UpdateMealPayload {
  name?: string;
  description?: string | null;
  is_public?: boolean;
  serving_size?: number;
  serving_unit?: string;
  total_servings?: number;
  foods?: MealFoodPayload[];
}

export interface MealDeletionImpact {
  usedByOtherUsers: boolean;
  usedByCurrentUser: boolean;
}

export interface MealIngredientDraft extends MealFoodPayload {
  brand: string | null;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  serving_size: number;
  serving_unit: string;
  total_servings: number;
  created_at: string;
  updated_at: string;
  // Present only on items returned by the favorites endpoint.
  favorited_at?: string;
  foods: MealFood[];
}
