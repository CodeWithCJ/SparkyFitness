import { describe, expect, it } from 'vitest';
import {
  COOKED_WEIGHT_DECIMALS,
  COOKED_WEIGHT_UNITS,
  cookedYieldFactor,
  entryYieldFactor,
  isCookedWeightUnit,
  isValidCookedQuantity,
  rawQuantityFromCooked,
  roundYieldFactor,
} from '@workspace/shared';

describe('cooked weight helpers (#3534)', () => {
  it('offers the switch only for g, kg, oz and lb', () => {
    expect(COOKED_WEIGHT_UNITS).toEqual(['g', 'kg', 'oz', 'lb']);
    for (const unit of ['g', 'kg', 'oz', 'lb', ' G ', 'KG']) {
      expect(isCookedWeightUnit(unit)).toBe(true);
    }
    for (const unit of ['cup', 'piece', 'ml', 'serving', 'mg', '', null]) {
      expect(isCookedWeightUnit(unit)).toBe(false);
    }
    expect(isCookedWeightUnit(undefined)).toBe(false);
  });

  it('accepts null or a positive number as cooked_quantity', () => {
    expect(isValidCookedQuantity(null)).toBe(true);
    expect(isValidCookedQuantity(150)).toBe(true);
    expect(isValidCookedQuantity(0.5)).toBe(true);
    for (const value of [0, -1, Number.NaN, Infinity, '150', undefined, {}]) {
      expect(isValidCookedQuantity(value)).toBe(false);
    }
  });

  it('derives the batch yield from raw and cooked batch weights', () => {
    expect(cookedYieldFactor(200, 500)).toBe(2.5);
    expect(cookedYieldFactor(500, 380)).toBeCloseTo(0.76);
    expect(cookedYieldFactor(0, 500)).toBeNull();
    expect(cookedYieldFactor(200, null)).toBeNull();
  });

  it('calculates the raw portion from the cooked weight eaten, rounded to 3 decimals', () => {
    // Rice at 2.5x: 300 g cooked on the plate is 120 g raw.
    expect(rawQuantityFromCooked(300, 2.5)).toBe(120);
    // Fried chicken thigh: 174 g cooked at 0.87 is 200 g raw.
    expect(rawQuantityFromCooked(174, 0.87)).toBe(200);
    expect(rawQuantityFromCooked(100, 3)).toBe(33.333);
    expect(rawQuantityFromCooked(100, cookedYieldFactor(3, 7))).toBe(42.857);
    expect(rawQuantityFromCooked(0, 2)).toBeNull();
    expect(rawQuantityFromCooked(100, null)).toBeNull();
  });

  it('gives the same raw weight for equivalent g and kg amounts', () => {
    // Yield 2.5: 80 g cooked is 32 g raw, so 0.08 kg must be 0.032 kg.
    expect(rawQuantityFromCooked(80, 2.5)).toBe(32);
    expect(rawQuantityFromCooked(0.08, 2.5)).toBe(0.032);
    // A small kg portion must not round to nothing.
    expect(rawQuantityFromCooked(10, 2.5)).toBe(4);
    expect(rawQuantityFromCooked(0.01, 2.5)).toBe(0.004);
    expect(COOKED_WEIGHT_DECIMALS).toBe(3);
  });

  it('reads the yield back from a stored entry', () => {
    expect(entryYieldFactor({ quantity: 120, cooked_quantity: 300 })).toBe(2.5);
    expect(
      entryYieldFactor({ quantity: 120, cooked_quantity: null })
    ).toBeNull();
    expect(entryYieldFactor({ quantity: 120 })).toBeNull();
    expect(roundYieldFactor(2.4999)).toBe(2.5);
    expect(roundYieldFactor(0.756)).toBe(0.76);
  });
});
