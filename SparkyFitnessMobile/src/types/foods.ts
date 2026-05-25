export interface FoodDefaultVariant {
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
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
}

export interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  barcode?: string | null;
  is_custom: boolean;
  user_id?: string;
  shared_with_public?: boolean;
  is_quick_food?: boolean;
  default_variant: FoodDefaultVariant;
}

export interface TopFoodItem extends FoodItem {
  usage_count: number;
}

export interface FoodsResponse {
  recentFoods: FoodItem[];
  topFoods: TopFoodItem[];
}

export interface FoodSearchResponse {
  foods: FoodItem[];
  totalCount: number;
}

export interface FoodSearchPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export interface PaginatedFoodsResponse {
  foods: FoodItem[];
  pagination: FoodSearchPagination;
}

export interface FoodVariantDetail {
  id: string;
  food_id: string;
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
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
  // AI-Assisted Unit Conversions provenance — server always returns these on
  // saved variants. Keep them on the type so `localVariantToUnitVariant` can
  // forward them; otherwise the sheet loses track of AI source and treats an
  // AI cup variant as a regular math conversion donor (showing green
  // checkmarks for compatible sibling units when it shouldn't).
  user_id?: string;
  source?: 'manual' | 'ai_estimate' | 'imported';
  ai_confidence?: 'high' | 'medium' | 'low' | null;
  ai_reasoning?: string | null;
}
