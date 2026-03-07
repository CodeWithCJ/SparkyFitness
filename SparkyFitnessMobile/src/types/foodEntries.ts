export interface FoodVariant {
  id: string;
  food_id: string;
  serving_size: string;
  serving_weight: number;
  data: string; // JSON stringified nutritional data
}
export interface FoodEntry {
  id: string;
  food_id?: string; // Make optional as it might be a meal_id
  meal_id?: string; // New field for aggregated meals - will be deprecated/null for new meal component entries
  food_entry_meal_id?: string; // New field to link to food_entry_meals parent
  user_id?: string;
  meal_type: string;
  meal_type_id?: string;
  quantity: number;
  unit: string;
  variant_id?: string;
  food_name?: string;
  brand_name?: string;
  entry_date: string;
  meal_plan_template_id?: string;
  serving_size: number;
  serving_unit?: string;

  // Snapshotted nutrient data
  calories: number;
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