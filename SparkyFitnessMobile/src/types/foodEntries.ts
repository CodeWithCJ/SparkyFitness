// export interface FoodEntry {
//   id: string;
//   quantity: number;
//   serving_size: number;
//   entry_date: string;
//   food_name: string;
//   brand_name?: string;
//   calories: number;
//   protein?: number;
//   carbs?: number;
//   fat?: number;
//   dietary_fiber?: number;
// }

export interface Food {
  id: string;
  name: string;
  data: string; // JSON stringified nutritional data
}
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
  meal_type: string;
  quantity: number;
  unit: string;
  variant_id?: string;
  foods?: Food; // Still useful for relations
  food_variants?: FoodVariant;
  food_name?: string; // Snapshotted food name
  brand_name?: string; // Snapshotted brand name
  entry_date: string;
  meal_plan_template_id?: string;
  // Add water_ml to FoodEntry if it's a water entry
  water_ml?: number;

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
  // glycemic_index?: GlycemicIndex;
  serving_size: number;
  custom_nutrients?: Record<string, string | number>; // New field for custom nutrients
}