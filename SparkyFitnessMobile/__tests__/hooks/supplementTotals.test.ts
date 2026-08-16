import {
  resolveSupplementTotals,
  hasSupplementNutrition,
  EMPTY_SUPPLEMENT_TOTALS,
} from '@workspace/shared';

// Mobile derives its macro pills from food entries while the calorie ring comes from the
// server's calorieBalance, which counts supplements. Without the supplement arm here the
// ring disagreed with the pills beneath it, and with the nutrition details screen.
describe('resolveSupplementTotals', () => {
  it('passes a real arm through untouched', () => {
    const totals = {
      calories: 15,
      protein: 0,
      carbs: 0,
      fat: 1.5,
      dietary_fiber: 0,
    };
    expect(resolveSupplementTotals(totals)).toBe(totals);
  });

  it('returns zeros when the server predates supplement totals', () => {
    // An app update can outrun the server it talks to; that must add nothing rather than
    // producing NaN through every macro on the dashboard.
    expect(resolveSupplementTotals(undefined)).toEqual(EMPTY_SUPPLEMENT_TOTALS);
    expect(resolveSupplementTotals(null)).toEqual(EMPTY_SUPPLEMENT_TOTALS);
  });

  it('covers exactly the fields both clients add', () => {
    expect(Object.keys(EMPTY_SUPPLEMENT_TOTALS).sort()).toEqual([
      'calories',
      'carbs',
      'dietary_fiber',
      'fat',
      'protein',
    ]);
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
