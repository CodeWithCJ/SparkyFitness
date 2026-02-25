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
