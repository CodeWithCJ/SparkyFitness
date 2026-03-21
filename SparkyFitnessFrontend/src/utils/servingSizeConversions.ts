/**
 * Serving size unit conversion utilities for food entries.
 * Supports automatic conversion between compatible units (weight-to-weight, volume-to-volume).
 * Cross-category conversions (weight-to-volume) require a manual density factor.
 */

/** Grams per unit for weight measurements */
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.3495,
  lb: 453.592,
  lbs: 453.592,
};

/** Millilitres per unit for volume measurements */
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  cup: 236.588,
  cups: 236.588,
  tbsp: 14.7868,
  tsp: 4.92892,
};

export type UnitCategory = 'weight' | 'volume';

export interface StandardUnitGroup {
  label: string;
  units: string[];
}

/** All standard unit groups for display in UI */
export const STANDARD_UNIT_GROUPS: StandardUnitGroup[] = [
  {
    label: 'Weight',
    units: ['g', 'kg', 'mg', 'oz', 'lb', 'lbs'],
  },
  {
    label: 'Volume',
    units: ['ml', 'l', 'cup', 'cups', 'tbsp', 'tsp'],
  },
];

/** Common serving size units that require manual conversion factors */
export const SERVING_UNIT_GROUP: StandardUnitGroup = {
  label: 'Common',
  units: [
    'piece',
    'slice',
    'serving',
    'can',
    'bottle',
    'packet',
    'bag',
    'bowl',
    'plate',
    'handful',
    'scoop',
    'bar',
    'stick',
  ],
};

/** All standard units as a flat array */
export const ALL_STANDARD_UNITS: string[] = [
  ...STANDARD_UNIT_GROUPS.flatMap((g) => g.units),
  ...SERVING_UNIT_GROUP.units,
];

/**
 * All conversion units in display order (no grouping).
 * Matches the order used in the custom food form.
 */
export const ALL_CONVERSION_UNITS: string[] = [
  'g',
  'kg',
  'mg',
  'oz',
  'lb',
  'ml',
  'l',
  'cup',
  'tbsp',
  'tsp',
  'piece',
  'slice',
  'serving',
  'portion',
  'can',
  'bottle',
  'packet',
  'bag',
  'bowl',
  'plate',
  'handful',
  'scoop',
  'bar',
  'stick',
];

/** Returns the measurement category for a unit, or null if not a standard unit */
export function getUnitCategory(unit: string): UnitCategory | null {
  const u = unit.toLowerCase().trim();
  if (WEIGHT_TO_GRAMS[u] !== undefined) return 'weight';
  if (VOLUME_TO_ML[u] !== undefined) return 'volume';
  return null;
}

/**
 * Returns the conversion factor where: 1 targetUnit = X baseUnits
 * e.g. getConversionFactor('g', 'oz') → 28.3495 (1 oz = 28.3495 g)
 *
 * Returns null if the units are incompatible (different categories or non-standard).
 */
export function getConversionFactor(
  baseUnit: string,
  targetUnit: string
): number | null {
  const from = baseUnit.toLowerCase().trim();
  const to = targetUnit.toLowerCase().trim();

  if (from === to) return 1;

  const fromCategory = getUnitCategory(from);
  const toCategory = getUnitCategory(to);

  if (!fromCategory || !toCategory || fromCategory !== toCategory) return null;

  if (fromCategory === 'weight') {
    // 1 targetUnit = (WEIGHT_TO_GRAMS[to] / WEIGHT_TO_GRAMS[from]) fromUnits
    return WEIGHT_TO_GRAMS[to]! / WEIGHT_TO_GRAMS[from]!;
  }

  // volume
  return VOLUME_TO_ML[to]! / VOLUME_TO_ML[from]!;
}

/** Returns true if two units can be automatically converted */
export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  return getConversionFactor(unitA, unitB) !== null;
}
