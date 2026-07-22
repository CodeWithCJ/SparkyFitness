import { describe, expect, it } from 'vitest';
import { reconcileEntryUnitToVariant } from '../utils/foodUtils.js';

describe('reconcileEntryUnitToVariant', () => {
  it('converts an implicit serving count against a gram variant into grams', () => {
    // "1 serving" of a 174 g wrap -> 174 g, so the diary math yields the full portion
    // instead of treating "1 serving" as "1 gram".
    expect(
      reconcileEntryUnitToVariant(1, undefined, {
        serving_size: 174,
        serving_unit: 'g',
      })
    ).toEqual({ quantity: 174, unit: 'g' });
  });

  it('converts an explicit "serving" unit against a gram variant', () => {
    // 3 pieces of a 40 g baklava -> 120 g.
    expect(
      reconcileEntryUnitToVariant(3, 'serving', {
        serving_size: 40,
        serving_unit: 'g',
      })
    ).toEqual({ quantity: 120, unit: 'g' });
  });

  it('treats plural/alias serving units as servings', () => {
    expect(
      reconcileEntryUnitToVariant(2, 'servings', {
        serving_size: 50,
        serving_unit: 'g',
      })
    ).toEqual({ quantity: 100, unit: 'g' });
  });

  it('leaves a matching concrete unit untouched', () => {
    expect(
      reconcileEntryUnitToVariant(174, 'g', {
        serving_size: 174,
        serving_unit: 'g',
      })
    ).toEqual({ quantity: 174, unit: 'g' });
  });

  it('leaves a serving count against a serving-denominated variant untouched', () => {
    expect(
      reconcileEntryUnitToVariant(2, 'serving', {
        serving_size: 1,
        serving_unit: 'serving',
      })
    ).toEqual({ quantity: 2, unit: 'serving' });
  });

  it('falls back to a factor of 1 when serving_size is missing or invalid', () => {
    expect(
      reconcileEntryUnitToVariant(2, 'serving', {
        serving_size: 0,
        serving_unit: 'ml',
      })
    ).toEqual({ quantity: 2, unit: 'ml' });
  });

  it('passes a non-matching explicit unit through unchanged', () => {
    expect(
      reconcileEntryUnitToVariant(2, 'piece', {
        serving_size: 30,
        serving_unit: 'g',
      })
    ).toEqual({ quantity: 2, unit: 'piece' });
  });
});
