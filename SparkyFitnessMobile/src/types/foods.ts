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
  is_custom: boolean;
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
}
