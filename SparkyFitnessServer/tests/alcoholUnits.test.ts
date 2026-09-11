import { describe, expect, it } from 'vitest';
import {
  alcoholGramsFromAbv,
  alcoholGramsForServing,
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

  // The OpenFoodFacts import and the save-time fill-in both derive grams from
  // an ABV, and they used to disagree for a weight serving: the import treated
  // the number as millilitres, the save path refused to convert at all, so the
  // same beer came back as 3.945 g when imported and 0 g when saved by hand.
  describe('alcoholGramsForServing', () => {
    it('converts a volume serving exactly', () => {
      // 330 ml of 5% beer.
      expect(alcoholGramsForServing(330, 'ml', 5)).toBeCloseTo(13.019, 3);
      // A litre and a fluid ounce reach the same grams through the unit table.
      expect(alcoholGramsForServing(1, 'l', 5)).toBeCloseTo(39.45, 2);
    });

    it('reads a weight serving on a drink as millilitres rather than giving up', () => {
      // OpenFoodFacts publishes beverages per 100 ml but falls back to 'g'
      // when the record states no unit, which is what a real beer import does.
      expect(alcoholGramsForServing(100, 'g', 5)).toBeCloseTo(3.945, 3);
    });

    it('agrees with the raw formula, so the two derivation paths cannot drift', () => {
      expect(alcoholGramsForServing(330, 'ml', 5)).toBe(
        alcoholGramsFromAbv(330, 5)
      );
      expect(alcoholGramsForServing(100, 'g', 5)).toBe(
        alcoholGramsFromAbv(100, 5)
      );
    });

    it('converts a weight ounce through grams instead of reading it as ml', () => {
      // 'oz' is a WEIGHT ounce in the food vocabulary (28.3495 g), so a shot of
      // 40% spirits is ~28 ml of liquid, not 1. Taking the raw number as
      // millilitres understated this ~28x.
      expect(alcoholGramsForServing(1, 'oz', 40)).toBeCloseTo(
        alcoholGramsFromAbv(28.3495, 40),
        3
      );
      expect(alcoholGramsForServing(1, 'oz', 40)).toBeGreaterThan(8);
      // 'fl oz' is the volume unit and stays a straight volume conversion.
      expect(alcoholGramsForServing(1, 'fl oz', 40)).toBeCloseTo(
        alcoholGramsFromAbv(29.5735, 40),
        3
      );
    });

    it('returns 0 for a unit that carries no scale at all', () => {
      // A 'piece' or a 'serving' is not a measurement, so there is nothing
      // honest to derive -- better than silently treating the count as ml.
      expect(alcoholGramsForServing(1, 'piece', 40)).toBe(0);
      expect(alcoholGramsForServing(2, 'serving', 12)).toBe(0);
    });

    it('returns 0 for a serving size that cannot be a drink', () => {
      expect(alcoholGramsForServing(0, 'ml', 5)).toBe(0);
      expect(alcoholGramsForServing(-330, 'ml', 5)).toBe(0);
      expect(alcoholGramsForServing(Number.NaN, 'ml', 5)).toBe(0);
    });

    it('returns 0 for a drink with no alcohol in it', () => {
      expect(alcoholGramsForServing(330, 'ml', 0)).toBe(0);
    });
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
