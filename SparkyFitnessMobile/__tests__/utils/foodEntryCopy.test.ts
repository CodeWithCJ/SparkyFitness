import { buildFoodEntryCopyPayload } from '@workspace/shared';
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

  it('sends an empty custom nutrient set so the food is not used instead', () => {
    const payload = buildFoodEntryCopyPayload(
      { ...baseEntry, custom_nutrients: {} },
      '2026-11-02',
      'lunch-id'
    );
    expect(payload.custom_nutrients).toEqual({});
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

  it('carries the fat breakdown and glycemic index from the snapshot', () => {
    const payload = buildFoodEntryCopyPayload(
      {
        ...baseEntry,
        polyunsaturated_fat: 1.1,
        monounsaturated_fat: 0.9,
        glycemic_index: 'low',
      },
      '2026-11-02',
      'lunch-id'
    );
    expect(payload.polyunsaturated_fat).toBe(1.1);
    expect(payload.monounsaturated_fat).toBe(0.9);
    expect(payload.glycemic_index).toBe('low');
  });

  it('carries the allergens, traces and photos from the snapshot', () => {
    const payload = buildFoodEntryCopyPayload(
      {
        ...baseEntry,
        allergens: [],
        traces: ['nuts'],
        images: ['/uploads/food_entries/a.jpg'],
      },
      '2026-11-02',
      'lunch-id'
    );
    expect(payload.allergens).toEqual([]);
    expect(payload.traces).toEqual(['nuts']);
    expect(payload.images).toEqual(['/uploads/food_entries/a.jpg']);
  });

  it("leaves photos out when the entry shows its food's own", () => {
    const payload = buildFoodEntryCopyPayload(
      { ...baseEntry, images: [] },
      '2026-11-02',
      'lunch-id'
    );
    expect(payload.images).toBeUndefined();
  });

  it('logs the copy at the given time instead of the original one', () => {
    const payload = buildFoodEntryCopyPayload(
      baseEntry,
      '2026-11-02',
      'lunch-id',
      '21:36'
    );
    expect(payload.entry_time).toBe('21:36');
  });

  it('keeps the cooked weight eaten with a gram quantity (#3534)', () => {
    const payload = buildFoodEntryCopyPayload(
      { ...baseEntry, quantity: 120, unit: 'g', cooked_quantity: 300 },
      '2026-11-02',
      'lunch-id'
    );
    expect(payload.quantity).toBe(120);
    expect(payload.cooked_quantity).toBe(300);
  });

  it('sends no cooked weight when the entry has none or is not by weight', () => {
    expect(
      buildFoodEntryCopyPayload(baseEntry, '2026-11-02', 'lunch-id')
    ).not.toHaveProperty('cooked_quantity');
    expect(
      buildFoodEntryCopyPayload(
        { ...baseEntry, cooked_quantity: 300 },
        '2026-11-02',
        'lunch-id'
      )
    ).not.toHaveProperty('cooked_quantity');
  });
});
