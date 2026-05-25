/**
 * Serving size unit conversion utilities for food entries.
 * Supports automatic conversion between compatible weight and volume units.
 * Cross-category conversions and quantity-style units require a manual factor.
 *
 * Canonical source for both web and mobile clients (and the AI conversion gate).
 */

/** Grams per unit for weight measurements. `lb` and `lbs` are aliases. */
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.3495,
  lb: 453.592,
  lbs: 453.592,
};

/** Millilitres per unit for volume measurements. `cup`/`cups` and `liter`/`liters` are aliases. */
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

export type UnitCategory = "weight" | "volume";

export interface StandardUnitGroup {
  label: string;
  units: string[];
}

/** Weight + volume groups used by the AI gate and the picker's standard-unit list. */
export const STANDARD_UNIT_GROUPS: StandardUnitGroup[] = [
  {
    label: "Weight",
    units: ["g", "kg", "mg", "oz", "lb", "lbs"],
  },
  {
    label: "Volume",
    units: ["ml", "l", "cup", "cups", "tbsp", "tsp"],
  },
];

/** Quantity-style units that always require a manual conversion factor. */
export const SERVING_UNIT_GROUP: StandardUnitGroup = {
  label: "Quantity",
  units: [
    "piece",
    "slice",
    "serving",
    "portion",
    "can",
    "bottle",
    "packet",
    "bag",
    "bowl",
    "plate",
    "handful",
    "scoop",
    "bar",
    "stick",
    "whole",
  ],
};

/** Standard + quantity groups in display order for the food form. Mobile-style name. */
export const FOOD_FORM_UNIT_GROUPS: StandardUnitGroup[] = [
  ...STANDARD_UNIT_GROUPS,
  SERVING_UNIT_GROUP,
];

/** All conversion units as a flat array, derived from the groups. */
export const ALL_CONVERSION_UNITS: string[] = [
  ...STANDARD_UNIT_GROUPS.flatMap((group) => group.units),
  ...SERVING_UNIT_GROUP.units,
];

/** Web-style alias for the same flat list. */
export const ALL_STANDARD_UNITS: string[] = ALL_CONVERSION_UNITS;

/** Returns the measurement category for a unit, or null if not a standard unit. */
export function getUnitCategory(unit: string): UnitCategory | null {
  const normalizedUnit = unit.toLowerCase().trim();
  if (WEIGHT_TO_GRAMS[normalizedUnit] !== undefined) return "weight";
  if (VOLUME_TO_ML[normalizedUnit] !== undefined) return "volume";
  return null;
}

/**
 * Returns the factor where: 1 targetUnit = X baseUnits.
 * Example: getConversionFactor("g", "oz") => 28.3495 (1 oz = 28.3495 g)
 *
 * Returns null if the units are incompatible (different categories or non-standard).
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

  if (fromCategory === "weight") {
    return WEIGHT_TO_GRAMS[to]! / WEIGHT_TO_GRAMS[from]!;
  }

  return VOLUME_TO_ML[to]! / VOLUME_TO_ML[from]!;
}

/** True iff two units can be automatically converted (same category). */
export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  return getConversionFactor(unitA, unitB) !== null;
}

/** Internal — used by the AI gate to enumerate convertible units without quantity units. */
export const STANDARD_UNIT_KEYS: readonly string[] = Object.freeze([
  ...Object.keys(WEIGHT_TO_GRAMS),
  ...Object.keys(VOLUME_TO_ML),
]);
