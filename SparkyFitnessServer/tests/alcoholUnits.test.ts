import { describe, expect, it } from 'vitest';
import {
  alcoholGramsFromAbv,
  abvFromAlcoholGrams,
  standardDrinks,
  ETHANOL_DENSITY_G_PER_ML,
  ETHANOL_KCAL_PER_G,
  DEFAULT_STANDARD_DRINK_GRAMS,
  STANDARD_DRINK_PRESETS,
} from '@workspace/shared';

describe('alcoholUnits calculations', () => {
  it('correctly calculates grams of pure ethanol from volume and ABV%', () => {
    // 355 ml standard US beer at 5% ABV
    // 355 * 0.05 * 0.789 = 14.00475 -> 14.005 g
    const grams = alcoholGramsFromAbv(355, 5);
    expect(grams).toBeCloseTo(14.005, 3);
  });

  it('correctly calculates 1 pint (568 ml) of 4.5% cider pure ethanol', () => {
    // 568 * 0.045 * 0.789 = 20.16684 -> 20.167 g
    const grams = alcoholGramsFromAbv(568, 4.5);
    expect(grams).toBeCloseTo(20.167, 2);
  });

  it('returns 0 for non-positive volume or abv', () => {
    expect(alcoholGramsFromAbv(0, 5)).toBe(0);
    expect(alcoholGramsFromAbv(355, 0)).toBe(0);
    expect(alcoholGramsFromAbv(-100, 5)).toBe(0);
  });

  it('correctly computes ABV% from grams and liquid volume', () => {
    const abv = abvFromAlcoholGrams(14.005, 355);
    expect(abv).toBeCloseTo(5.0, 1);
  });

  it('correctly converts alcohol grams to US standard drinks (14g default)', () => {
    expect(standardDrinks(14)).toBe(1.0);
    expect(standardDrinks(28)).toBe(2.0);
    expect(standardDrinks(21, DEFAULT_STANDARD_DRINK_GRAMS)).toBe(1.5);
  });

  it('correctly converts alcohol grams to UK units (8g per unit)', () => {
    expect(standardDrinks(16, 8)).toBe(2.0);
    expect(standardDrinks(20.167, 8)).toBeCloseTo(2.52, 2);
  });

  it('provides expected constants and presets', () => {
    expect(ETHANOL_DENSITY_G_PER_ML).toBe(0.789);
    expect(ETHANOL_KCAL_PER_G).toBe(7);
    expect(DEFAULT_STANDARD_DRINK_GRAMS).toBe(14);
    expect(STANDARD_DRINK_PRESETS.length).toBeGreaterThanOrEqual(5);
    const usPreset = STANDARD_DRINK_PRESETS.find((p) => p.code === 'US');
    expect(usPreset?.grams).toBe(14);
    const ukPreset = STANDARD_DRINK_PRESETS.find((p) => p.code === 'UK');
    expect(ukPreset?.grams).toBe(8);
  });
});
