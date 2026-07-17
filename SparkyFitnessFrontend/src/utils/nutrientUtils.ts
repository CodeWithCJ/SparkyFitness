import {
  CENTRAL_NUTRIENT_CONFIG,
  NutrientMetadata,
  NutrientGoalType,
} from '@/constants/nutrients';
import { UserCustomNutrient } from '@/types/customNutrient';

export interface NutrientGoalOverride {
  goalType: NutrientGoalType;
  targetMin?: number | null;
  targetMax?: number | null;
}
export type NutrientGoalOverrideMap = Record<string, NutrientGoalOverride>;

export interface ResolvedNutrientMetadata extends NutrientMetadata {
  goalType: NutrientGoalType;
  targetMin?: number;
  targetMax?: number;
}

function resolveGoalType(
  key: string,
  base: NutrientMetadata,
  goalOverrides?: NutrientGoalOverrideMap
): Pick<ResolvedNutrientMetadata, 'goalType' | 'targetMin' | 'targetMax'> {
  const override = goalOverrides?.[key];
  if (override) {
    return {
      goalType: override.goalType,
      targetMin: override.targetMin ?? undefined,
      targetMax: override.targetMax ?? undefined,
    };
  }
  return { goalType: base.defaultGoalType ?? 'minimum' };
}

/**
 * Retrieves metadata for a nutrient, merging standard config and custom nutrients.
 * `goalOverrides` (from useNutrientGoalPreferences) resolves the effective
 * goal direction (minimum/maximum/target); omitted nutrients fall back to the
 * nutrient's built-in `defaultGoalType` ('minimum' if unset).
 */
export const getNutrientMetadata = (
  key: string,
  customNutrients: UserCustomNutrient[] = [],
  goalOverrides?: NutrientGoalOverrideMap
): ResolvedNutrientMetadata => {
  // Check standard config first
  if (CENTRAL_NUTRIENT_CONFIG[key]) {
    const base = CENTRAL_NUTRIENT_CONFIG[key];
    return { ...base, ...resolveGoalType(key, base, goalOverrides) };
  }

  // Check custom nutrients
  const custom = customNutrients.find((cn) => cn.name === key);
  if (custom) {
    const base: NutrientMetadata = {
      id: custom.name,
      label: custom.name,
      defaultLabel: custom.name,
      unit: custom.unit,
      color: 'text-indigo-500', // Default color for custom nutrients
      chartColor: '#6366f1', // indigo-500 for custom nutrient charts
      decimals: 1, // Default decimals for custom nutrients
      group: 'custom',
    };
    return { ...base, ...resolveGoalType(key, base, goalOverrides) };
  }

  // Fallback
  const base: NutrientMetadata = {
    id: key,
    label: key,
    defaultLabel: key,
    unit: '',
    color: 'text-gray-500',
    chartColor: '#6b7280', // gray-500 for unknown nutrient charts
    decimals: 1,
    group: 'custom',
  };
  return { ...base, ...resolveGoalType(key, base, goalOverrides) };
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

export const getNetCarbsValue = (
  carbs: string | number | null | undefined,
  dietaryFiber: string | number | null | undefined
): number => {
  const carbsValue = Number(carbs) || 0;
  const fiberValue = Number(dietaryFiber) || 0;
  return Math.max(0, carbsValue - fiberValue);
};

/**
 * Returns a shallow-cloned array where each row's `carbs` field is
 * substituted with `max(0, carbs - dietary_fiber)` when `showNetCarbs`
 * is true. When false, returns the original array unchanged.
 *
 * Use this to make existing per-nutrient iterations transparently
 * honor the Show Net Carbs preference without per-call-site branching.
 */
export const withNetCarbsSubstitution = <
  T extends { carbs?: number | null; dietary_fiber?: number | null },
>(
  rows: T[],
  showNetCarbs: boolean
): T[] => {
  if (!showNetCarbs) return rows;
  return rows.map((row) => ({
    ...row,
    carbs: getNetCarbsValue(row.carbs, row.dietary_fiber),
  }));
};
