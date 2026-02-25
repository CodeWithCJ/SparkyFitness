export interface ExternalFoodVariant {
  serving_size: number;
  serving_unit: string;
  serving_description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  sodium?: number;
  fiber?: number;
  sugars?: number;
}

export interface ExternalFoodItem {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  sodium?: number;
  fiber?: number;
  sugars?: number;
  serving_size: number;
  serving_unit: string;
  source: string;
  variants?: ExternalFoodVariant[];
}
