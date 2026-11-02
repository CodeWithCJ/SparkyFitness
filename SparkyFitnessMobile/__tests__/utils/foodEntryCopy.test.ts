import { buildFoodEntryCopyPayload } from '../../src/utils/foodEntryCopy';
import type { FoodEntry } from '../../src/types/foodEntries';

const baseEntry: FoodEntry = {
  id: 'entry-1',
  food_id: 'food-1',
  variant_id: 'variant-1',
  meal_type: 'Breakfast',
  meal_type_id: 'breakfast-id',
  quantity: 2,
  unit: 'serving',
  notes: 'with oat milk',
  food_name: 'Porridge',
  brand_name: 'Oaty',
  entry_date: '2026-11-01',
  entry_time: '07:30:00',
  serving_size: 40,
  serving_unit: 'g',
  calories: 150,
  protein: 5,
  carbs: '27' as unknown as number,
  fat: 3,
  custom_nutrients: { Zinc: 1.2 },
};

describe('buildFoodEntryCopyPayload', () => {
  it('keeps the entry snapshot, note and time, linked to its library food', () => {
    expect(
      buildFoodEntryCopyPayload(baseEntry, '2026-11-02', 'lunch-id')
    ).toEqual({
      meal_type_id: 'lunch-id',
      quantity: 2,
      unit: 'serving',
      entry_date: '2026-11-02',
      entry_time: '07:30:00',
      notes: 'with oat milk',
      food_id: 'food-1',
      variant_id: 'variant-1',
      food_name: 'Porridge',
      brand_name: 'Oaty',
      serving_size: 40,
      serving_unit: 'g',
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
      custom_nutrients: { Zinc: 1.2 },
    });
  });

  it('copies a food deleted from the library as a standalone entry', () => {
    const payload = buildFoodEntryCopyPayload(
      { ...baseEntry, food_id: undefined, variant_id: undefined },
      '2026-11-02',
      'lunch-id'
    );
    expect(payload.food_id).toBeUndefined();
    expect(payload.variant_id).toBeUndefined();
    expect(payload.food_name).toBe('Porridge');
    expect(payload.calories).toBe(150);
  });
});
