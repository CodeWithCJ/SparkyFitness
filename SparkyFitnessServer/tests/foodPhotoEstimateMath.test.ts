import { describe, it, expect } from 'vitest';
import {
  asPortionMacros,
  asPer100gMacros,
  toPer100g,
  fromPer100g,
  scalePortionMacros,
  scaleVariantToGrams,
  sumPortionMacros,
  sumGrams,
  roundMacros,
  scoreFoodMatch,
  MATCH_MIN_SCORE,
  MATCH_PRESELECT_SCORE,
  PER_100G_BASIS_GRAMS,
  getConversionFactor,
} from '@workspace/shared';

// 145 g of grilled chicken thigh, as the vision model reports it.
const CHICKEN_PORTION = asPortionMacros({
  calories_kcal: 289,
  protein_g: 38,
  carbs_g: 0,
  fat_g: 14.5,
  fiber_g: 0,
  sugar_g: 0,
});

describe('basis conversion', () => {
  it('converts a portion to per-100g using the portion weight', () => {
    const per100 = toPer100g(CHICKEN_PORTION, 145);
    expect(per100).not.toBeNull();
    expect(per100!.calories_kcal).toBeCloseTo((289 / 145) * 100, 6);
    expect(per100!.protein_g).toBeCloseTo((38 / 145) * 100, 6);
  });

  it('round-trips portion -> per100g -> portion without drift', () => {
    const per100 = toPer100g(CHICKEN_PORTION, 145)!;
    const back = fromPer100g(per100, 145)!;
    expect(back.calories_kcal).toBeCloseTo(289, 9);
    expect(back.protein_g).toBeCloseTo(38, 9);
    expect(back.fat_g).toBeCloseTo(14.5, 9);
  });

  it('round-trips at a different weight, scaling proportionally', () => {
    const per100 = toPer100g(CHICKEN_PORTION, 145)!;
    const half = fromPer100g(per100, 72.5)!;
    expect(half.calories_kcal).toBeCloseTo(144.5, 9);
  });

  it('is identity at the 100 g reference weight', () => {
    const per100 = toPer100g(CHICKEN_PORTION, PER_100G_BASIS_GRAMS)!;
    expect(per100.calories_kcal).toBeCloseTo(289, 9);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns null instead of Infinity for weight %s',
    (grams) => {
      expect(toPer100g(CHICKEN_PORTION, grams)).toBeNull();
    }
  );

  it('returns null rather than dividing by a zero reference weight', () => {
    const per100 = asPer100gMacros({ calories_kcal: 199 });
    expect(fromPer100g(per100, 0)).toBeNull();
    expect(fromPer100g(per100, -5)).toBeNull();
  });

  it('clamps negative and non-finite inputs to zero on the way in', () => {
    const m = asPortionMacros({
      calories_kcal: -50,
      protein_g: Number.NaN,
      carbs_g: 12,
      fat_g: undefined,
      fiber_g: Number.POSITIVE_INFINITY,
      sugar_g: 3,
    });
    expect(m.calories_kcal).toBe(0);
    expect(m.protein_g).toBe(0);
    expect(m.carbs_g).toBe(12);
    expect(m.fat_g).toBe(0);
    expect(m.fiber_g).toBe(0);
    expect(m.sugar_g).toBe(3);
  });
});

describe('scalePortionMacros', () => {
  it('rescales every macro when the user corrects the grams', () => {
    const halved = scalePortionMacros(CHICKEN_PORTION, 145, 72.5)!;
    expect(halved.calories_kcal).toBeCloseTo(144.5, 9);
    expect(halved.fat_g).toBeCloseTo(7.25, 9);
  });

  it('allows scaling to zero grams', () => {
    const zero = scalePortionMacros(CHICKEN_PORTION, 145, 0)!;
    expect(zero.calories_kcal).toBe(0);
  });

  it('refuses to scale from a zero base weight', () => {
    expect(scalePortionMacros(CHICKEN_PORTION, 0, 100)).toBeNull();
  });
});

describe('scaleVariantToGrams', () => {
  const perServing = {
    calories_kcal: 199,
    protein_g: 26,
    carbs_g: 0,
    fat_g: 10,
    fiber_g: 0,
    sugar_g: 0,
  };

  it('scales a 100 g variant to the estimated grams', () => {
    const scaled = scaleVariantToGrams(
      perServing,
      100,
      'g',
      145,
      getConversionFactor
    )!;
    expect(scaled.calories_kcal).toBeCloseTo(199 * 1.45, 6);
  });

  it('scales a variant stored in oz', () => {
    // 1 oz = 28.3495 g, so a 4 oz serving is 113.398 g.
    const scaled = scaleVariantToGrams(
      perServing,
      4,
      'oz',
      113.398,
      getConversionFactor
    )!;
    expect(scaled.calories_kcal).toBeCloseTo(199, 3);
  });

  it('returns null for a non-weight variant unit so the UI can hide the option', () => {
    expect(
      scaleVariantToGrams(perServing, 1, 'cup', 145, getConversionFactor)
    ).toBeNull();
    expect(
      scaleVariantToGrams(perServing, 1, 'slice', 145, getConversionFactor)
    ).toBeNull();
  });

  it('returns null for a zero serving size', () => {
    expect(
      scaleVariantToGrams(perServing, 0, 'g', 145, getConversionFactor)
    ).toBeNull();
  });
});

describe('totals', () => {
  const items = [
    { estimated_grams: 145, macros: CHICKEN_PORTION },
    {
      estimated_grams: 180,
      macros: asPortionMacros({
        calories_kcal: 234,
        carbs_g: 51,
        protein_g: 4.3,
        fiber_g: 0.6,
        sugar_g: 0.1,
        fat_g: 0.4,
      }),
    },
    {
      estimated_grams: 85,
      macros: asPortionMacros({
        calories_kcal: 89,
        carbs_g: 7,
        protein_g: 3,
        fiber_g: 2.6,
        sugar_g: 1.4,
        fat_g: 1,
      }),
    },
  ];

  it('sums macros across rows', () => {
    const total = sumPortionMacros(items);
    expect(total.calories_kcal).toBeCloseTo(612, 6);
    expect(total.protein_g).toBeCloseTo(45.3, 6);
  });

  it('sums grams across rows', () => {
    expect(sumGrams(items)).toBe(410);
  });

  it('drops a removed row from the totals', () => {
    const total = sumPortionMacros(items.filter((_, i) => i !== 1));
    expect(total.calories_kcal).toBeCloseTo(378, 6);
  });

  it('ignores non-positive grams when summing weight', () => {
    expect(
      sumGrams([
        { estimated_grams: 100 },
        { estimated_grams: -5 },
        { estimated_grams: Number.NaN },
      ])
    ).toBe(100);
  });
});

describe('roundMacros', () => {
  it('rounds to two decimals by default', () => {
    const per100 = toPer100g(CHICKEN_PORTION, 145)!;
    const rounded = roundMacros(per100);
    expect(rounded.calories_kcal).toBe(199.31);
  });
});

describe('scoreFoodMatch', () => {
  const base = {
    isOwnFood: true,
    candidateBrand: null,
    daysSinceLastUsed: null,
  };

  it('scores an exact name match at the top and flags the source', () => {
    const r = scoreFoodMatch({
      ...base,
      candidateName: 'Chicken Thigh',
      queryName: 'chicken thigh',
    });
    expect(r.source).toBe('exact_name');
    expect(r.score).toBeGreaterThanOrEqual(MATCH_PRESELECT_SCORE);
  });

  it('scores a subset query well above the threshold', () => {
    const r = scoreFoodMatch({
      ...base,
      candidateName: 'Chicken Thigh, Roasted',
      queryName: 'chicken thigh',
    });
    expect(r.score).toBeGreaterThan(MATCH_MIN_SCORE);
  });

  it('keeps a generic query away from a long unrelated branded name', () => {
    const r = scoreFoodMatch({
      ...base,
      candidateName: 'Rice Krispies Treats Cereal Bar',
      candidateBrand: 'Kelloggs',
      queryName: 'rice',
    });
    expect(r.score).toBeLessThan(MATCH_MIN_SCORE);
  });

  it('scores zero when no tokens overlap', () => {
    expect(
      scoreFoodMatch({
        ...base,
        candidateName: 'Greek Yogurt',
        queryName: 'broccoli',
      }).score
    ).toBe(0);
  });

  it('prefers the user own food over an otherwise identical public one', () => {
    const own = scoreFoodMatch({
      ...base,
      isOwnFood: true,
      candidateName: 'Jasmine Rice, Cooked',
      queryName: 'jasmine rice',
    });
    const pub = scoreFoodMatch({
      ...base,
      isOwnFood: false,
      candidateName: 'Jasmine Rice, Cooked',
      queryName: 'jasmine rice',
    });
    expect(own.score).toBeGreaterThan(pub.score);
  });

  it('boosts a recently logged food and marks it as recent_usage', () => {
    const recent = scoreFoodMatch({
      ...base,
      candidateName: 'Jasmine Rice, Cooked',
      queryName: 'jasmine rice',
      daysSinceLastUsed: 2,
    });
    const stale = scoreFoodMatch({
      ...base,
      candidateName: 'Jasmine Rice, Cooked',
      queryName: 'jasmine rice',
      daysSinceLastUsed: 400,
    });
    expect(recent.score).toBeGreaterThan(stale.score);
    expect(recent.source).toBe('recent_usage');
  });

  it('never exceeds 1 or drops below 0', () => {
    const r = scoreFoodMatch({
      candidateName: 'Chicken Thigh',
      queryName: 'chicken thigh',
      isOwnFood: true,
      daysSinceLastUsed: 0,
    });
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('handles empty input without throwing', () => {
    expect(
      scoreFoodMatch({ ...base, candidateName: '', queryName: 'rice' }).score
    ).toBe(0);
    expect(
      scoreFoodMatch({ ...base, candidateName: 'Rice', queryName: '' }).score
    ).toBe(0);
  });
});
