import { describe, expect, it } from 'vitest';
import {
  computeFoodHealthScore,
  computeNutriScore,
  nutrientsPer100,
  type HealthScoreFoodInput,
  type NutrientsPer100,
} from '@workspace/shared';

const ZERO: NutrientsPer100 = {
  category: 'general',
  isLiquid: false,
  hasScoreInputs: true,
  energyKcal: 0,
  sugars: 0,
  addedSugars: null,
  fat: 0,
  saturatedFat: 0,
  transFat: 0,
  sodiumMg: 0,
  fiber: 0,
  protein: 0,
};

const BEVERAGE: Partial<NutrientsPer100> = {
  category: 'beverage',
  isLiquid: true,
};

function per100(overrides: Partial<NutrientsPer100>): NutrientsPer100 {
  return { ...ZERO, ...overrides };
}

/** Sodium (mg) whose salt equivalent earns exactly `points` on the 0.2 g scale. */
function sodiumForSaltPoints(points: number): number {
  return ((points * 0.2 + 0.1) * 1000) / 2.5;
}

describe('computeNutriScore (2023 algorithm)', () => {
  it('scores semi-skimmed milk as a beverage (Open Food Facts fixture)', () => {
    // 195 kJ -> 3, sugars 4.8 g -> 3, sat fat 1 g -> 0, salt 0.1 g -> 0:
    // N = 6. Protein 3.3 g -> 7, always counted for beverages. 6 - 7 = -1 -> B.
    expect(
      computeNutriScore(
        per100({
          ...BEVERAGE,
          energyKcal: 195 / 4.184,
          sugars: 4.8,
          saturatedFat: 1,
          sodiumMg: 40,
          protein: 3.3,
        }),
        null
      )
    ).toEqual({ score: -1, grade: 'b' });
  });

  it('uses strict greater-than on the general sugar scale', () => {
    expect(computeNutriScore(per100({ sugars: 3.4 }), null)).toEqual({
      score: 0,
      grade: 'a',
    });
    expect(computeNutriScore(per100({ sugars: 3.5 }), null)).toEqual({
      score: 1,
      grade: 'b',
    });
  });

  it('applies the general grade boundaries 0 / 2 / 10 / 18', () => {
    const gradeForSaltPoints = (points: number) =>
      computeNutriScore(per100({ sodiumMg: sodiumForSaltPoints(points) }), null)
        .grade;
    expect(gradeForSaltPoints(2)).toBe('b');
    expect(gradeForSaltPoints(3)).toBe('c');
    expect(gradeForSaltPoints(10)).toBe('c');
    expect(gradeForSaltPoints(11)).toBe('d');
    expect(gradeForSaltPoints(18)).toBe('d');
    expect(gradeForSaltPoints(19)).toBe('e');
  });

  it('drops protein once negative points reach 11 for general foods', () => {
    const withSaltPoints = (points: number) =>
      computeNutriScore(
        per100({ sodiumMg: sodiumForSaltPoints(points), protein: 20 }),
        null
      ).score;
    expect(withSaltPoints(11)).toBe(11);
    expect(withSaltPoints(10)).toBe(10 - 7);
  });

  it('scores fruit, vegetables and legumes on the general and beverage scales', () => {
    expect(computeNutriScore(per100({}), 100).score).toBe(-5);
    expect(computeNutriScore(per100(BEVERAGE), 100).score).toBe(-6);
    expect(computeNutriScore(per100({}), 50).score).toBe(-1);
  });

  it('never grades a beverage A without knowing it is water', () => {
    expect(computeNutriScore(per100(BEVERAGE), null).grade).toBe('b');
  });
});

const banana: HealthScoreFoodInput = {
  fruit_veg_legume_percent: 100,
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 89,
    protein: 1.1,
    saturated_fat: 0.1,
    sodium: 1,
    dietary_fiber: 2.6,
    sugars: 12.2,
  },
};

// A 350 ml can, so the per-100 ml normalisation is exercised too. Added sugars
// are per serving like every other variant nutrient: 37.1 g = 10.6 g / 100 ml.
const soda: HealthScoreFoodInput = {
  nutri_score_category: 'beverage',
  default_variant: {
    serving_size: 350,
    serving_unit: 'ml',
    calories: 147,
    saturated_fat: 0,
    sugars: 37.1,
    added_sugars: 37.1,
    sodium: 35,
  },
};

const salty: HealthScoreFoodInput = {
  default_variant: {
    serving_size: 30,
    serving_unit: 'g',
    calories: 160,
    saturated_fat: 2.1,
    trans_fat: 0.2,
    sodium: 240,
    sugars: 0.5,
    added_sugars: 0.3,
    protein: 2,
  },
};

function withAddedSugars(
  food: HealthScoreFoodInput,
  addedSugars: number | null
): HealthScoreFoodInput {
  return {
    ...food,
    default_variant: { ...food.default_variant, added_sugars: addedSugars },
  };
}

// Per 100 g. Thresholds: ProductOpener::Nutriscore %points_thresholds_2023
// (energy from saturates and saturates/lipids ratio for fats, oils, nuts, seeds).
const oliveOil: HealthScoreFoodInput = {
  nutri_score_category: 'fat_oil_nut',
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 884,
    fat: 100,
    saturated_fat: 14,
    sugars: 0,
    sodium: 2,
  },
};

const butter: HealthScoreFoodInput = {
  nutri_score_category: 'fat_oil_nut',
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 717,
    fat: 81,
    saturated_fat: 51,
    sugars: 0.1,
    sodium: 11,
  },
};

describe('computeFoodHealthScore', () => {
  it('grades a raw banana A with no warnings', () => {
    const result = computeFoodHealthScore(banana);
    expect(result.nutri_score).toEqual({
      grade: 'a',
      score: -1,
      source: 'computed',
    });
    expect(result.warnings).toEqual({ brazil: [], chile: [], mexico: [] });
  });

  it('grades a sugary soda E and flags its sugar per region', () => {
    const result = computeFoodHealthScore(soda);
    expect(result.nutri_score?.grade).toBe('e');
    expect(result.warnings.brazil).toEqual(['added_sugars']);
    expect(result.warnings.chile).toEqual(['sugars']);
    // 10.6 g added sugar = 42 kcal of free sugar, over the 8 kcal liquid limit.
    expect(result.warnings.mexico).toEqual(['calories', 'sugars']);
  });

  it('flags sodium on a salty snack in every region', () => {
    // Per 100 g: 533 kcal, 7 g sat fat (11.8 % of energy), 0.67 g trans fat
    // (1.1 %), 800 mg sodium.
    const { warnings } = computeFoodHealthScore(salty);
    expect(warnings.brazil).toEqual(['saturated_fat', 'sodium']);
    expect(warnings.chile).toEqual(['calories', 'saturated_fat', 'sodium']);
    expect(warnings.mexico).toEqual([
      'calories',
      'saturated_fat',
      'trans_fat',
      'sodium',
    ]);
  });

  it('skips every added-sugar rule when added_sugars is unknown', () => {
    const { warnings } = computeFoodHealthScore(withAddedSugars(soda, null));
    expect(warnings.brazil).toEqual([]);
    expect(warnings.chile).toEqual([]);
    // Without free sugars Mexico's liquid calorie seal falls back to total
    // energy alone: 42 kcal < 70.
    expect(warnings.mexico).toEqual([]);
  });

  it('treats a known zero added sugar as "sugar not added" in Chile', () => {
    const { warnings } = computeFoodHealthScore(withAddedSugars(soda, 0));
    expect(warnings.chile).not.toContain('sugars');
  });

  it('uses the stricter liquid thresholds for beverages', () => {
    // 3 g sat fat / 100 ml meets Brazil's liquid limit but not the solid one.
    const drink = (unit: string, category?: 'beverage') =>
      computeFoodHealthScore({
        nutri_score_category: category,
        default_variant: {
          serving_size: 100,
          serving_unit: unit,
          saturated_fat: 3,
        },
      }).warnings.brazil;
    expect(drink('ml', 'beverage')).toEqual(['saturated_fat']);
    expect(drink('g')).toEqual([]);
  });

  it('prefers the grade Open Food Facts publishes', () => {
    const result = computeFoodHealthScore({
      ...soda,
      provider_type: 'openfoodfacts',
      provider_nutriscore_grade: 'D',
    });
    expect(result.nutri_score).toEqual({
      grade: 'd',
      score: null,
      source: 'provider',
    });
  });

  it('ignores a provider grade that is not A-E, or not from Open Food Facts', () => {
    expect(
      computeFoodHealthScore({
        ...soda,
        provider_type: 'openfoodfacts',
        provider_nutriscore_grade: 'unknown',
      }).nutri_score?.source
    ).toBe('computed');
    expect(
      computeFoodHealthScore({
        ...soda,
        provider_type: 'usda',
        provider_nutriscore_grade: 'a',
      }).nutri_score?.grade
    ).toBe('e');
  });

  it('returns no score for a serving without a weight or volume basis', () => {
    const result = computeFoodHealthScore({
      default_variant: { serving_size: 1, serving_unit: 'piece', calories: 90 },
    });
    expect(result.nutri_score).toBeNull();
    expect(result.warnings).toEqual({ brazil: [], chile: [], mexico: [] });
  });
});

describe('computeFoodHealthScore edge cases', () => {
  it('returns no grade when a required nutrient is unknown', () => {
    const base = banana.default_variant!;
    for (const missing of [
      'calories',
      'sugars',
      'saturated_fat',
      'sodium',
    ] as const) {
      const result = computeFoodHealthScore({
        default_variant: { ...base, [missing]: null },
      });
      expect(result.nutri_score, missing).toBeNull();
    }
  });

  it('returns no grade when every input is zero', () => {
    const result = computeFoodHealthScore({
      default_variant: {
        serving_size: 100,
        serving_unit: 'g',
        calories: 0,
        sugars: 0,
        saturated_fat: 0,
        sodium: 0,
      },
    });
    expect(result.nutri_score).toBeNull();
  });

  it('does not treat a volume serving unit as a beverage', () => {
    const variant = {
      serving_size: 250,
      serving_unit: 'ml',
      calories: 300,
      sugars: 2,
      saturated_fat: 5,
      sodium: 400,
    };
    expect(
      computeFoodHealthScore({ default_variant: variant }).nutri_score
    ).toBeNull();
    expect(
      computeFoodHealthScore({
        nutri_score_category: 'general',
        default_variant: variant,
      }).nutri_score
    ).toBeNull();
    expect(
      computeFoodHealthScore({
        nutri_score_category: 'beverage',
        default_variant: variant,
      }).nutri_score?.source
    ).toBe('computed');
  });

  it('needs total fat to score the fats, oils and nuts table', () => {
    const { fat: _fat, ...noFat } = oliveOil.default_variant!;
    expect(
      computeFoodHealthScore({ ...oliveOil, default_variant: noFat })
        .nutri_score
    ).toBeNull();
  });

  it('ignores protein in the fats table once negative points reach 7', () => {
    const sweetenedNuts: HealthScoreFoodInput = {
      nutri_score_category: 'fat_oil_nut',
      default_variant: {
        serving_size: 100,
        serving_unit: 'g',
        calories: 550,
        fat: 50,
        saturated_fat: 10,
        sugars: 10,
        sodium: 0,
        protein: 26,
      },
    };

    expect(computeFoodHealthScore(sweetenedNuts).nutri_score).toEqual({
      grade: 'c',
      score: 7,
      source: 'computed',
    });
  });

  it('grades olive oil C, not E, with the fats table', () => {
    // 14 g sat fat = 518 kJ -> 4, ratio 14 % -> 1: N = 5 -> C (<= 10).
    expect(computeFoodHealthScore(oliveOil).nutri_score).toEqual({
      grade: 'c',
      score: 5,
      source: 'computed',
    });
    // The general table would give 20 points for the same oil.
    expect(
      computeFoodHealthScore({ ...oliveOil, nutri_score_category: null })
        .nutri_score?.grade
    ).toBe('e');
  });

  it('still grades a saturated-fat-heavy fat E', () => {
    // 51 g sat fat -> 10 energy points, ratio 63 % -> 9: N = 19 -> E (> 18).
    expect(computeFoodHealthScore(butter).nutri_score).toEqual({
      grade: 'e',
      score: 19,
      source: 'computed',
    });
  });

  it('lets a trusted provider grade win over the category table', () => {
    expect(
      computeFoodHealthScore({
        ...oliveOil,
        provider_type: 'openfoodfacts',
        provider_nutriscore_grade: 'b',
      }).nutri_score
    ).toEqual({ grade: 'b', score: null, source: 'provider' });
  });
});

describe('nutrientsPer100', () => {
  it('converts imperial servings to grams and millilitres', () => {
    expect(
      nutrientsPer100({ serving_size: 1, serving_unit: 'oz', sodium: 283.495 })
        ?.sodiumMg
    ).toBeCloseTo(1000);
    expect(
      nutrientsPer100(
        { serving_size: 1, serving_unit: 'cup', sugars: 23.6588 },
        'beverage'
      )
    ).toMatchObject({ isLiquid: true, sugars: expect.closeTo(10) });
  });

  it('refuses a volume serving for anything but a beverage', () => {
    expect(
      nutrientsPer100({ serving_size: 1, serving_unit: 'cup', sugars: 5 })
    ).toBeNull();
  });

  it('keeps unknown added sugars null instead of 0', () => {
    const variant = { serving_size: 50, serving_unit: 'g' };
    expect(nutrientsPer100(variant)?.addedSugars).toBeNull();
    expect(
      nutrientsPer100({ ...variant, added_sugars: 5 })?.addedSugars
    ).toBeCloseTo(10);
  });
});
