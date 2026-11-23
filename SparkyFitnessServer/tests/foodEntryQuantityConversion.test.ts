import { describe, expect, it } from 'vitest';
import { convertEntryQuantity } from '../utils/foodEntryQuantityConversion.js';

describe('convertEntryQuantity', () => {
  it('leaves the quantity alone when the unit is unchanged', () => {
    // Same grams eaten, whatever the new serving size is.
    expect(convertEntryQuantity(150, 100, 'g', 30, 'g')).toBeNull();
  });

  it('converts between weight units', () => {
    expect(convertEntryQuantity(150, 100, 'g', 1, 'oz')).toBe(5.2911);
    expect(convertEntryQuantity(2, 1, 'oz', 100, 'g')).toBe(56.699);
  });

  it('converts between volume units', () => {
    expect(convertEntryQuantity(1, 1, 'cup', 250, 'ml')).toBe(236.588);
  });

  it('keeps the number of servings when units cannot be converted', () => {
    // 150 g of a 100 g serving is 1.5 servings, now 1.5 slices.
    expect(convertEntryQuantity(150, 100, 'g', 1, 'slice')).toBe(1.5);
    // Weight to volume needs a density, which is unknown.
    expect(convertEntryQuantity(200, 100, 'g', 250, 'ml')).toBe(500);
  });

  it('leaves the quantity alone when the old serving is unknown', () => {
    expect(convertEntryQuantity(3, null, 'piece', 100, 'g')).toBeNull();
    expect(convertEntryQuantity(3, 0, 'piece', 100, 'g')).toBeNull();
  });
});
