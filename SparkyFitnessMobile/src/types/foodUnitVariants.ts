export interface FoodUnitVariant {
  id?: string;
  food_id?: string;
  // Marks this variant as the food's trusted default — the one AI estimates
  // anchor on so subsequent estimates don't compound off other AI values.
  is_default?: boolean;
  serving_size: number;
  serving_unit: string;
  serving_description?: string;
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
  // AI-Assisted Unit Conversions provenance. source defaults to 'manual'
  // server-side when omitted.
  source?: 'manual' | 'ai_estimate' | 'imported';
  ai_confidence?: 'high' | 'medium' | 'low' | null;
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
