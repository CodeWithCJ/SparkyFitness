import { foodVolumeToMl } from "../utils/servingSizeConversions.ts";

export const ETHANOL_DENSITY_G_PER_ML = 0.789;
/** Exported for documentation and tooltips. NEVER used in a calorie sum. */
export const ETHANOL_KCAL_PER_G = 7;
export const DEFAULT_STANDARD_DRINK_GRAMS = 14;

export interface StandardDrinkPreset {
  code: string;
  label: string;
  grams: number;
}

export const STANDARD_DRINK_PRESETS: readonly StandardDrinkPreset[] = [
  { code: "US", label: "United States", grams: 14 },
  { code: "UK", label: "United Kingdom (1 unit)", grams: 8 },
  { code: "AU", label: "Australia", grams: 10 },
  { code: "EU", label: "Most of Europe", grams: 10 },
  { code: "CA", label: "Canada", grams: 13.45 },
  { code: "JP", label: "Japan", grams: 20 },
] as const;

/**
 * Calculates grams of pure ethanol from liquid volume (ml) and ABV (%).
 * Formula: volumeMl * (abvPercent / 100) * 0.789
 */
export function alcoholGramsFromAbv(
  volumeMl: number,
  abvPercent: number,
): number {
  if (!volumeMl || !abvPercent || volumeMl < 0 || abvPercent < 0) {
    return 0;
  }
  return Number(
    (volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML).toFixed(3),
  );
}

/**
 * Grams of ethanol in one serving of a drink of known ABV.
 *
 * A serving stated in a volume unit converts exactly. A serving stated in a
 * weight unit does not determine a volume -- but a product that reports an ABV
 * is a liquid, and a weight unit on a liquid is almost always a source that
 * omitted the unit rather than a genuine mass (OpenFoodFacts publishes
 * beverages per 100 ml but falls back to 'g' when the record states no unit).
 * Treating the number as millilitres keeps the value rather than discarding it:
 * it is within 1% for beer and wine, and about 5% high for spirits.
 *
 * Both derivation paths -- the OpenFoodFacts import and the save-time fill-in
 * for a food that carries an ABV but no grams -- must use this, or the same
 * beer gets grams when imported and zero when saved by hand.
 */
export function alcoholGramsForServing(
  servingSize: number,
  servingUnit: string,
  abvPercent: number,
): number {
  if (!Number.isFinite(servingSize) || servingSize <= 0) return 0;
  const volumeMl = foodVolumeToMl(servingSize, servingUnit) ?? servingSize;
  return alcoholGramsFromAbv(volumeMl, abvPercent);
}

/**
 * Calculates ABV (%) from pure ethanol mass (g) and liquid volume (ml).
 * Formula: (grams / (volumeMl * 0.789)) * 100
 */
export function abvFromAlcoholGrams(grams: number, volumeMl: number): number {
  if (!grams || !volumeMl || grams < 0 || volumeMl <= 0) {
    return 0;
  }
  return Number(
    ((grams / (volumeMl * ETHANOL_DENSITY_G_PER_ML)) * 100).toFixed(2),
  );
}

/**
 * Calculates number of standard drinks from grams of alcohol and standard drink size in grams.
 * Formula: grams / standardDrinkGrams
 */
export function standardDrinks(
  grams: number,
  standardDrinkGrams: number = DEFAULT_STANDARD_DRINK_GRAMS,
): number {
  if (!grams || grams <= 0 || !standardDrinkGrams || standardDrinkGrams <= 0) {
    return 0;
  }
  return Number((grams / standardDrinkGrams).toFixed(2));
}
