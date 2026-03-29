import {
  FoodVariant,
  GlycemicIndex,
  NumericFoodVariantKeys,
} from '@/types/food';

// Local type that allows empty string for form inputs
export type FormFoodVariant = Omit<FoodVariant, NumericFoodVariantKeys> & {
  [K in NumericFoodVariantKeys]?: number | '';
};

// Helper to convert FormFoodVariant to FoodVariant (empty strings become 0)
export const formVariantToFoodVariant = (
  variant: FormFoodVariant
): FoodVariant => ({
  ...variant,
  serving_size: variant.serving_size || 100,
  calories: variant.calories || 0,
  protein: variant.protein || 0,
  carbs: variant.carbs || 0,
  fat: variant.fat || 0,
  saturated_fat: variant.saturated_fat || 0,
  polyunsaturated_fat: variant.polyunsaturated_fat || 0,
  monounsaturated_fat: variant.monounsaturated_fat || 0,
  trans_fat: variant.trans_fat || 0,
  cholesterol: variant.cholesterol || 0,
  sodium: variant.sodium || 0,
  potassium: variant.potassium || 0,
  dietary_fiber: variant.dietary_fiber || 0,
  sugars: variant.sugars || 0,
  vitamin_a: variant.vitamin_a || 0,
  vitamin_c: variant.vitamin_c || 0,
  calcium: variant.calcium || 0,
  iron: variant.iron || 0,
});

// Helper to convert FoodVariant to FormFoodVariant (0 becomes empty string for display)
export const foodVariantToFormVariant = (
  variant: FoodVariant
): FormFoodVariant => ({
  ...variant,
  calories: variant.calories === 0 ? '' : variant.calories,
  protein: variant.protein === 0 ? '' : variant.protein,
  carbs: variant.carbs === 0 ? '' : variant.carbs,
  fat: variant.fat === 0 ? '' : variant.fat,
  saturated_fat: variant.saturated_fat === 0 ? '' : variant.saturated_fat,
  polyunsaturated_fat:
    variant.polyunsaturated_fat === 0 ? '' : variant.polyunsaturated_fat,
  monounsaturated_fat:
    variant.monounsaturated_fat === 0 ? '' : variant.monounsaturated_fat,
  trans_fat: variant.trans_fat === 0 ? '' : variant.trans_fat,
  cholesterol: variant.cholesterol === 0 ? '' : variant.cholesterol,
  sodium: variant.sodium === 0 ? '' : variant.sodium,
  potassium: variant.potassium === 0 ? '' : variant.potassium,
  dietary_fiber: variant.dietary_fiber === 0 ? '' : variant.dietary_fiber,
  sugars: variant.sugars === 0 ? '' : variant.sugars,
  vitamin_a: variant.vitamin_a === 0 ? '' : variant.vitamin_a,
  vitamin_c: variant.vitamin_c === 0 ? '' : variant.vitamin_c,
  calcium: variant.calcium === 0 ? '' : variant.calcium,
  iron: variant.iron === 0 ? '' : variant.iron,
});

export const sanitizeGlycemicIndexFrontend = (
  gi: string | null | undefined
): GlycemicIndex => {
  const allowedGICategories: GlycemicIndex[] = [
    'None',
    'Very Low',
    'Low',
    'Medium',
    'High',
    'Very High',
  ];
  if (
    gi === null ||
    gi === undefined ||
    gi === '' ||
    gi === '0' ||
    gi === '0.0' ||
    !allowedGICategories.includes(gi as GlycemicIndex)
  ) {
    return 'None';
  }
  return gi as GlycemicIndex;
};

export function createDefaultFormVariant(
  customNutrients?: { name: string }[],
  overrides: Partial<FormFoodVariant> = {}
): FormFoodVariant {
  const base: FormFoodVariant = {
    serving_size: 100,
    serving_unit: 'g',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    saturated_fat: '',
    polyunsaturated_fat: '',
    monounsaturated_fat: '',
    trans_fat: '',
    cholesterol: '',
    sodium: '',
    potassium: '',
    dietary_fiber: '',
    sugars: '',
    vitamin_a: '',
    vitamin_c: '',
    calcium: '',
    iron: '',
    is_default: true,
    is_locked: false,
    glycemic_index: 'None' as GlycemicIndex,
    custom_nutrients: {},
    ...overrides,
  };

  if (customNutrients) {
    customNutrients.forEach((n) => {
      if (base.custom_nutrients) base.custom_nutrients[n.name] = '';
    });
  }

  return base;
}
