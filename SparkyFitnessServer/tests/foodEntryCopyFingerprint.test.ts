import { describe, expect, it } from 'vitest';
import {
  foodEntryCopyFingerprint,
  hasExactReviewedFoodEntrySnapshot,
} from '@workspace/shared';

describe('foodEntryCopyFingerprint', () => {
  it('normalizes database numeric strings and custom nutrient key order', () => {
    const left = foodEntryCopyFingerprint({
      quantity: '150',
      serving_size: '100',
      food_name: 'Pasta',
      custom_nutrients: { Zinc: 2, magnesium: '12' },
    });
    const right = foodEntryCopyFingerprint({
      quantity: 150,
      serving_size: 100,
      food_name: 'Pasta',
      custom_nutrients: { magnesium: '12', Zinc: 2 },
    });

    expect(left).toBe(right);
    expect(left).toContain('"custom_nutrients":{"Zinc":2,"magnesium":"12"}');
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

  it('rejects duplicate reviewed or source IDs in an exact snapshot', () => {
    const source = [
      { id: 'entry-a', quantity: 100 },
      { id: 'entry-b', quantity: 200 },
    ];
    const reviewed = source.map((entry) => ({
      entryId: entry.id,
      sourceFingerprint: foodEntryCopyFingerprint(entry),
    }));

    expect(hasExactReviewedFoodEntrySnapshot(source, reviewed)).toBe(true);
    expect(
      hasExactReviewedFoodEntrySnapshot(source, [reviewed[0], reviewed[0]])
    ).toBe(false);
    expect(
      hasExactReviewedFoodEntrySnapshot([source[0], source[0]], reviewed)
    ).toBe(false);
  });
});
