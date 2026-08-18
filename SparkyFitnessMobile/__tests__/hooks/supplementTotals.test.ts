import {
  resolveSupplementTotals,
  hasSupplementNutrition,
  EMPTY_SUPPLEMENT_TOTALS,
  FOOD_VARIANT_NUTRIENT_FIELDS,
} from '@workspace/shared';

// Mobile derives its macro pills from food entries while the calorie ring comes from the
// server's calorieBalance, which counts supplements. Without the supplement arm here the
// ring disagreed with the pills beneath it, and with the nutrition details screen.
describe('resolveSupplementTotals', () => {
  it('preserves the values a real arm carries', () => {
    // No longer identity-preserving: since #2145 this fills the fixed nutrients an older
    // server omits, so it must build a new object. What matters is that supplied values
    // survive and absent ones read as zero rather than undefined.
    const totals = {
      calories: 15,
      protein: 0,
      carbs: 0,
      fat: 1.5,
      dietary_fiber: 0,
    };
    const resolved = resolveSupplementTotals(totals);

    expect(resolved.calories).toBe(15);
    expect(resolved.fat).toBe(1.5);
    expect(resolved.calcium).toBe(0);
    expect(resolved.sodium).toBe(0);
  });

  it('keeps a full-width arm intact', () => {
    const totals = { ...EMPTY_SUPPLEMENT_TOTALS, calcium: 10000, iron: 18 };

    expect(resolveSupplementTotals(totals)).toEqual(totals);
  });

  it('returns zeros when the server predates supplement totals', () => {
    // An app update can outrun the server it talks to; that must add nothing rather than
    // producing NaN through every macro on the dashboard.
    expect(resolveSupplementTotals(undefined)).toEqual(EMPTY_SUPPLEMENT_TOTALS);
    expect(resolveSupplementTotals(null)).toEqual(EMPTY_SUPPLEMENT_TOTALS);
  });

  it('covers exactly the fields both clients add', () => {
    // Tied to the shared column list rather than restated, so this cannot drift from the
    // set `reportRepository` sums and the Diary card renders. It listed only the five
    // macro fields until #2145.
    expect(Object.keys(EMPTY_SUPPLEMENT_TOTALS).sort()).toEqual(
      [...FOOD_VARIANT_NUTRIENT_FIELDS].sort()
    );
    expect(Object.keys(EMPTY_SUPPLEMENT_TOTALS)).toHaveLength(17);
  });

  it('is arithmetically inert for a day with no supplements', () => {
    const zeros = resolveSupplementTotals(undefined);
    expect(120 + zeros.protein).toBe(120);
    expect(1532 + zeros.calories).toBe(1532);
  });

  // Surfaces that decide whether there is anything to show were written when food was the
  // only source of nutrition. This is what lets them ask about supplements as well, so a
  // supplement-only day is not presented as an empty one under a nonzero calorie figure.
  it('reports nutrition when any field carries a value', () => {
    expect(
      hasSupplementNutrition({ ...EMPTY_SUPPLEMENT_TOTALS, calories: 15 })
    ).toBe(true);
    expect(
      hasSupplementNutrition({ ...EMPTY_SUPPLEMENT_TOTALS, dietary_fiber: 3 })
    ).toBe(true);
  });

  it('reports none for zeros, an absent arm, or an older server', () => {
    // All three must leave the empty state intact rather than defeating it.
    expect(hasSupplementNutrition(EMPTY_SUPPLEMENT_TOTALS)).toBe(false);
    expect(hasSupplementNutrition(undefined)).toBe(false);
    expect(hasSupplementNutrition(null)).toBe(false);
  });
});
