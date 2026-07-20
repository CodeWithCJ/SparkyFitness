import type { MealFoodPayload } from './meals';

export interface FoodEntryMealFood {
  food_id: string;
  food_name: string;
  variant_id: string;
  quantity: number;
  unit: string;
  serving_size: number;
  serving_unit: string;
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
}

export interface FoodEntryMeal {
  id: string;
  user_id: string;
  meal_template_id: string | null;
  meal_type: string;
  meal_type_id: string | null;
  entry_date: string;
  entry_time?: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  // TRUE for entries logged before the serving-model migration, where unit
  // === 'serving' had the special-case multiplier semantics. The server uses
  // this when recomputing/unscaling component nutrition on edit.
  legacy_serving_unit_math?: boolean;
  foods: FoodEntryMealFood[];
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
}

export interface FoodEntryMealCreateData {
  meal_template_id?: string | null;
  meal_type: string;
  meal_type_id?: string;
  entry_date: string;
  entry_time?: string | null;
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  foods?: MealFoodPayload[];
}

export interface FoodEntryMealUpdateData {
  name?: string;
  description?: string | null;
  meal_type?: string;
  meal_type_id?: string;
  entry_date?: string;
  entry_time?: string | null;
  quantity?: number;
  unit?: string;
  meal_template_id?: string | null;
  foods: MealFoodPayload[];
}
