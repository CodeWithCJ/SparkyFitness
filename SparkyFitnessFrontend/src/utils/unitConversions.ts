/**
 * Utility for converting between metric and imperial units.
 * All internal storage is in Metric (kg, cm).
 */

export const CONVERSION_FACTORS = {
  LBS_TO_KG: 0.45359237,
  KG_TO_LBS: 2.20462262,
  IN_TO_CM: 2.54,
  CM_TO_IN: 0.39370079,
  LBS_PER_STONE: 14,
  IN_PER_FOOT: 12,
};

/**
 * Weight Conversions
 */
export const kgToLbs = (kg: number): number =>
  kg * CONVERSION_FACTORS.KG_TO_LBS;
export const lbsToKg = (lbs: number): number =>
  lbs * CONVERSION_FACTORS.LBS_TO_KG;

export const kgToStonesLbs = (kg: number): { stones: number; lbs: number } => {
  const totalLbs = kgToLbs(kg);
  const stones = Math.floor(totalLbs / CONVERSION_FACTORS.LBS_PER_STONE);
  const remainingLbs = totalLbs % CONVERSION_FACTORS.LBS_PER_STONE;
  return { stones, lbs: remainingLbs };
};

export const stonesLbsToKg = (stones: number, lbs: number): number => {
  const totalLbs = stones * CONVERSION_FACTORS.LBS_PER_STONE + lbs;
  return lbsToKg(totalLbs);
};

/**
 * Height/Measurement Conversions
 */
export const cmToInches = (cm: number): number =>
  cm * CONVERSION_FACTORS.CM_TO_IN;
export const inchesToCm = (inches: number): number =>
  inches * CONVERSION_FACTORS.IN_TO_CM;

export const cmToFeetInches = (
  cm: number
): { feet: number; inches: number } => {
  const totalInches = cmToInches(cm);
  const feet = Math.floor(totalInches / CONVERSION_FACTORS.IN_PER_FOOT);
  const remainingInches = totalInches % CONVERSION_FACTORS.IN_PER_FOOT;
  return { feet, inches: remainingInches };
};

export const feetInchesToCm = (feet: number, inches: number): number => {
  const totalInches = feet * CONVERSION_FACTORS.IN_PER_FOOT + inches;
  return inchesToCm(totalInches);
};

/**
 * Formatting Utilities
 */
export const formatWeight = (
  kg: number | null | undefined,
  unit: string
): string => {
  if (kg === null || kg === undefined || isNaN(kg)) return '-';

  switch (unit) {
    case 'lbs': {
      const val = kgToLbs(kg);
      return `${Math.round(val)} lbs`;
    }
    case 'st_lbs': {
      const { stones, lbs } = kgToStonesLbs(kg);
      return `${stones}st ${Math.round(lbs)}lbs`;
    }
    case 'kg':
    default:
      return `${Number(kg.toFixed(1))} kg`;
  }
};

export const formatHeight = (
  cm: number | null | undefined,
  unit: string
): string => {
  if (cm === null || cm === undefined || isNaN(cm)) return '-';

  switch (unit) {
    case 'inches': {
      const val = cmToInches(cm);
      return `${Math.round(val)} in`;
    }
    case 'ft_in': {
      const { feet, inches } = cmToFeetInches(cm);
      return `${feet}'${Math.round(inches)}"`;
    }
    case 'cm':
    default:
      return `${Math.round(cm)} cm`;
  }
};
