/**
 * Unit conversion utilities.
 * All server-side storage is in metric (kg, cm).
 */

const LBS_TO_KG = 0.45359237;
const KG_TO_LBS = 2.20462262;

export function lbsToKg(lbs: number): number {
  return lbs * LBS_TO_KG;
}

export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS;
}

/** Convert a weight value from the user's preferred unit to kg for storage. */
export function weightToKg(value: number, unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? lbsToKg(value) : value;
}

/** Convert a weight value from kg (storage) to the user's preferred unit for display. */
export function weightFromKg(kg: number, unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? kgToLbs(kg) : kg;
}
