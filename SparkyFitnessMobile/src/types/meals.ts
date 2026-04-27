export interface MealFood {
  id: string;
  food_id: string;
  variant_id: string;
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
  food_id: string;
  variant_id: string;
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
  foods: MealFoodPayload[];
}

export interface UpdateMealPayload {
  name?: string;
  description?: string | null;
  is_public?: boolean;
  serving_size?: number;
  serving_unit?: string;
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
  created_at: string;
  updated_at: string;
  foods: MealFood[];
}
