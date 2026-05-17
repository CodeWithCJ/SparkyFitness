/**
 * Serving size unit conversion utilities for food entries.
 * Supports automatic conversion between compatible weight and volume units.
 * Cross-category conversions and quantity-style units require a manual factor.
 */

/** Grams per unit for weight measurements. */
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.3495,
  lb: 453.592,
  lbs: 453.592,
};

/** Millilitres per unit for volume measurements. */
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

export const STANDARD_UNIT_GROUPS: StandardUnitGroup[] = [
  {
    label: 'Weight',
    units: ['g', 'kg', 'mg', 'oz', 'lb'],
  },
  {
    label: 'Volume',
    units: ['ml', 'l', 'cup', 'tbsp', 'tsp'],
  },
];

export const SERVING_UNIT_GROUP: StandardUnitGroup = {
  label: 'Quantity',
  units: [
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
    'whole',
  ],
};

export const FOOD_FORM_UNIT_GROUPS: StandardUnitGroup[] = [
  ...STANDARD_UNIT_GROUPS,
  SERVING_UNIT_GROUP,
];

export const ALL_CONVERSION_UNITS: string[] = [
  ...STANDARD_UNIT_GROUPS.flatMap((group) => group.units),
  ...SERVING_UNIT_GROUP.units,
];

/** Returns the measurement category for a unit, or null if not a standard unit. */
export function getUnitCategory(unit: string): UnitCategory | null {
  const normalizedUnit = unit.toLowerCase().trim();
  if (WEIGHT_TO_GRAMS[normalizedUnit] !== undefined) return 'weight';
  if (VOLUME_TO_ML[normalizedUnit] !== undefined) return 'volume';
  return null;
}

/**
 * Returns the factor where: 1 targetUnit = X baseUnits.
 * Example: getConversionFactor('g', 'oz') => 28.3495 (1 oz = 28.3495 g)
 */
export function getConversionFactor(
  baseUnit: string,
  targetUnit: string,
): number | null {
  const from = baseUnit.toLowerCase().trim();
  const to = targetUnit.toLowerCase().trim();

  if (from === to) return 1;

  const fromCategory = getUnitCategory(from);
  const toCategory = getUnitCategory(to);

  if (!fromCategory || !toCategory || fromCategory !== toCategory) {
    return null;
  }

  if (fromCategory === 'weight') {
    return WEIGHT_TO_GRAMS[to]! / WEIGHT_TO_GRAMS[from]!;
  }

  return VOLUME_TO_ML[to]! / VOLUME_TO_ML[from]!;
}

export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  return getConversionFactor(unitA, unitB) !== null;
}
