export interface FoodUnitVariant {
  id?: string;
  food_id?: string;
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
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number> | null;
}

export interface EquivalentUnit {
  id?: string;
  serving_size: number;
  serving_unit: string;
  _clientKey?: string;
}

export type FoodUnitSelectionResult =
  | { kind: 'existing'; variant: FoodUnitVariant }
  | {
      kind: 'draft';
      variant: FoodUnitVariant;
      requiresNutritionUpdate?: boolean;
    };
