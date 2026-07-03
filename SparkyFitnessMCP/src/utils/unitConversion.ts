/**
 * Unit conversion utilities for SparkyFitness.
 */

// Weight conversions
export const LBS_TO_KG = 0.45359237;
export const KG_TO_LBS = 2.20462262;

// Measurement conversions
export const INCH_TO_CM = 2.54;
export const CM_TO_INCH = 1 / 2.54;

// Energy conversions
export const KCAL_TO_KJ = 4.184;
export const KJ_TO_KCAL = 1 / 4.184;

// Distance conversions
export const MILES_TO_KM = 1.609344;
export const KM_TO_MILES = 0.62137119;

/**
 * Converts a weight value to the target unit.
 */
export function convertWeight(value: number, from: string, to: string): number {
  if (from.toLowerCase() === to.toLowerCase()) return value;
  
  if (from.toLowerCase() === "lbs" && to.toLowerCase() === "kg") {
    return value * LBS_TO_KG;
  }
  if (from.toLowerCase() === "kg" && to.toLowerCase() === "lbs") {
    return value * KG_TO_LBS;
  }
  return value;
}

/**
 * Converts a measurement value (height, neck, etc.) to the target unit.
 */
export function convertMeasurement(value: number, from: string, to: string): number {
  if (from.toLowerCase() === to.toLowerCase()) return value;
  
  if (from.toLowerCase() === "in" && to.toLowerCase() === "cm") {
    return value * INCH_TO_CM;
  }
  if (from.toLowerCase() === "cm" && to.toLowerCase() === "in") {
    return value * CM_TO_INCH;
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
  
  if ((f === "kcal" || f === "calories") && t === "kj") {
    return value * KCAL_TO_KJ;
  }
  if (f === "kj" && (t === "kcal" || t === "calories")) {
    return value * KJ_TO_KCAL;
  }
  return value;
}
