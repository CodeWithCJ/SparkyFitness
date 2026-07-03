import {
  FoodVariant,
  GlycemicIndex,
  NumericFoodVariantKeys,
} from '@/types/food';

// Local type that allows empty string for form inputs
export type FormFoodVariant = Omit<FoodVariant, NumericFoodVariantKeys> & {
  [K in NumericFoodVariantKeys]?: number;
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
  calories: variant.calories === 0 ? undefined : variant.calories,
  protein: variant.protein === 0 ? undefined : variant.protein,
  carbs: variant.carbs === 0 ? undefined : variant.carbs,
  fat: variant.fat === 0 ? undefined : variant.fat,
  saturated_fat:
    variant.saturated_fat === 0 ? undefined : variant.saturated_fat,
  polyunsaturated_fat:
    variant.polyunsaturated_fat === 0 ? undefined : variant.polyunsaturated_fat,
  monounsaturated_fat:
    variant.monounsaturated_fat === 0 ? undefined : variant.monounsaturated_fat,
  trans_fat: variant.trans_fat === 0 ? undefined : variant.trans_fat,
  cholesterol: variant.cholesterol === 0 ? undefined : variant.cholesterol,
  sodium: variant.sodium === 0 ? undefined : variant.sodium,
  potassium: variant.potassium === 0 ? undefined : variant.potassium,
  dietary_fiber:
    variant.dietary_fiber === 0 ? undefined : variant.dietary_fiber,
  sugars: variant.sugars === 0 ? undefined : variant.sugars,
  vitamin_a: variant.vitamin_a === 0 ? undefined : variant.vitamin_a,
  vitamin_c: variant.vitamin_c === 0 ? undefined : variant.vitamin_c,
  calcium: variant.calcium === 0 ? undefined : variant.calcium,
  iron: variant.iron === 0 ? undefined : variant.iron,
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
    calories: undefined,
    protein: undefined,
    carbs: undefined,
    fat: undefined,
    saturated_fat: undefined,
    polyunsaturated_fat: undefined,
    monounsaturated_fat: undefined,
    trans_fat: undefined,
    cholesterol: undefined,
    sodium: undefined,
    potassium: undefined,
    dietary_fiber: undefined,
    sugars: undefined,
    vitamin_a: undefined,
    vitamin_c: undefined,
    calcium: undefined,
    iron: undefined,
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
