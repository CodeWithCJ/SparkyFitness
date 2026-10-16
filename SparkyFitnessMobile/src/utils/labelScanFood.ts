import type { FoodFormData } from '../components/FoodForm';
import type { LabelScanResult } from '../services/api/externalFoodSearchApi';
import { toFormString } from '../types/foodInfo';
import {
  NUMERIC_FOOD_FORM_FIELDS,
  type NumericFoodFormField,
} from './foodFormState';

export interface NutritionLabelScan {
  result: Partial<{
    [Field in keyof LabelScanResult]: LabelScanResult[Field] | null;
  }>;
  nonce: number;
}

const LABEL_NUMERIC_FIELDS = {
  servingSize: 'serving_size',
  calories: 'calories',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  fiber: 'fiber',
  saturatedFat: 'saturated_fat',
  transFat: 'trans_fat',
  sodium: 'sodium',
  sugars: 'sugars',
  potassium: 'potassium',
  cholesterol: 'cholesterol',
  calcium: 'calcium',
  iron: 'iron',
  vitaminA: 'vitamin_a',
  vitaminC: 'vitamin_c',
  caffeineMg: 'caffeine_mg',
  waterMl: 'water_ml',
  alcoholG: 'alcohol_g',
} as const satisfies Record<NumericFoodFormField, keyof LabelScanResult>;

/** Only recognized nutrition and serving fields may change an existing draft. */
export function labelScanToNutritionPatch(
  result: NutritionLabelScan['result']
): Partial<FoodFormData> {
  const patch: Partial<FoodFormData> = {};
  for (const field of NUMERIC_FOOD_FORM_FIELDS) {
    const value = result[LABEL_NUMERIC_FIELDS[field]];
    if (typeof value === 'number' && Number.isFinite(value)) {
      patch[field] = String(value);
    }
  }
  if (typeof result.serving_unit === 'string' && result.serving_unit.trim()) {
    patch.servingUnit = result.serving_unit;
  }
  return patch;
}

/** The food form's starting values for a scanned nutrition label. */
export function labelScanToInitialFood(
  result: LabelScanResult
): Partial<FoodFormData> {
  return {
    name: result.name || '',
    brand: result.brand || '',
    servingSize: String(result.serving_size ?? ''),
    servingUnit: result.serving_unit || 'g',
    calories: String(result.calories ?? ''),
    protein: String(result.protein ?? ''),
    carbs: String(result.carbs ?? ''),
    fat: String(result.fat ?? ''),
    fiber: toFormString(result.fiber),
    saturatedFat: toFormString(result.saturated_fat),
    transFat: toFormString(result.trans_fat),
    sodium: toFormString(result.sodium),
    sugars: toFormString(result.sugars),
    cholesterol: toFormString(result.cholesterol),
    potassium: toFormString(result.potassium),
    calcium: toFormString(result.calcium),
    iron: toFormString(result.iron),
    caffeineMg: toFormString(result.caffeine_mg),
    waterMl: toFormString(result.water_ml),
    alcoholG: toFormString(result.alcohol_g),
    vitaminA: toFormString(result.vitamin_a),
    vitaminC: toFormString(result.vitamin_c),
  };
}
