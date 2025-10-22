import { Food } from './food';

export interface Meal {
  id?: string;
  user_id?: string;
  name: string;
  description?: string;
  is_public?: boolean;
  foods?: MealFood[];
}

export interface MealFood {
  id?: string;
  food_id: string;
  quantity: number;
  unit: string;
  food_name?: string;
  food?: Food;
}

export interface MealPayload {
  name: string;
  description?: string;
  is_public?: boolean;
  foods: MealFoodPayload[];
}

export interface MealFoodPayload {
  food_id: string;
  quantity: number;
  unit: string;
}

export interface MealPlanTemplate {
  id?: string;
  user_id?: string;
  meal_id: string;
  date: string;
  meal_type: string;
}

export interface MealDeletionImpact {
  mealPlansCount: number;
  isUsedByOthers: boolean;
}