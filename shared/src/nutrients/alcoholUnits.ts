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
  { code: 'US', label: 'United States', grams: 14 },
  { code: 'UK', label: 'United Kingdom (1 unit)', grams: 8 },
  { code: 'AU', label: 'Australia', grams: 10 },
  { code: 'EU', label: 'Most of Europe', grams: 10 },
  { code: 'CA', label: 'Canada', grams: 13.45 },
  { code: 'JP', label: 'Japan', grams: 20 },
] as const;

/**
 * Calculates grams of pure ethanol from liquid volume (ml) and ABV (%).
 * Formula: volumeMl * (abvPercent / 100) * 0.789
 */
export function alcoholGramsFromAbv(volumeMl: number, abvPercent: number): number {
  if (!volumeMl || !abvPercent || volumeMl < 0 || abvPercent < 0) {
    return 0;
  }
  return Number((volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML).toFixed(3));
}

/**
 * Calculates ABV (%) from pure ethanol mass (g) and liquid volume (ml).
 * Formula: (grams / (volumeMl * 0.789)) * 100
 */
export function abvFromAlcoholGrams(grams: number, volumeMl: number): number {
  if (!grams || !volumeMl || grams < 0 || volumeMl <= 0) {
    return 0;
  }
  return Number(((grams / (volumeMl * ETHANOL_DENSITY_G_PER_ML)) * 100).toFixed(2));
}

/**
 * Calculates number of standard drinks from grams of alcohol and standard drink size in grams.
 * Formula: grams / standardDrinkGrams
 */
export function standardDrinks(
  grams: number,
  standardDrinkGrams: number = DEFAULT_STANDARD_DRINK_GRAMS
): number {
  if (!grams || grams <= 0 || !standardDrinkGrams || standardDrinkGrams <= 0) {
    return 0;
  }
  return Number((grams / standardDrinkGrams).toFixed(2));
}
