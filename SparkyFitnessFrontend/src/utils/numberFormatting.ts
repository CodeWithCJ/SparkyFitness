import {
  formatWeight as formatWeightInternal,
  formatHeight as formatHeightInternal,
} from './unitConversions';

export const formatNumber = (num: number): string => {
  if (num < 1000) {
    return num.toString();
  }
  if (num < 1000000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return (num / 1000000).toFixed(1) + 'M';
};

/**
 * Formats a weight value (in kg) based on the user's preferred unit.
 */
export const formatWeight = (
  kg: number | null | undefined,
  unit: string = 'kg'
): string => {
  return formatWeightInternal(kg, unit);
};

/**
 * Formats a height value (in cm) based on the user's preferred unit.
 */
export const formatHeight = (
  cm: number | null | undefined,
  unit: string = 'cm'
): string => {
  return formatHeightInternal(cm, unit);
};
