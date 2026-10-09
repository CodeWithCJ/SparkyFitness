import { describe, expect, it } from 'vitest';
import {
  resolveFoodPortion,
  validateNutritionReference,
  nutrientNumber,
  normalizePortionUnit,
} from '../utils/foodPortionResolver.js';
import { scaleNutritionForConsumedAmount } from '../utils/foodUtils.js';

const grams = {
  id: 'grams',
  serving_size: 100,
  serving_unit: 'g',
  calories: 250,
  protein: 8,
  carbs: 48,
  fat: 3,
  is_default: true,
};
const slice = {
  id: 'slice',
  serving_size: 1,
  serving_unit: 'slice',
  calories: 100,
  protein: 3.2,
  carbs: 19.2,
  fat: 1.2,
};

describe('verified food portions', () => {
  it('accepts source-reported alcohol energy without changing the label values', () => {
    const spirits = {
      serving_size: 50,
      serving_unit: 'ml',
      calories: 110,
      protein: 0,
      carbs: 0,
      fat: 0,
      alcohol_g: 15.8,
    };
    expect(validateNutritionReference(spirits)).toBeNull();
    expect(spirits.calories).toBe(110);
    expect(validateNutritionReference({ ...spirits, calories: 5 })).toContain(
      'disagree'
    );
    expect(
      validateNutritionReference({ ...spirits, alcohol_g: null })
    ).toContain('disagree');
  });
  it.each([-1, Infinity, 'invalid'])(
    'rejects invalid source-reported alcohol %s',
    (alcohol_g) => {
      expect(validateNutritionReference({ ...grams, alcohol_g })).toContain(
        'negative or non-finite'
      );
    }
  );
  it.each(['large slices', 'slice large', 'slice, large', ' LARGE  SLICES '])(
    'preserves the size qualifier in %s',
    (unit) => {
      expect(normalizePortionUnit(unit)).toBe('slice large');
    }
  );
  it('keeps ordinary and large slices distinct and never invents a size equivalence', () => {
    const large = { ...slice, serving_unit: 'slice large', calories: 120 };
    expect(
      resolveFoodPortion({
        quantity: 2,
        unit: 'large slices',
        variants: [slice, large],
      })
    ).toMatchObject({ ok: true, variant: large });
    expect(
      resolveFoodPortion({ quantity: 2, unit: 'slices', variants: [large] }).ok
    ).toBe(false);
  });
  it('requires an exact selection when two references for the same unit disagree', () => {
    const other = { ...slice, id: 'other', calories: 160 };
    expect(
      resolveFoodPortion({
        quantity: 2,
        unit: 'slice',
        variants: [slice, other],
      })
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining('exact serving ID'),
    });
    expect(
      resolveFoodPortion({
        quantity: 2,
        unit: 'slice',
        variants: [slice, other],
        explicitVariant: other,
      })
    ).toMatchObject({ ok: true, variant: other });
    expect(
      resolveFoodPortion({
        quantity: 2,
        unit: 'slice',
        variants: [slice, { ...slice, calories: 101 }],
      }).ok
    ).toBe(true);
  });
  it('logs two white bread slices as 200 calories, never two grams / five calories', () => {
    const result = resolveFoodPortion({
      quantity: 2,
      unit: 'slices',
      variants: [grams, slice],
      preferredVariant: grams,
    });
    expect(result).toEqual({
      ok: true,
      quantity: 2,
      unit: 'slice',
      variant: slice,
    });
    if (result.ok)
      expect(
        scaleNutritionForConsumedAmount(
          result.quantity,
          result.variant.serving_size,
          result.variant
        ).calories
      ).toBe(200);
  });
  it('asks for evidence when no slice equivalent exists', () => {
    expect(
      resolveFoodPortion({ quantity: 2, unit: 'slice', variants: [grams] }).ok
    ).toBe(false);
  });
  it('resolves fractional household portions and metric conversions', () => {
    const quarterCup = {
      serving_size: 0.25,
      serving_unit: 'cup',
      calories: 80,
    };
    const result = resolveFoodPortion({
      quantity: 0.5,
      unit: 'cup',
      variants: [quarterCup],
    });
    expect(
      result.ok &&
        scaleNutritionForConsumedAmount(
          result.quantity,
          result.variant.serving_size,
          { calories: quarterCup.calories }
        ).calories
    ).toBe(160);
    expect(
      resolveFoodPortion({ quantity: 0.075, unit: 'kg', variants: [grams] })
    ).toMatchObject({ ok: true, quantity: 75, unit: 'g' });
    expect(
      resolveFoodPortion({ quantity: 0.75, unit: 'serving', variants: [grams] })
    ).toMatchObject({ ok: true, quantity: 75, unit: 'g' });
  });
  it('keeps an explicit reference and rejects cross-dimension guesses', () => {
    expect(
      resolveFoodPortion({
        quantity: 2,
        unit: 'slice',
        variants: [grams, slice],
        explicitVariant: grams,
      }).ok
    ).toBe(false);
    expect(
      resolveFoodPortion({ quantity: 100, unit: 'ml', variants: [grams] }).ok
    ).toBe(false);
    expect(
      resolveFoodPortion({ quantity: 1, unit: 'pack', variants: [slice] }).ok
    ).toBe(false);
  });
  it.each([0, -1, NaN, Infinity])(
    'rejects invalid consumed quantity %s',
    (quantity) => {
      expect(resolveFoodPortion({ quantity, variants: [grams] }).ok).toBe(
        false
      );
    }
  );
  it('distinguishes genuine zero from unknown/non-finite nutrition', () => {
    expect(nutrientNumber('0')).toBe(0);
    for (const value of [null, undefined, '', ' ', 'None', Infinity])
      expect(nutrientNumber(value)).toBeNull();
    expect(
      validateNutritionReference({
        serving_size: 100,
        serving_unit: 'ml',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      })
    ).toBeNull();
    expect(validateNutritionReference({ ...grams, calories: 1100 })).toContain(
      '1,000'
    );
    expect(validateNutritionReference({ ...grams, calories: 5 })).toContain(
      'disagree'
    );
    expect(validateNutritionReference({ ...grams, protein: 200 })).toContain(
      'weight'
    );
    expect(validateNutritionReference({ ...grams, serving_size: 0 })).toContain(
      'positive'
    );
  });
});
