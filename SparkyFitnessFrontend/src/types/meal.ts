import { Food } from './food';

export interface Meal {
  id?: string;
  user_id?: string;
  name: string;
  description?: string;
  is_public?: boolean;
  serving_size?: number;
  serving_unit?: string;
  foods?: MealFood[];
}

export interface MealFood {
  id?: string;
  food_id: string;
  quantity: number;
  unit: string;
  food_name?: string;
  food?: Food;
  variant_id?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  serving_size?: number;
  serving_unit?: string;
}

export interface MealPayload {
  name: string;
  description?: string;
  is_public?: boolean;
  serving_size?: number;
  serving_unit?: string;
  foods: MealFoodPayload[];
}

export interface MealFoodPayload {
  food_id: string;
  quantity: number;
  unit: string;
  food_name?: string;
  variant_id?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  serving_size?: number;
  serving_unit?: string;
}

export interface MealPlanTemplateAssignment {
  item_type: 'food' | 'meal';
  day_of_week: number; // 0 for Sunday, 1 for Monday, etc.
  meal_type: string; // e.g., 'breakfast', 'lunch', 'dinner', 'snacks'
  food_id?: string;
  food_name?: string;
  meal_id?: string;
  meal_name?: string;
  variant_id?: string;
  quantity?: number;
  unit?: string;
}

export interface MealPlanTemplate {
  id?: string;
  user_id?: string;
  plan_name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  assignments: MealPlanTemplateAssignment[];
}

export interface MealDeletionImpact {
  usedByOtherUsers: boolean;
  usedByCurrentUser: boolean;
}

// New interface for FoodEntryMeal
export interface FoodEntryMeal {
  id: string;
  user_id: string;
  meal_template_id?: string;
  meal_type: string;
  entry_date: string;
  name: string;
  description?: string;
  quantity?: number;
  unit?: string;
  foods: MealFood[]; // The component foods of this logged meal
  calories?: number; // Aggregated calories
  protein?: number; // Aggregated protein
  carbs?: number; // Aggregated carbs
  fat?: number; // Aggregated fat
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
  glycemic_index?: string; // Aggregated glycemic index
}