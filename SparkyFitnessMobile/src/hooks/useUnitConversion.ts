import { useCallback, useMemo } from 'react';
import type { FoodUnitVariant } from '../types/foodUnitVariants';
import {
  ALL_CONVERSION_UNITS,
  getConversionFactor,
} from '../utils/servingSizeConversions';

export interface UseUnitConversionOptions {
  variants: FoodUnitVariant[];
  selectedVariant: FoodUnitVariant | null;
}

export interface UseUnitConversionResult {
  convertibleUnits: string[];
  buildConvertedVariant: (unit: string) => FoodUnitVariant | null;
  buildManualVariant: (unit: string) => FoodUnitVariant | null;
}

interface ResolvedAutoConversion {
  baseVariant: FoodUnitVariant;
  factor: number;
}

export function resolveAutoConversionSource(
  variants: FoodUnitVariant[],
  selectedVariant: FoodUnitVariant | null,
  targetUnit: string,
): ResolvedAutoConversion | null {
  const candidateVariants = selectedVariant
    ? [selectedVariant, ...variants]
    : variants;

  for (const variant of candidateVariants) {
    const factor = getConversionFactor(variant.serving_unit, targetUnit);
    if (factor !== null) {
      return {
        baseVariant: variant,
        factor,
      };
    }
  }

  return null;
}

export function canAutoConvertToUnit(
  variants: FoodUnitVariant[],
  selectedVariant: FoodUnitVariant | null,
  targetUnit: string,
): boolean {
  return (
    resolveAutoConversionSource(variants, selectedVariant, targetUnit) !== null
  );
}

export function useUnitConversion({
  variants,
  selectedVariant,
}: UseUnitConversionOptions): UseUnitConversionResult {
  const convertibleUnits = useMemo(() => {
    const existingUnits = new Set(
      variants.map((variant) => variant.serving_unit.toLowerCase()),
    );

    return ALL_CONVERSION_UNITS.filter(
      (unit) => !existingUnits.has(unit.toLowerCase()),
    );
  }, [variants]);

  const buildConvertedVariant = useCallback(
    (unit: string): FoodUnitVariant | null => {
      const trimmedUnit = unit.trim();
      if (!trimmedUnit) {
        return null;
      }

      const autoConversion = resolveAutoConversionSource(
        variants,
        selectedVariant,
        trimmedUnit,
      );
      if (!autoConversion) {
        return null;
      }

      const { baseVariant, factor } = autoConversion;

      return {
        serving_size: baseVariant.serving_size,
        serving_unit: trimmedUnit,
        calories: (baseVariant.calories || 0) * factor,
        protein: (baseVariant.protein || 0) * factor,
        carbs: (baseVariant.carbs || 0) * factor,
        fat: (baseVariant.fat || 0) * factor,
        saturated_fat: (baseVariant.saturated_fat || 0) * factor,
        polyunsaturated_fat: (baseVariant.polyunsaturated_fat || 0) * factor,
        monounsaturated_fat: (baseVariant.monounsaturated_fat || 0) * factor,
        trans_fat: (baseVariant.trans_fat || 0) * factor,
        cholesterol: (baseVariant.cholesterol || 0) * factor,
        sodium: (baseVariant.sodium || 0) * factor,
        potassium: (baseVariant.potassium || 0) * factor,
        dietary_fiber: (baseVariant.dietary_fiber || 0) * factor,
        sugars: (baseVariant.sugars || 0) * factor,
        vitamin_a: (baseVariant.vitamin_a || 0) * factor,
        vitamin_c: (baseVariant.vitamin_c || 0) * factor,
        calcium: (baseVariant.calcium || 0) * factor,
        iron: (baseVariant.iron || 0) * factor,
        glycemic_index: baseVariant.glycemic_index,
        custom_nutrients: Object.fromEntries(
          Object.entries(baseVariant.custom_nutrients || {}).map(
            ([key, value]) => [key, (Number(value) || 0) * factor],
          ),
        ),
      };
    },
    [selectedVariant, variants],
  );

  const buildManualVariant = useCallback(
    (unit: string): FoodUnitVariant | null => {
      const trimmedUnit = unit.trim();
      if (!trimmedUnit) {
        return null;
      }

      const baseVariant = selectedVariant ?? variants[0] ?? null;
      if (!baseVariant) {
        return null;
      }

      return {
        serving_size: baseVariant.serving_size,
        serving_unit: trimmedUnit,
        calories: baseVariant.calories || 0,
        protein: baseVariant.protein || 0,
        carbs: baseVariant.carbs || 0,
        fat: baseVariant.fat || 0,
        saturated_fat: baseVariant.saturated_fat || 0,
        polyunsaturated_fat: baseVariant.polyunsaturated_fat || 0,
        monounsaturated_fat: baseVariant.monounsaturated_fat || 0,
        trans_fat: baseVariant.trans_fat || 0,
        cholesterol: baseVariant.cholesterol || 0,
        sodium: baseVariant.sodium || 0,
        potassium: baseVariant.potassium || 0,
        dietary_fiber: baseVariant.dietary_fiber || 0,
        sugars: baseVariant.sugars || 0,
        vitamin_a: baseVariant.vitamin_a || 0,
        vitamin_c: baseVariant.vitamin_c || 0,
        calcium: baseVariant.calcium || 0,
        iron: baseVariant.iron || 0,
        glycemic_index: baseVariant.glycemic_index,
        custom_nutrients: baseVariant.custom_nutrients
          ? { ...baseVariant.custom_nutrients }
          : null,
      };
    },
    [selectedVariant, variants],
  );

  return {
    convertibleUnits,
    buildConvertedVariant,
    buildManualVariant,
  };
}
