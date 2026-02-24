export interface FoodDefaultVariant {
  id?: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  saturated_fat?: number;
  sodium?: number;
  sugars?: number;
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
  sodium?: number;
  dietary_fiber?: number;
  sugars?: number;
  is_default?: boolean;
}
