import { describe, expect, it } from 'vitest';
import { foodEntryCopyFingerprint } from '@workspace/shared';

describe('foodEntryCopyFingerprint', () => {
  it('normalizes database numeric strings and custom nutrient key order', () => {
    const left = foodEntryCopyFingerprint({
      quantity: '150',
      serving_size: '100',
      food_name: 'Pasta',
      custom_nutrients: { zinc: 2, magnesium: '12' },
    });
    const right = foodEntryCopyFingerprint({
      quantity: 150,
      serving_size: 100,
      food_name: 'Pasta',
      custom_nutrients: { magnesium: '12', zinc: 2 },
    });

    expect(left).toBe(right);
  });

  it.each([
    ['name', { food_name: 'Changed' }],
    ['meal type', { meal_type_id: 'dinner-id' }],
    ['unit', { unit: 'oz' }],
    ['serving size', { serving_size: 90 }],
    ['nutrition', { calories: 250 }],
  ])('changes when reviewed %s changes', (_field, change) => {
    const original = {
      quantity: 150,
      unit: 'g',
      serving_size: 100,
      calories: 180,
      food_name: 'Pasta',
    };
    expect(foodEntryCopyFingerprint({ ...original, ...change })).not.toBe(
      foodEntryCopyFingerprint(original)
    );
  });
});
