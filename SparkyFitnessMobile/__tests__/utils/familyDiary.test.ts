import type { FoodEntry } from '../../src/types/foodEntries';
import {
  calculateFamilyCopyTotals,
  groupFamilyFoodEntries,
  isUnchangedWholeMeal,
} from '../../src/utils/familyDiary';

const entry = (overrides: Partial<FoodEntry> = {}): FoodEntry =>
  ({
    id: 'entry-id',
    meal_type: 'Dinner',
    meal_type_id: 'dinner-id',
    quantity: 100,
    unit: 'g',
    serving_size: 100,
    entry_date: '2026-08-23',
    calories: 100,
    protein: 10,
    carbs: 20,
    fat: 5,
    ...overrides,
  } as FoodEntry);

describe('family diary helpers', () => {
  it('groups raw components by canonical meal identity and preserves every row', () => {
    const groups = groupFamilyFoodEntries([
      entry({ id: 'a', meal_type_id: 'dinner-id', meal_type: 'Dinner' }),
      entry({ id: 'b', meal_type_id: 'dinner-id', meal_type: 'Dinner' }),
      entry({ id: 'c', meal_type_id: 'snack-id', meal_type: 'Snacks' }),
    ]);

    expect(
      groups.map(group => [group.key, group.entries.map(item => item.id)]),
    ).toEqual([
      ['dinner-id', ['a', 'b']],
      ['snack-id', ['c']],
    ]);
  });

  it('uses quantity and serving basis once for the review totals', () => {
    expect(
      calculateFamilyCopyTotals([
        {
          entry: entry({
            calories: 180,
            protein: 6,
            carbs: 32,
            fat: 3,
            serving_size: 100,
          }),
          quantity: 150,
        },
      ]),
    ).toEqual({ calories: 270, protein: 9, carbs: 48, fat: 4.5 });
  });

  it('classifies only all-selected unchanged quantities as a whole meal', () => {
    const source = [
      entry({ id: 'a', quantity: 100 }),
      entry({ id: 'b', quantity: 1 }),
    ];

    expect(
      isUnchangedWholeMeal(source, new Set(['a', 'b']), { a: 100, b: 1 }),
    ).toBe(true);
    expect(isUnchangedWholeMeal(source, new Set(['a']), { a: 100 })).toBe(
      false,
    );
    expect(
      isUnchangedWholeMeal(source, new Set(['a', 'b']), { a: 150, b: 1 }),
    ).toBe(false);
  });

  it('uses a stable legacy key when a meal type id is unavailable', () => {
    const groups = groupFamilyFoodEntries([
      entry({ id: 'a', meal_type_id: undefined, meal_type: 'Custom' }),
      entry({ id: 'b', meal_type_id: undefined, meal_type: 'custom' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'legacy:custom', mealTypeId: null });
    expect(groups[0].entries.map(item => item.id)).toEqual(['a', 'b']);
  });

  it('returns zero for nutrients whose serving basis is not positive', () => {
    expect(
      calculateFamilyCopyTotals([
        { entry: entry({ serving_size: 0 }), quantity: 150 },
      ]),
    ).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it('rejects zero, negative, and non-finite source or requested quantities', () => {
    expect(
      isUnchangedWholeMeal(
        [entry({ id: 'zero', quantity: 0 })],
        new Set(['zero']),
        { zero: 0 },
      ),
    ).toBe(false);
    expect(
      isUnchangedWholeMeal(
        [entry({ id: 'negative', quantity: -1 })],
        new Set(['negative']),
        { negative: -1 },
      ),
    ).toBe(false);
    expect(
      isUnchangedWholeMeal(
        [entry({ id: 'source-nan', quantity: Number.NaN })],
        new Set(['source-nan']),
        { 'source-nan': Number.NaN },
      ),
    ).toBe(false);
    expect(
      isUnchangedWholeMeal(
        [entry({ id: 'requested-zero', quantity: 1 })],
        new Set(['requested-zero']),
        { 'requested-zero': 0 },
      ),
    ).toBe(false);
    expect(
      isUnchangedWholeMeal(
        [entry({ id: 'requested-negative', quantity: 1 })],
        new Set(['requested-negative']),
        { 'requested-negative': -1 },
      ),
    ).toBe(false);
    expect(
      isUnchangedWholeMeal(
        [entry({ id: 'requested-inf', quantity: 1 })],
        new Set(['requested-inf']),
        { 'requested-inf': Number.POSITIVE_INFINITY },
      ),
    ).toBe(false);
  });
});
