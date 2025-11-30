export type GlycemicIndex = 'None' | 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';

export interface FoodVariant {
  id?: string;
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
  is_default?: boolean;
  is_locked?: boolean;
  glycemic_index?: GlycemicIndex;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  is_custom: boolean;
  user_id?: string;
  shared_with_public?: boolean;
  provider_external_id?: string;
  provider_type?: 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'mealie' | 'tandoor';
  default_variant?: FoodVariant;
  variants?: FoodVariant[];
  is_quick_food?: boolean;
  glycemic_index?: GlycemicIndex;
}

export interface FoodDeletionImpact {
  foodEntriesCount: number;
  mealFoodsCount: number;
  mealPlansCount: number;
  mealPlanTemplateAssignmentsCount: number;
  totalReferences: number;
  currentUserReferences: number;
  otherUserReferences: number;
  isPubliclyShared: boolean;
  familySharedUsers: string[];
}

export interface FoodSearchResult {
  recentFoods?: Food[];
  topFoods?: Food[];
  searchResults?: Food[];
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
  glycemic_index?: GlycemicIndex;
  serving_size?: number;
}

export interface CSVData {
  id: string;

  name: string;
  brand?: string;
  is_custom: boolean;
  shared_with_public?: boolean;
  is_quick_food?: boolean;

  serving_size: number;
  serving_unit: string;
  is_default?: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
}