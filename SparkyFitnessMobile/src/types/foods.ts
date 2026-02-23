export interface FoodDefaultVariant {
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
