export interface Food {
  id: string; // Made required
  name: string;
  brand?: string;
  is_custom?: boolean;
  user_id?: string;
  shared_with_public?: boolean;
  provider_external_id?: string; // Add this line
  provider_type?: 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'mealie' | 'tandoor'; // Add this line
  default_variant?: FoodVariant; // Add this line
  // These fields are now part of the default FoodVariant, but are also passed directly to createFood
  serving_size?: number;
  serving_unit?: string;
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
  variants?: FoodVariant[]; // Add this line
}

export interface FoodVariant {
  id: string; // Made required
  serving_size: number;
  serving_unit: string;
  is_default?: boolean; // New field
  is_locked?: boolean; // New field for locking nutrient details
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
  glycemic_index?: GlycemicIndex; // Add this line
}

export type GlycemicIndex = 'None' | 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';

export interface FoodEntry {
  id: string;
  user_id: string;
  food_id?: string; // Make optional as it might be a meal_id
  meal_id?: string; // New field for aggregated meals
  meal_type: string;
  quantity: number;
  unit: string;
  entry_date: string;
  variant_id?: string;
  meal_plan_template_id?: string; // Optional: if this entry came from a meal plan

  // Flattened food and variant details from the food_entries table
  food_name: string;
  brand_name?: string;
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
  glycemic_index?: GlycemicIndex;
}
