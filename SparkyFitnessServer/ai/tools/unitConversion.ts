/**
 * Unit conversion utilities for chatbot tool handlers.
 */

// Weight conversions
export const LBS_TO_KG = 0.45359237;
export const KG_TO_LBS = 2.20462262;
export const G_PER_KG = 1000;

// Measurement conversions
export const INCH_TO_CM = 2.54;
export const CM_TO_INCH = 1 / 2.54;
export const FT_TO_CM = 30.48;

// Energy conversions
export const KCAL_TO_KJ = 4.184;
export const KJ_TO_KCAL = 1 / 4.184;

// Distance conversions
export const MILES_TO_KM = 1.609344;
export const KM_TO_MILES = 0.62137119;

// The published schemas accept alias spellings (`lb`, `inch`); fold them onto
// the canonical unit names before branching.
function normalizeWeightUnit(unit: string): string {
  const u = unit.toLowerCase();
  return u === 'lb' ? 'lbs' : u;
}

function normalizeMeasurementUnit(unit: string): string {
  const u = unit.toLowerCase();
  return u === 'inch' ? 'in' : u;
}

/**
 * Converts a weight value to the target unit.
 */
export function convertWeight(value: number, from: string, to: string): number {
  const f = normalizeWeightUnit(from);
  const t = normalizeWeightUnit(to);
  if (f === t) return value;

  if (f === 'lbs' && t === 'kg') {
    return value * LBS_TO_KG;
  }
  if (f === 'kg' && t === 'lbs') {
    return value * KG_TO_LBS;
  }
  if (f === 'g' && t === 'kg') {
    return value / G_PER_KG;
  }
  return value;
}

/**
 * Converts a measurement value (height, neck, etc.) to the target unit.
 */
export function convertMeasurement(
  value: number,
  from: string,
  to: string
): number {
  const f = normalizeMeasurementUnit(from);
  const t = normalizeMeasurementUnit(to);
  if (f === t) return value;

  if (f === 'in' && t === 'cm') {
    return value * INCH_TO_CM;
  }
  if (f === 'cm' && t === 'in') {
    return value * CM_TO_INCH;
  }
  if (f === 'ft' && t === 'cm') {
    return value * FT_TO_CM;
  }
  return value;
}

/**
 * Converts energy values (calories/joules).
 */
export function convertEnergy(value: number, from: string, to: string): number {
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  if (f === t) return value;

  if ((f === 'kcal' || f === 'calories') && t === 'kj') {
    return value * KCAL_TO_KJ;
  }
  if (f === 'kj' && (t === 'kcal' || t === 'calories')) {
    return value * KJ_TO_KCAL;
  }
  return value;
}
