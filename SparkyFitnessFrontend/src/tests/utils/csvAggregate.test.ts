import { isAggregateMapping, reshapeAggregateRow } from '@/utils/csvAggregate';

const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'];

describe('isAggregateMapping', () => {
  it('detects a per-meal aggregate file (identity unmapped, nutrients mapped)', () => {
    const mapping: Record<string, string> = {
      date: 'Date',
      meal_type: 'Meal Type',
      calories: 'Calories',
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
    };
    expect(isAggregateMapping(mapping, NUTRIENTS)).toBe(true);
  });

  it('returns false when food_name is mapped (per-food file)', () => {
    const mapping: Record<string, string> = {
      date: 'Date',
      meal_type: 'Meal',
      food_name: 'Food',
      quantity: 'Qty',
      unit: 'Unit',
      calories: 'Calories',
    };
    expect(isAggregateMapping(mapping, NUTRIENTS)).toBe(false);
  });

  it('returns false when quantity is mapped (per-food file)', () => {
    const mapping: Record<string, string> = {
      date: 'Date',
      meal_type: 'Meal',
      quantity: 'Qty',
      calories: 'Calories',
    };
    expect(isAggregateMapping(mapping, NUTRIENTS)).toBe(false);
  });

  it('returns false when no nutrients are mapped', () => {
    const mapping: Record<string, string> = {
      date: 'Date',
      meal_type: 'Meal',
    };
    expect(isAggregateMapping(mapping, NUTRIENTS)).toBe(false);
  });

  it('returns false for an empty mapping', () => {
    expect(isAggregateMapping({}, NUTRIENTS)).toBe(false);
  });
});

describe('reshapeAggregateRow', () => {
  it('sets meal_name/food_name from meal_type (trimmed) and 1 serving', () => {
    expect(reshapeAggregateRow({ meal_type: ' Breakfast ' })).toEqual({
      meal_name: 'Breakfast',
      food_name: 'Breakfast',
      quantity: '1',
      unit: 'serving',
    });
  });

  it('falls back to empty meal_type when the cell is missing', () => {
    expect(reshapeAggregateRow({})).toEqual({
      meal_name: '',
      food_name: '',
      quantity: '1',
      unit: 'serving',
    });
  });
});
