/**
 * Unit conversion utilities.
 * All server-side storage is in metric (kg, cm).
 */

const LBS_TO_KG = 0.45359237;
const KG_TO_LBS = 1 / LBS_TO_KG;
const LBS_PER_STONE = 14;

const KM_TO_MILES = 0.621371;
const MILES_TO_KM = 1.60934;

const INCHES_TO_CM = 2.54;
const CM_TO_INCHES = 1 / INCHES_TO_CM;
const INCHES_PER_FOOT = 12;

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

/** Split a kg value into whole stones + remaining lbs. */
export function kgToStonesLbs(kg: number): { stones: number; lbs: number } {
  const totalLbs = kgToLbs(kg);
  // Snap to the nearest whole pound when within float-precision tolerance,
  // so e.g. 6.35029 kg splits cleanly into 1st 0lb instead of 0st 13.999...lb.
  const rounded = Math.abs(totalLbs - Math.round(totalLbs)) < 1e-6
    ? Math.round(totalLbs)
    : totalLbs;
  const stones = Math.floor(rounded / LBS_PER_STONE);
  const lbs = rounded - stones * LBS_PER_STONE;
  return { stones, lbs };
}

/** Combine stones + lbs into a single kg value. */
export function stonesLbsToKg(stones: number, lbs: number): number {
  return lbsToKg(stones * LBS_PER_STONE + lbs);
}

export function kmToMiles(km: number): number {
  return km * KM_TO_MILES;
}

export function milesToKm(miles: number): number {
  return miles * MILES_TO_KM;
}

/** Convert a distance value from the user's preferred unit to km for storage. */
export function distanceToKm(value: number, unit: 'km' | 'miles'): number {
  return unit === 'miles' ? milesToKm(value) : value;
}

/** Convert a distance value from km (storage) to the user's preferred unit for display. */
export function distanceFromKm(km: number, unit: 'km' | 'miles'): number {
  return unit === 'miles' ? kmToMiles(km) : km;
}

export function cmToInches(cm: number): number {
  return cm * CM_TO_INCHES;
}

export function inchesToCm(inches: number): number {
  return inches * INCHES_TO_CM;
}

/** Convert a length value from the user's preferred unit to cm for storage. */
export function lengthToCm(value: number, unit: 'cm' | 'inches'): number {
  return unit === 'inches' ? inchesToCm(value) : value;
}

/** Convert a length value from cm (storage) to the user's preferred unit for display. */
export function lengthFromCm(cm: number, unit: 'cm' | 'inches'): number {
  return unit === 'inches' ? cmToInches(cm) : cm;
}

/** Split a cm value into whole feet + remaining inches. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cmToInches(cm);
  // Snap to the nearest whole inch when within float-precision tolerance,
  // so e.g. 152.4 cm splits cleanly into 5'0" instead of 4'11.999...".
  const rounded = Math.abs(totalInches - Math.round(totalInches)) < 1e-6
    ? Math.round(totalInches)
    : totalInches;
  const feet = Math.floor(rounded / INCHES_PER_FOOT);
  const inches = rounded - feet * INCHES_PER_FOOT;
  return { feet, inches };
}

/** Combine feet + inches into a single cm value. */
export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * INCHES_PER_FOOT + inches);
}
