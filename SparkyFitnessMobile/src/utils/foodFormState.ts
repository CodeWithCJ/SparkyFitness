import type {
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import { formatFoodFormNumber } from './foodDetails';
import { parseDecimalInput } from './numericInput';
import { localizeFoodUnit, localizeFoodUnitGroup } from './foodUnitLocalization';
import { FOOD_FORM_UNIT_GROUPS } from '@workspace/shared';
import type { TFunction } from 'i18next';

export interface FoodFormData {
  name: string;
  brand: string;
  servingSize: string;
  servingUnit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  saturatedFat: string;
  transFat: string;
  sodium: string;
  sugars: string;
  potassium: string;
  cholesterol: string;
  calcium: string;
  iron: string;
  vitaminA: string;
  vitaminC: string;
}

export type NumericFoodFormField =
  | 'servingSize'
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'saturatedFat'
  | 'transFat'
  | 'sodium'
  | 'sugars'
  | 'potassium'
  | 'cholesterol'
  | 'calcium'
  | 'iron'
  | 'vitaminA'
  | 'vitaminC';

export const NUMERIC_FOOD_FORM_FIELDS: NumericFoodFormField[] = [
  'servingSize',
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'saturatedFat',
  'transFat',
  'sodium',
  'sugars',
  'potassium',
  'cholesterol',
  'calcium',
  'iron',
  'vitaminA',
  'vitaminC',
];

export const NUMERIC_FOOD_FORM_FIELD_SET = new Set<keyof FoodFormData>(
  NUMERIC_FOOD_FORM_FIELDS,
);

/**
 * Localized unit sections for the serving-unit picker. Group titles and
 * unit labels follow the active app locale via the controlled-food-unit
 * mapping; the raw canonical `value` (used for selection, conversion, storage)
 * is preserved unchanged. Unknown/custom units fall back to their literal.
 */
export function makeServingUnitSections(
  t: TFunction,
): { title: string; options: { label: string; value: string }[] }[] {
  return FOOD_FORM_UNIT_GROUPS.map((group) => ({
    title: localizeFoodUnitGroup(group.label, t),
    options: group.units.map((unit) => ({
      label: localizeFoodUnit(unit, t),
      value: unit,
    })),
  }));
}

export const NUTRITION_FIELDS: (keyof FoodFormData)[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'saturatedFat',
  'transFat',
  'sodium',
  'sugars',
  'potassium',
  'cholesterol',
  'calcium',
  'iron',
  'vitaminA',
  'vitaminC',
];

const EMPTY_FORM: FoodFormData = {
  name: '',
  brand: '',
  servingSize: '',
  servingUnit: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  saturatedFat: '',
  transFat: '',
  sodium: '',
  sugars: '',
  potassium: '',
  cholesterol: '',
  calcium: '',
  iron: '',
  vitaminA: '',
  vitaminC: '',
};

export const FORM_DRAFT_UNIT_ID = '__food-form-draft-unit__';

export function buildDisplayFormState(
  initialValues?: Partial<FoodFormData>,
): FoodFormData {
  const merged = { ...EMPTY_FORM, ...initialValues };
  const formatInitialNumericValue = (
    rawValue: string | undefined,
    kind: 'servingSize' | 'calories' | 'nutrient',
  ) => {
    const parsedValue = parseDecimalInput(rawValue ?? '');
    return Number.isFinite(parsedValue)
      ? formatFoodFormNumber(parsedValue, kind)
      : '';
  };

  return {
    ...merged,
    servingSize: formatInitialNumericValue(
      initialValues?.servingSize,
      'servingSize',
    ),
    calories: formatInitialNumericValue(initialValues?.calories, 'calories'),
    protein: formatInitialNumericValue(initialValues?.protein, 'nutrient'),
    carbs: formatInitialNumericValue(initialValues?.carbs, 'nutrient'),
    fat: formatInitialNumericValue(initialValues?.fat, 'nutrient'),
    fiber: formatInitialNumericValue(initialValues?.fiber, 'nutrient'),
    saturatedFat: formatInitialNumericValue(
      initialValues?.saturatedFat,
      'nutrient',
    ),
    transFat: formatInitialNumericValue(initialValues?.transFat, 'nutrient'),
    sodium: formatInitialNumericValue(initialValues?.sodium, 'nutrient'),
    sugars: formatInitialNumericValue(initialValues?.sugars, 'nutrient'),
    potassium: formatInitialNumericValue(initialValues?.potassium, 'nutrient'),
    cholesterol: formatInitialNumericValue(
      initialValues?.cholesterol,
      'nutrient',
    ),
    calcium: formatInitialNumericValue(initialValues?.calcium, 'nutrient'),
    iron: formatInitialNumericValue(initialValues?.iron, 'nutrient'),
    vitaminA: formatInitialNumericValue(initialValues?.vitaminA, 'nutrient'),
    vitaminC: formatInitialNumericValue(initialValues?.vitaminC, 'nutrient'),
  };
}

export function buildPreciseNumericValues(
  initialValues?: Partial<FoodFormData>,
): Partial<Record<NumericFoodFormField, number>> {
  const preciseValues: Partial<Record<NumericFoodFormField, number>> = {};

  NUMERIC_FOOD_FORM_FIELDS.forEach((field) => {
    const parsed = parseDecimalInput(initialValues?.[field] ?? '');
    if (Number.isFinite(parsed)) {
      preciseValues[field] = parsed;
    }
  });

  return preciseValues;
}

export function toPreciseFormString(value: number | undefined): string {
  if (!Number.isFinite(value)) return '';
  if (Object.is(value, -0)) return '0';
  return String(value);
}

export function normalizeSelectedUnitSelection(
  selection?: FoodUnitSelectionResult | null,
): FoodUnitSelectionResult | null {
  if (!selection) return null;
  if (selection.kind === 'existing' || selection.variant.id) {
    return selection;
  }

  return {
    ...selection,
    variant: {
      ...selection.variant,
      id: FORM_DRAFT_UNIT_ID,
    },
  };
}

export function applyVariantToFormState(
  previous: FoodFormData,
  variant: FoodUnitVariant,
): FoodFormData {
  return {
    ...previous,
    servingSize: formatFoodFormNumber(variant.serving_size, 'servingSize'),
    servingUnit: variant.serving_unit,
    calories: formatFoodFormNumber(variant.calories, 'calories'),
    protein: formatFoodFormNumber(variant.protein, 'nutrient'),
    carbs: formatFoodFormNumber(variant.carbs, 'nutrient'),
    fat: formatFoodFormNumber(variant.fat, 'nutrient'),
    fiber: formatFoodFormNumber(variant.dietary_fiber, 'nutrient'),
    saturatedFat: formatFoodFormNumber(variant.saturated_fat, 'nutrient'),
    transFat: formatFoodFormNumber(variant.trans_fat, 'nutrient'),
    sodium: formatFoodFormNumber(variant.sodium, 'nutrient'),
    sugars: formatFoodFormNumber(variant.sugars, 'nutrient'),
    potassium: formatFoodFormNumber(variant.potassium, 'nutrient'),
    cholesterol: formatFoodFormNumber(variant.cholesterol, 'nutrient'),
    calcium: formatFoodFormNumber(variant.calcium, 'nutrient'),
    iron: formatFoodFormNumber(variant.iron, 'nutrient'),
    vitaminA: formatFoodFormNumber(variant.vitamin_a, 'nutrient'),
    vitaminC: formatFoodFormNumber(variant.vitamin_c, 'nutrient'),
  };
}

export function applyVariantUnitToFormState(
  previous: FoodFormData,
  variant: FoodUnitVariant,
): FoodFormData {
  return {
    ...previous,
    servingUnit: variant.serving_unit,
  };
}

export function applyCompatibleDraftToFormState(
  previous: FoodFormData,
  variant: FoodUnitVariant,
  scaledVariant: FoodUnitVariant,
): FoodFormData {
  return {
    ...previous,
    servingUnit: variant.serving_unit,
    calories: formatFoodFormNumber(scaledVariant.calories, 'calories'),
    protein: formatFoodFormNumber(scaledVariant.protein, 'nutrient'),
    carbs: formatFoodFormNumber(scaledVariant.carbs, 'nutrient'),
    fat: formatFoodFormNumber(scaledVariant.fat, 'nutrient'),
    fiber: formatFoodFormNumber(scaledVariant.dietary_fiber, 'nutrient'),
    saturatedFat: formatFoodFormNumber(scaledVariant.saturated_fat, 'nutrient'),
    transFat: formatFoodFormNumber(scaledVariant.trans_fat, 'nutrient'),
    sodium: formatFoodFormNumber(scaledVariant.sodium, 'nutrient'),
    sugars: formatFoodFormNumber(scaledVariant.sugars, 'nutrient'),
    potassium: formatFoodFormNumber(scaledVariant.potassium, 'nutrient'),
    cholesterol: formatFoodFormNumber(scaledVariant.cholesterol, 'nutrient'),
    calcium: formatFoodFormNumber(scaledVariant.calcium, 'nutrient'),
    iron: formatFoodFormNumber(scaledVariant.iron, 'nutrient'),
    vitaminA: formatFoodFormNumber(scaledVariant.vitamin_a, 'nutrient'),
    vitaminC: formatFoodFormNumber(scaledVariant.vitamin_c, 'nutrient'),
  };
}

export function buildPreciseNumericValuesFromVariant(
  variant: FoodUnitVariant,
): Partial<Record<NumericFoodFormField, number>> {
  return buildPreciseNumericValues({
    servingSize: toPreciseFormString(variant.serving_size),
    calories: toPreciseFormString(variant.calories),
    protein: toPreciseFormString(variant.protein),
    carbs: toPreciseFormString(variant.carbs),
    fat: toPreciseFormString(variant.fat),
    fiber: toPreciseFormString(variant.dietary_fiber),
    saturatedFat: toPreciseFormString(variant.saturated_fat),
    transFat: toPreciseFormString(variant.trans_fat),
    sodium: toPreciseFormString(variant.sodium),
    sugars: toPreciseFormString(variant.sugars),
    potassium: toPreciseFormString(variant.potassium),
    cholesterol: toPreciseFormString(variant.cholesterol),
    calcium: toPreciseFormString(variant.calcium),
    iron: toPreciseFormString(variant.iron),
    vitaminA: toPreciseFormString(variant.vitamin_a),
    vitaminC: toPreciseFormString(variant.vitamin_c),
  });
}

export function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function scaleCompatibleDraftVariant(
  variant: FoodUnitVariant,
  servingSize: number,
): FoodUnitVariant {
  const ratio =
    variant.serving_size > 0 && Number.isFinite(servingSize)
      ? servingSize / variant.serving_size
      : 1;

  return {
    ...variant,
    calories: (variant.calories ?? 0) * ratio,
    protein: (variant.protein ?? 0) * ratio,
    carbs: (variant.carbs ?? 0) * ratio,
    fat: (variant.fat ?? 0) * ratio,
    saturated_fat: (variant.saturated_fat ?? 0) * ratio,
    trans_fat: (variant.trans_fat ?? 0) * ratio,
    sodium: (variant.sodium ?? 0) * ratio,
    sugars: (variant.sugars ?? 0) * ratio,
    potassium: (variant.potassium ?? 0) * ratio,
    cholesterol: (variant.cholesterol ?? 0) * ratio,
    calcium: (variant.calcium ?? 0) * ratio,
    iron: (variant.iron ?? 0) * ratio,
    vitamin_a: (variant.vitamin_a ?? 0) * ratio,
    vitamin_c: (variant.vitamin_c ?? 0) * ratio,
    dietary_fiber: (variant.dietary_fiber ?? 0) * ratio,
    polyunsaturated_fat: (variant.polyunsaturated_fat ?? 0) * ratio,
    monounsaturated_fat: (variant.monounsaturated_fat ?? 0) * ratio,
    glycemic_index: variant.glycemic_index,
    custom_nutrients: Object.fromEntries(
      Object.entries(variant.custom_nutrients || {}).map(([key, value]) => [
        key,
        (Number(value) || 0) * ratio,
      ]),
    ),
  };
}

export function getScaledVariantNumericValue(
  field: Exclude<NumericFoodFormField, 'servingSize'>,
  variant: FoodUnitVariant,
): number {
  switch (field) {
    case 'calories':
      return variant.calories ?? 0;
    case 'protein':
      return variant.protein ?? 0;
    case 'carbs':
      return variant.carbs ?? 0;
    case 'fat':
      return variant.fat ?? 0;
    case 'fiber':
      return variant.dietary_fiber ?? 0;
    case 'saturatedFat':
      return variant.saturated_fat ?? 0;
    case 'transFat':
      return variant.trans_fat ?? 0;
    case 'sodium':
      return variant.sodium ?? 0;
    case 'sugars':
      return variant.sugars ?? 0;
    case 'potassium':
      return variant.potassium ?? 0;
    case 'cholesterol':
      return variant.cholesterol ?? 0;
    case 'calcium':
      return variant.calcium ?? 0;
    case 'iron':
      return variant.iron ?? 0;
    case 'vitaminA':
      return variant.vitamin_a ?? 0;
    case 'vitaminC':
      return variant.vitamin_c ?? 0;
  }
}

export function formatScaledInput(value: number): string {
  return formatFoodFormNumber(value, 'nutrient') || '0';
}
