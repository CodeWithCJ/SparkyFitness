import { addSupplementTotals } from '@/utils/nutritionCalculations';
import { EMPTY_SUPPLEMENT_TOTALS } from '@workspace/shared';
import type { MealTotals } from '@/types/meal';

const foodTotals = {
  calories: 1532,
  protein: 120,
  carbs: 150,
  fat: 50,
  dietary_fiber: 20,
  sugars: 30,
  sodium: 2000,
  cholesterol: 100,
  saturated_fat: 10,
  calcium: 256.3,
  custom_nutrients: {},
} as unknown as MealTotals;

const supplementTotals = {
  ...EMPTY_SUPPLEMENT_TOTALS,
  calories: 15,
  fat: 1.5,
};

describe('addSupplementTotals', () => {
  it('adds the supplement arm to the macro fields', () => {
    const totals = addSupplementTotals(foodTotals, supplementTotals);

    expect(totals.calories).toBe(1547);
    expect(totals.fat).toBe(51.5);
    expect(totals.protein).toBe(120);
  });

  // The #2145 case: a supplement's calcium reached Reports, which sums all seventeen
  // fixed columns, but not the Diary card, which summed five. The reporter saw the
  // food-only 256.3mg against a dose supplying 10000mg.
  it('adds micronutrients the supplement carries, not just macros', () => {
    const totals = addSupplementTotals(foodTotals, {
      ...EMPTY_SUPPLEMENT_TOTALS,
      calcium: 10000,
      sodium: 150,
      iron: 18,
    });

    expect(totals.calcium).toBe(10256.3);
    expect(totals.sodium).toBe(2150);
    expect(totals.iron).toBe(18);
  });

  // The larger half of #2145. Only six catalog micronutrients have a fixed column, so a
  // magnesium or vitamin D supplement contributes nothing the fixed loop can reach; those
  // values live in the snapshot's custom_nutrients and have to be folded separately.
  it('adds custom nutrients the supplement carries', () => {
    const totals = addSupplementTotals(
      {
        ...foodTotals,
        custom_nutrients: { Magnesium: 120, Choline: 200 },
      } as unknown as MealTotals,
      {
        ...EMPTY_SUPPLEMENT_TOTALS,
        custom_nutrients: { Magnesium: 400, 'Vitamin D': 50 },
      }
    );

    expect(totals.custom_nutrients).toEqual({
      Magnesium: 520,
      Choline: 200,
      // No food supplied it, which is the ordinary case for a supplement nutrient. Being
      // dropped for that would leave the row reading zero against a dose that supplied it.
      'Vitamin D': 50,
    });
  });

  it('does not mutate the food custom-nutrient map it was handed', () => {
    // The caller's own day totals hold this object; folding doses into it in place would
    // double-count the moment the same day is folded again.
    const foodCustom = { Magnesium: 120 };
    const withCustom = {
      ...foodTotals,
      custom_nutrients: foodCustom,
    } as unknown as MealTotals;

    addSupplementTotals(withCustom, {
      ...EMPTY_SUPPLEMENT_TOTALS,
      custom_nutrients: { Magnesium: 400 },
    });

    expect(foodCustom).toEqual({ Magnesium: 120 });
  });

  it('leaves the custom nutrients alone when the supplement carries none', () => {
    const totals = addSupplementTotals(
      {
        ...foodTotals,
        custom_nutrients: { Magnesium: 120 },
      } as unknown as MealTotals,
      supplementTotals
    );

    expect(totals.custom_nutrients).toEqual({ Magnesium: 120 });
  });

  it('leaves a fixed field alone when the supplement contributes nothing to it', () => {
    const totals = addSupplementTotals(foodTotals, supplementTotals);

    expect(totals.sodium).toBe(2000);
    expect(totals.sugars).toBe(30);
    expect(totals.cholesterol).toBe(100);
  });

  // A client newer than its server gets only the five macro keys back. Adding
  // `food[key] + supplements[key]` across all seventeen would write NaN into the other
  // twelve, which renders as "NaN mg" rather than failing loudly.
  it('does not produce NaN against a server that reports only the macro fields', () => {
    const legacyServerResponse = {
      calories: 15,
      protein: 0,
      carbs: 0,
      fat: 1.5,
      dietary_fiber: 0,
    };

    const totals = addSupplementTotals(foodTotals, legacyServerResponse);

    expect(totals.calories).toBe(1547);
    expect(totals.calcium).toBe(256.3);
    expect(totals.sodium).toBe(2000);
    expect(Number.isNaN(totals.calcium as number)).toBe(false);
    expect(Number.isNaN(totals.potassium as number)).toBe(false);
  });

  it('returns the food totals untouched when there is no supplement arm', () => {
    expect(addSupplementTotals(foodTotals, undefined)).toBe(foodTotals);
    expect(addSupplementTotals(foodTotals, null)).toBe(foodTotals);
  });

  it('is a no-op for a day with supplements that carry no nutrition', () => {
    const totals = addSupplementTotals(foodTotals, EMPTY_SUPPLEMENT_TOTALS);

    expect(totals.calories).toBe(1532);
    expect(totals.fat).toBe(50);
    expect(totals.calcium).toBe(256.3);
  });
});
