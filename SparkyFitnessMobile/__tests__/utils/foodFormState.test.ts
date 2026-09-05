import type { FoodFormData } from '../../src/utils/foodFormState';
import type { FoodUnitVariant } from '../../src/types/foodUnitVariants';
import {
  applyVariantToFormState,
  buildDisplayFormState,
  buildPreciseNumericValuesFromVariant,
  getScaledVariantNumericValue,
  NUMERIC_FOOD_FORM_FIELDS,
  NUTRITION_FIELDS,
} from '../../src/utils/foodFormState';
import { buildVariantFromFormData } from '../../src/screens/foodForm/persistence';

// #1958: caffeineMg is the first numeric nutrient field added to the mobile
// food form since it was hand-laid-out (FoodFormData, NumericFoodFormField,
// NUMERIC_FOOD_FORM_FIELDS, NUTRITION_FIELDS, EMPTY_FORM, plus every
// state-conversion function in foodFormState.ts and persistence.ts). These
// tests exist to catch a future nutrient addition that misses one of those
// spots.

const baseForm: FoodFormData = {
  name: '',
  brand: '',
  notes: '',
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
  caffeineMg: '',
  waterMl: '',
};

function makeVariant(
  overrides: Partial<FoodUnitVariant> = {}
): FoodUnitVariant {
  return {
    serving_size: 100,
    serving_unit: 'g',
    calories: 50,
    protein: 1,
    carbs: 10,
    fat: 0,
    caffeine_mg: 63,
    water_ml: 240,
    ...overrides,
  };
}

describe('foodFormState — caffeineMg', () => {
  it('is part of NUMERIC_FOOD_FORM_FIELDS and NUTRITION_FIELDS', () => {
    expect(NUMERIC_FOOD_FORM_FIELDS).toContain('caffeineMg');
    expect(NUTRITION_FIELDS).toContain('caffeineMg');
  });

  it('getScaledVariantNumericValue reads caffeine_mg off the variant', () => {
    expect(getScaledVariantNumericValue('caffeineMg', makeVariant())).toBe(63);
  });

  it('getScaledVariantNumericValue defaults to 0 when the variant has none', () => {
    const variant = makeVariant();
    delete variant.caffeine_mg;
    expect(getScaledVariantNumericValue('caffeineMg', variant)).toBe(0);
  });

  it('applyVariantToFormState formats caffeine_mg into the form field', () => {
    const next = applyVariantToFormState(baseForm, makeVariant());
    expect(next.caffeineMg).toBe('63');
  });

  it('buildPreciseNumericValuesFromVariant carries caffeine_mg through as a number', () => {
    const precise = buildPreciseNumericValuesFromVariant(makeVariant());
    expect(precise.caffeineMg).toBe(63);
  });

  it('buildVariantFromFormData round-trips caffeineMg back to caffeine_mg', () => {
    const formState = applyVariantToFormState(baseForm, makeVariant());
    const variant = buildVariantFromFormData(formState);
    expect(variant.caffeine_mg).toBe(63);
  });

  it('buildDisplayFormState formats an initial caffeineMg value', () => {
    const display = buildDisplayFormState({ caffeineMg: '95' });
    expect(display.caffeineMg).toBe('95');
  });
});

// Phase 3 (#1557): water_ml is the second nutrient field added since the form
// was hand-laid-out — same coverage as caffeineMg above, since a shared
// mistake (e.g. forgetting a spot in buildVariantFromFormData) would only
// show up here if it happens to also apply to whichever field is tested.
describe('foodFormState — waterMl', () => {
  it('is part of NUMERIC_FOOD_FORM_FIELDS and NUTRITION_FIELDS', () => {
    expect(NUMERIC_FOOD_FORM_FIELDS).toContain('waterMl');
    expect(NUTRITION_FIELDS).toContain('waterMl');
  });

  it('getScaledVariantNumericValue reads water_ml off the variant', () => {
    expect(getScaledVariantNumericValue('waterMl', makeVariant())).toBe(240);
  });

  it('getScaledVariantNumericValue defaults to 0 when the variant has none', () => {
    const variant = makeVariant();
    delete variant.water_ml;
    expect(getScaledVariantNumericValue('waterMl', variant)).toBe(0);
  });

  it('applyVariantToFormState formats water_ml into the form field', () => {
    const next = applyVariantToFormState(baseForm, makeVariant());
    expect(next.waterMl).toBe('240');
  });

  it('buildPreciseNumericValuesFromVariant carries water_ml through as a number', () => {
    const precise = buildPreciseNumericValuesFromVariant(makeVariant());
    expect(precise.waterMl).toBe(240);
  });

  it('buildVariantFromFormData round-trips waterMl back to water_ml', () => {
    const formState = applyVariantToFormState(baseForm, makeVariant());
    const variant = buildVariantFromFormData(formState);
    expect(variant.water_ml).toBe(240);
  });

  it('buildDisplayFormState formats an initial waterMl value', () => {
    const display = buildDisplayFormState({ waterMl: '300' });
    expect(display.waterMl).toBe('300');
  });
});
