import { describe, expect, it } from 'vitest';
import {
  AI_CONVERTIBLE_UNITS,
  areUnitsCompatible,
  getConversionFactor,
  getUnitCategory,
  isAiConvertibleUnit,
  shouldOfferAiConversion,
} from '@workspace/shared';

describe('shared/utils/servingSizeConversions', () => {
  describe('getUnitCategory', () => {
    it('identifies weight units (including the lbs alias)', () => {
      expect(getUnitCategory('g')).toBe('weight');
      expect(getUnitCategory('kg')).toBe('weight');
      expect(getUnitCategory('lb')).toBe('weight');
      expect(getUnitCategory('lbs')).toBe('weight');
      expect(getUnitCategory('OZ')).toBe('weight'); // case-insensitive
    });

    it('identifies volume units (including the cups alias)', () => {
      expect(getUnitCategory('ml')).toBe('volume');
      expect(getUnitCategory('l')).toBe('volume');
      expect(getUnitCategory('cup')).toBe('volume');
      expect(getUnitCategory('cups')).toBe('volume');
      expect(getUnitCategory('tbsp')).toBe('volume');
    });

    it('returns null for quantity units', () => {
      expect(getUnitCategory('piece')).toBeNull();
      expect(getUnitCategory('scoop')).toBeNull();
      expect(getUnitCategory('portion')).toBeNull();
      expect(getUnitCategory('whole')).toBeNull();
    });
  });

  describe('getConversionFactor + areUnitsCompatible', () => {
    // Reminder: getConversionFactor(base, target) returns the factor where
    // 1 target = X base. So (g, oz) means "1 oz = 28.35 g".
    it('converts between compatible weight units', () => {
      expect(getConversionFactor('g', 'oz')).toBeCloseTo(28.3495); // 1 oz = 28.35 g
      expect(getConversionFactor('kg', 'g')).toBeCloseTo(0.001); // 1 g = 0.001 kg
      expect(getConversionFactor('g', 'lb')).toBeCloseTo(453.592); // 1 lb = 453.59 g
      expect(getConversionFactor('g', 'lbs')).toBeCloseTo(453.592); // alias preserved
    });

    it('converts between compatible volume units', () => {
      expect(getConversionFactor('ml', 'cup')).toBeCloseTo(236.588);
      expect(getConversionFactor('cups', 'ml')).toBeCloseTo(1 / 236.588);
      expect(getConversionFactor('tbsp', 'tsp')).toBeCloseTo(1 / 3, 2);
    });

    it('returns null for cross-category (weight ↔ volume)', () => {
      expect(getConversionFactor('cup', 'g')).toBeNull();
      expect(getConversionFactor('oz', 'ml')).toBeNull();
    });

    it('returns null when either unit is non-standard (quantity)', () => {
      expect(getConversionFactor('piece', 'g')).toBeNull();
      expect(getConversionFactor('g', 'piece')).toBeNull();
    });

    it('areUnitsCompatible mirrors getConversionFactor', () => {
      expect(areUnitsCompatible('g', 'kg')).toBe(true);
      expect(areUnitsCompatible('cup', 'g')).toBe(false);
      expect(areUnitsCompatible('piece', 'g')).toBe(false);
    });
  });
});

describe('shared/ai/unitConversion', () => {
  it('AI_CONVERTIBLE_UNITS contains every standard weight + volume unit', () => {
    expect(AI_CONVERTIBLE_UNITS).toEqual(
      expect.arrayContaining(['g', 'kg', 'mg', 'oz', 'lb', 'lbs'])
    );
    expect(AI_CONVERTIBLE_UNITS).toEqual(
      expect.arrayContaining(['ml', 'l', 'cup', 'cups', 'tbsp', 'tsp'])
    );
  });

  describe('isAiConvertibleUnit', () => {
    it('is true for standard weight + volume units', () => {
      expect(isAiConvertibleUnit('g')).toBe(true);
      expect(isAiConvertibleUnit('lb')).toBe(true);
      expect(isAiConvertibleUnit('lbs')).toBe(true);
      expect(isAiConvertibleUnit('cup')).toBe(true);
      expect(isAiConvertibleUnit('cups')).toBe(true);
    });

    it('is false for quantity units', () => {
      expect(isAiConvertibleUnit('piece')).toBe(false);
      expect(isAiConvertibleUnit('slice')).toBe(false);
      expect(isAiConvertibleUnit('scoop')).toBe(false);
      expect(isAiConvertibleUnit('bar')).toBe(false);
      expect(isAiConvertibleUnit('portion')).toBe(false);
      expect(isAiConvertibleUnit('whole')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isAiConvertibleUnit('CUP')).toBe(true);
      expect(isAiConvertibleUnit(' G ')).toBe(true);
    });
  });

  describe('shouldOfferAiConversion', () => {
    it('cup → g returns true (cross-category, both AI-convertible)', () => {
      expect(shouldOfferAiConversion('cup', 'g')).toBe(true);
    });

    it('cups → g returns true (alias preserved)', () => {
      expect(shouldOfferAiConversion('cups', 'g')).toBe(true);
    });

    it('oz → ml returns true (cross-category)', () => {
      expect(shouldOfferAiConversion('oz', 'ml')).toBe(true);
    });

    it('g → kg returns false (compatible, math handles)', () => {
      expect(shouldOfferAiConversion('g', 'kg')).toBe(false);
    });

    it('tbsp → tsp returns false (compatible volumes)', () => {
      expect(shouldOfferAiConversion('tbsp', 'tsp')).toBe(false);
    });

    it('piece → g returns false (quantity unit, manual factor)', () => {
      expect(shouldOfferAiConversion('piece', 'g')).toBe(false);
    });

    it('g → piece returns false (quantity unit on either side)', () => {
      expect(shouldOfferAiConversion('g', 'piece')).toBe(false);
    });
  });
});
