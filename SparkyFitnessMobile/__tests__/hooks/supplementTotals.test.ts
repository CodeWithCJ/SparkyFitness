import {
  resolveSupplementTotals,
  hasSupplementNutrition,
  addSupplementCustomNutrients,
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
    const { custom_nutrients, ...fixed } = EMPTY_SUPPLEMENT_TOTALS;

    expect(Object.keys(fixed).sort()).toEqual(
      [...FOOD_VARIANT_NUTRIENT_FIELDS].sort()
    );
    expect(Object.keys(fixed)).toHaveLength(17);
    // The seventeen fixed columns plus the open-ended map. Only six catalog micronutrients
    // have a fixed column, so without this arm a magnesium or vitamin D supplement has
    // nowhere at all to land.
    expect(custom_nutrients).toEqual({});
  });

  it('defaults custom nutrients to an empty map, never undefined', () => {
    // Callers iterate this without checking. A server predating the custom arm, or a day
    // with no doses, has to read as "contributed nothing" rather than throwing.
    expect(resolveSupplementTotals(undefined).custom_nutrients).toEqual({});
    expect(
      resolveSupplementTotals({ calories: 15 }).custom_nutrients
    ).toEqual({});
  });

  it('carries custom nutrient values through', () => {
    const resolved = resolveSupplementTotals({
      ...EMPTY_SUPPLEMENT_TOTALS,
      custom_nutrients: { Magnesium: 400, 'Vitamin D': 50 },
    });

    expect(resolved.custom_nutrients).toEqual({
      Magnesium: 400,
      'Vitamin D': 50,
    });
  });

  it('coerces a custom nutrient the server could not total', () => {
    // sf_try_numeric yields NULL for a value it cannot parse, and a key whose every
    // contribution is NULL sums to NULL and arrives as JSON null.
    const resolved = resolveSupplementTotals({
      custom_nutrients: { Magnesium: null, Zinc: 15 } as unknown as Record<
        string,
        number
      >,
    });

    expect(resolved.custom_nutrients.Magnesium).toBe(0);
    expect(resolved.custom_nutrients.Zinc).toBe(15);
  });

  it('hands back a fresh map rather than the shared constant', () => {
    // Callers fold their own totals into what they get back. Returning the module-level
    // EMPTY_SUPPLEMENT_TOTALS for the absent case would let one caller's day leak into
    // every later caller's in the same process.
    const first = resolveSupplementTotals(undefined);
    first.custom_nutrients.Magnesium = 400;

    expect(resolveSupplementTotals(undefined).custom_nutrients).toEqual({});
    expect(EMPTY_SUPPLEMENT_TOTALS.custom_nutrients).toEqual({});
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

  // Most micronutrients are custom nutrients, so a supplement can easily carry nutrition
  // while every fixed field reads zero. Asking `Object.values(...).some(v => v > 0)` over
  // the resolved arm compares the custom_nutrients object itself against 0, gets false,
  // and presents a magnesium-only day as empty under a nonzero total.
  it('reports nutrition for a supplement carrying only custom nutrients', () => {
    expect(
      hasSupplementNutrition({
        ...EMPTY_SUPPLEMENT_TOTALS,
        custom_nutrients: { Magnesium: 400 },
      })
    ).toBe(true);
  });

  it('reports none for zeros, an absent arm, or an older server', () => {
    // All three must leave the empty state intact rather than defeating it.
    expect(hasSupplementNutrition(EMPTY_SUPPLEMENT_TOTALS)).toBe(false);
    expect(hasSupplementNutrition(undefined)).toBe(false);
    expect(hasSupplementNutrition(null)).toBe(false);
    expect(
      hasSupplementNutrition({
        ...EMPTY_SUPPLEMENT_TOTALS,
        custom_nutrients: { Magnesium: 0 },
      })
    ).toBe(false);
  });
});

// Web folds these in `addSupplementTotals` and mobile in `useDailySummary`. Shared so the
// two cannot produce different magnesium figures for the same day on adjacent screens.
describe('addSupplementCustomNutrients', () => {
  it('adds a dose onto the food total for the same nutrient', () => {
    const combined = addSupplementCustomNutrients(
      { Magnesium: 120, Choline: 200 },
      { ...EMPTY_SUPPLEMENT_TOTALS, custom_nutrients: { Magnesium: 400 } }
    );

    expect(combined.Magnesium).toBe(520);
    expect(combined.Choline).toBe(200);
  });

  it('keeps a nutrient no food supplied', () => {
    // The common case for a supplement: vitamin D has no fixed column and rarely any food
    // contribution, so dropping unmatched keys would drop the whole reason for the fix.
    const combined = addSupplementCustomNutrients(
      { Magnesium: 120 },
      {
        ...EMPTY_SUPPLEMENT_TOTALS,
        custom_nutrients: { 'Vitamin D': 50 },
      }
    );

    expect(combined['Vitamin D']).toBe(50);
    expect(combined.Magnesium).toBe(120);
  });

  it('does not mutate the food totals it was given', () => {
    const foodTotals = { Magnesium: 120 };

    addSupplementCustomNutrients(foodTotals, {
      ...EMPTY_SUPPLEMENT_TOTALS,
      custom_nutrients: { Magnesium: 400 },
    });

    expect(foodTotals).toEqual({ Magnesium: 120 });
  });

  it('is a no-op for an absent or empty supplement arm', () => {
    expect(addSupplementCustomNutrients({ Magnesium: 120 }, undefined)).toEqual({
      Magnesium: 120,
    });
    expect(
      addSupplementCustomNutrients({ Magnesium: 120 }, EMPTY_SUPPLEMENT_TOTALS)
    ).toEqual({ Magnesium: 120 });
  });

  it('handles an absent food side', () => {
    // A supplement-only day has no food entries to derive custom totals from.
    expect(
      addSupplementCustomNutrients(undefined, {
        ...EMPTY_SUPPLEMENT_TOTALS,
        custom_nutrients: { Magnesium: 400 },
      })
    ).toEqual({ Magnesium: 400 });
  });
});
