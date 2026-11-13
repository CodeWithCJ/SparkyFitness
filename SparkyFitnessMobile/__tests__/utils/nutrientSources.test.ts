import {
  buildTopSources,
  entryNutrientAmount,
  mealTypesInEntries,
} from '../../src/utils/nutrientSources';
import type { FoodEntry } from '../../src/types/foodEntries';

const entry = (overrides: Partial<FoodEntry>): FoodEntry => ({
  id: 'e',
  meal_type: 'Breakfast',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-10-01',
  serving_size: 1,
  calories: 100,
  ...overrides,
});

describe('entryNutrientAmount', () => {
  it('scales the per-serving value by quantity / serving size', () => {
    expect(
      entryNutrientAmount(
        entry({ protein: 10, quantity: 150, serving_size: 100 }),
        'protein'
      )
    ).toBeCloseTo(15);
  });

  it('reads custom nutrients by name, including string values', () => {
    expect(
      entryNutrientAmount(
        entry({ custom_nutrients: { Choline: '40' }, quantity: 2 }),
        'Choline'
      )
    ).toBe(80);
  });

  it('is zero for a missing nutrient or serving size', () => {
    expect(entryNutrientAmount(entry({}), 'calcium')).toBe(0);
    expect(
      entryNutrientAmount(entry({ calcium: 5, serving_size: 0 }), 'calcium')
    ).toBe(0);
  });
});

describe('buildTopSources', () => {
  const entries = [
    entry({ id: '1', food_id: 'milk', food_name: 'Milk', calcium: 300 }),
    entry({
      id: '2',
      food_id: 'milk',
      food_name: 'Milk',
      calcium: 300,
      entry_date: '2026-10-02',
      meal_type: 'Lunch',
    }),
    entry({ id: '3', food_id: 'kale', food_name: 'Kale', calcium: 150 }),
    entry({ id: '4', food_id: 'rice', food_name: 'Rice', calcium: 10 }),
    entry({ id: '5', food_id: 'tofu', food_name: 'Tofu', calcium: 200 }),
    entry({ id: '6', food_name: 'Oats', calcium: 0 }),
  ];

  it('combines repeats of a food and ranks the top three with shares', () => {
    const { sources, total } = buildTopSources(entries, 'calcium');
    expect(sources.map((s) => s.name)).toEqual(['Milk', 'Tofu', 'Kale']);
    expect(sources[0].amount).toBe(600);
    expect(sources[0].entryCount).toBe(2);
    expect(total).toBe(960);
    expect(sources[0].share).toBeCloseTo(600 / 960);
  });

  it('lists a source entries newest day first', () => {
    const { sources } = buildTopSources(entries, 'calcium');
    expect(sources[0].entries.map((e) => e.entry.id)).toEqual(['2', '1']);
  });

  it('filters by day', () => {
    const { sources } = buildTopSources(entries, 'calcium', {
      day: '2026-10-02',
    });
    expect(sources.map((s) => s.name)).toEqual(['Milk']);
  });

  it('filters by meal type', () => {
    const { sources, total } = buildTopSources(entries, 'calcium', {
      mealType: 'Breakfast',
    });
    expect(sources.map((s) => s.name)).toEqual(['Milk', 'Tofu', 'Kale']);
    expect(total).toBe(660);
  });

  it('groups library-less entries by name and brand', () => {
    const { sources } = buildTopSources(
      [
        entry({ id: 'a', food_name: 'Bar', brand_name: 'X', calcium: 5 }),
        entry({ id: 'b', food_name: 'Bar', brand_name: 'X', calcium: 5 }),
        entry({ id: 'c', food_name: 'Bar', brand_name: 'Y', calcium: 5 }),
      ],
      'calcium'
    );
    expect(sources).toHaveLength(2);
    expect(sources[0].amount).toBe(10);
  });

  it('returns nothing when no entry has the nutrient', () => {
    expect(buildTopSources(entries, 'iron')).toEqual({ sources: [], total: 0 });
  });
});

describe('mealTypesInEntries', () => {
  it('lists distinct meal types in first-seen order', () => {
    expect(
      mealTypesInEntries([
        entry({ meal_type: 'Lunch' }),
        entry({ meal_type: 'Breakfast' }),
        entry({ meal_type: 'Lunch' }),
      ])
    ).toEqual(['Lunch', 'Breakfast']);
  });
});
