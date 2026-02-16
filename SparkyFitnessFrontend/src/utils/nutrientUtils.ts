import {
  CENTRAL_NUTRIENT_CONFIG,
  NutrientMetadata,
} from '@/constants/nutrients';
import { UserCustomNutrient } from '@/types/customNutrient';

/**
 * Retrieves metadata for a nutrient, merging standard config and custom nutrients.
 */
export const getNutrientMetadata = (
  key: string,
  customNutrients: UserCustomNutrient[] = []
): NutrientMetadata => {
  // Check standard config first
  if (CENTRAL_NUTRIENT_CONFIG[key]) {
    return CENTRAL_NUTRIENT_CONFIG[key];
  }

  // Check custom nutrients
  const custom = customNutrients.find((cn) => cn.name === key);
  if (custom) {
    return {
      id: custom.name,
      label: custom.name,
      defaultLabel: custom.name,
      unit: custom.unit,
      color: 'text-indigo-500', // Default color for custom nutrients
      decimals: 1, // Default decimals for custom nutrients
      group: 'custom',
    };
  }

  // Fallback
  return {
    id: key,
    label: key,
    defaultLabel: key,
    unit: '',
    color: 'text-gray-500',
    decimals: 1,
    group: 'custom',
  };
};

/**
 * Formats a nutrient value based on its central configuration.
 * Gracefully handles non-numeric inputs by attempting to parse them.
 */
export const formatNutrientValue = (
  key: string,
  value: string | number | null | undefined,
  customNutrients: UserCustomNutrient[] = []
): string => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  // Handle potential string/varchar values (addressing User concern)
  let numValue: number;
  if (typeof value === 'number') {
    numValue = value;
  } else {
    numValue = parseFloat(String(value));
    if (isNaN(numValue)) return '0';
  }

  const { decimals } = getNutrientMetadata(key, customNutrients);
  return numValue.toFixed(decimals);
};

/**
 * Returns a rounded number instead of a string.
 */
export const getRoundedNutrientValue = (
  key: string,
  value: string | number | null | undefined,
  customNutrients: UserCustomNutrient[] = []
): number => {
  const formatted = formatNutrientValue(key, value, customNutrients);
  return formatted === '' ? 0 : parseFloat(formatted);
};
