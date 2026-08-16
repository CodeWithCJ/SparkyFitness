import { addSupplementTotals } from '@/utils/nutritionCalculations';
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
  custom_nutrients: {},
} as unknown as MealTotals;

const supplementTotals = {
  calories: 15,
  protein: 0,
  carbs: 0,
  fat: 1.5,
  dietary_fiber: 0,
};

describe('addSupplementTotals', () => {
  it('adds the supplement arm to the five rolled-up fields', () => {
    const totals = addSupplementTotals(foodTotals, supplementTotals);

    expect(totals.calories).toBe(1547);
    expect(totals.fat).toBe(51.5);
    expect(totals.protein).toBe(120);
  });

  it('leaves fields the server does not roll up for supplements alone', () => {
    // Sodium is not summed for supplements by the nutrition summary or the chatbot, so
    // adding it here would make the Diary the only surface that counted it.
    const totals = addSupplementTotals(foodTotals, supplementTotals);

    expect(totals.sodium).toBe(2000);
    expect(totals.sugars).toBe(30);
    expect(totals.cholesterol).toBe(100);
  });

  it('returns the food totals untouched when there is no supplement arm', () => {
    expect(addSupplementTotals(foodTotals, undefined)).toBe(foodTotals);
    expect(addSupplementTotals(foodTotals, null)).toBe(foodTotals);
  });

  it('is a no-op for a day with supplements that carry no nutrition', () => {
    const totals = addSupplementTotals(foodTotals, {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      dietary_fiber: 0,
    });

    expect(totals.calories).toBe(1532);
    expect(totals.fat).toBe(50);
  });
});
