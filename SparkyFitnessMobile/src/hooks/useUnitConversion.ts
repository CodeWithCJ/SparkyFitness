import { useCallback, useMemo } from 'react';
import type { FoodUnitVariant } from '../types/foodUnitVariants';
import {
  ALL_CONVERSION_UNITS,
  getConversionFactor,
  type AiConfidence,
} from '@workspace/shared';

/** AI estimate payload, retained for callers that already typed against it.
 *  AI estimation lives in FoodForm now — this hook no longer builds AI
 *  variants directly. */
export interface AiEstimateData {
  estimatedAmount: number;
  confidence: AiConfidence;
}

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
  // Iterate every variant on the food and use the FIRST non-AI math source
  // we find as the conversion donor. The currently-selected variant has no
  // special priority — even if the selection is AI-sourced (cup AI), a
  // sibling manual variant (g default) is still a valid donor for compatible
  // target units (kg, oz, lb). This keeps green checkmarks visible on
  // weight units when the user is viewing an AI volume variant, matching
  // web's cross-row donor behavior.
  const candidateVariants = selectedVariant
    ? [selectedVariant, ...variants]
    : variants;

  for (const variant of candidateVariants) {
    if (variant.source === 'ai_estimate') {
      continue;
    }
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
      const ratio =
        baseVariant.serving_size > 0
          ? factor / baseVariant.serving_size
          : 0;

      return {
        serving_size: 1,
        serving_unit: trimmedUnit,
        calories: (baseVariant.calories || 0) * ratio,
        protein: (baseVariant.protein || 0) * ratio,
        carbs: (baseVariant.carbs || 0) * ratio,
        fat: (baseVariant.fat || 0) * ratio,
        saturated_fat: (baseVariant.saturated_fat || 0) * ratio,
        polyunsaturated_fat: (baseVariant.polyunsaturated_fat || 0) * ratio,
        monounsaturated_fat: (baseVariant.monounsaturated_fat || 0) * ratio,
        trans_fat: (baseVariant.trans_fat || 0) * ratio,
        cholesterol: (baseVariant.cholesterol || 0) * ratio,
        sodium: (baseVariant.sodium || 0) * ratio,
        potassium: (baseVariant.potassium || 0) * ratio,
        dietary_fiber: (baseVariant.dietary_fiber || 0) * ratio,
        sugars: (baseVariant.sugars || 0) * ratio,
        vitamin_a: (baseVariant.vitamin_a || 0) * ratio,
        vitamin_c: (baseVariant.vitamin_c || 0) * ratio,
        calcium: (baseVariant.calcium || 0) * ratio,
        iron: (baseVariant.iron || 0) * ratio,
        glycemic_index: baseVariant.glycemic_index,
        custom_nutrients: Object.fromEntries(
          Object.entries(baseVariant.custom_nutrients || {}).map(
            ([key, value]) => [key, (Number(value) || 0) * ratio],
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
