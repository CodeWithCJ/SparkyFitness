import { useState, useMemo, useCallback } from 'react';
import type { FoodVariant } from '@/types/food';
import {
  ALL_CONVERSION_UNITS,
  getConversionFactor,
  type AiConfidence,
} from '@workspace/shared';

/** AI estimate accepted by the user — drives both the conversion factor and the
 *  provenance metadata stamped onto the variant POST body. */
export interface AiEstimateData {
  estimatedAmount: number;
  confidence: AiConfidence;
}

export interface UseUnitConversionOptions {
  variants: FoodVariant[];
  selectedVariant: FoodVariant | null;
  /** Called when the user selects an existing variant from the dropdown. */
  onVariantSelect: (variantId: string, variant: FoodVariant) => void;
}

export interface UseUnitConversionResult {
  // State
  pendingUnit: string;
  setPendingUnit: (unit: string) => void;
  pendingUnitIsCustom: boolean;
  conversionFactor: number | '';
  setConversionFactor: (factor: number | '') => void;
  autoConversionFactor: number | null;
  conversionBaseVariant: FoodVariant | null;
  conversionError: string;
  setConversionError: (error: string) => void;
  aiEstimateData: AiEstimateData | null;
  /** Accept (non-null) auto-fills `conversionFactor` with the estimated amount.
   *  Clearing to null leaves the factor alone so the user can edit from that
   *  value (the "Edit" affordance in `<AiEstimateSection />`). */
  setAiEstimateData: (data: AiEstimateData | null) => void;
  // Derived
  isConverting: boolean;
  convertibleUnits: string[];
  dropdownValue: string;
  // Actions
  buildConvertedVariant: () => FoodVariant | null;
  handleUnitChange: (value: string) => void;
  cancelConversion: () => void;
  resetConversionState: () => void;
}

interface ResolvedAutoConversion {
  baseVariant: FoodVariant;
  factor: number;
}

function getManualConversionBaseVariant(
  variants: FoodVariant[],
  selectedVariant: FoodVariant | null
): FoodVariant | null {
  return selectedVariant || variants[0] || null;
}

export function resolveAutoConversionSource(
  variants: FoodVariant[],
  selectedVariant: FoodVariant | null,
  targetUnit: string
): ResolvedAutoConversion | null {
  if (selectedVariant?.source === 'ai_estimate') {
    return null;
  }

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
  variants: FoodVariant[],
  selectedVariant: FoodVariant | null,
  targetUnit: string
): boolean {
  return (
    resolveAutoConversionSource(variants, selectedVariant, targetUnit) !== null
  );
}

export function useUnitConversion({
  variants,
  selectedVariant,
  onVariantSelect,
}: UseUnitConversionOptions): UseUnitConversionResult {
  const [pendingUnit, setPendingUnit] = useState('');
  const [pendingUnitIsCustom, setPendingUnitIsCustom] = useState(false);
  const [conversionFactor, setConversionFactor] = useState<number | ''>('');
  const [autoConversionFactor, setAutoConversionFactor] = useState<
    number | null
  >(null);
  const [conversionBaseVariant, setConversionBaseVariant] =
    useState<FoodVariant | null>(null);
  const [conversionError, setConversionError] = useState('');
  const [aiEstimateData, setAiEstimateDataState] =
    useState<AiEstimateData | null>(null);

  const setAiEstimateData = useCallback((data: AiEstimateData | null) => {
    setAiEstimateDataState(data);
    if (data !== null) {
      // Accepting an estimate fills the factor input so submit math Just Works.
      setConversionFactor(data.estimatedAmount);
    }
    // Clearing (Edit) intentionally leaves conversionFactor alone — the user
    // wants to take the AI value as a starting point and tweak it manually.
  }, []);

  const isConverting = !!(pendingUnit || pendingUnitIsCustom);

  const convertibleUnits = useMemo(() => {
    const existingUnits = new Set(
      variants.map((v) => v.serving_unit.toLowerCase())
    );
    return ALL_CONVERSION_UNITS.filter(
      (u) => !existingUnits.has(u.toLowerCase())
    );
  }, [variants]);

  const dropdownValue = pendingUnitIsCustom
    ? '__custom__'
    : pendingUnit || selectedVariant?.id || '';

  const buildConvertedVariant = useCallback((): FoodVariant | null => {
    const base = conversionBaseVariant;
    const effectiveFactor =
      autoConversionFactor !== null
        ? autoConversionFactor
        : typeof conversionFactor === 'number'
          ? conversionFactor > 0
            ? conversionFactor
            : null
          : null;
    if (!base || effectiveFactor === null || !pendingUnit.trim()) return null;
    const ratio = effectiveFactor / base.serving_size;
    const variant: FoodVariant = {
      serving_size: 1,
      serving_unit: pendingUnit.trim(),
      calories: (base.calories || 0) * ratio,
      protein: (base.protein || 0) * ratio,
      carbs: (base.carbs || 0) * ratio,
      fat: (base.fat || 0) * ratio,
      saturated_fat: (base.saturated_fat || 0) * ratio,
      polyunsaturated_fat: (base.polyunsaturated_fat || 0) * ratio,
      monounsaturated_fat: (base.monounsaturated_fat || 0) * ratio,
      trans_fat: (base.trans_fat || 0) * ratio,
      cholesterol: (base.cholesterol || 0) * ratio,
      sodium: (base.sodium || 0) * ratio,
      potassium: (base.potassium || 0) * ratio,
      dietary_fiber: (base.dietary_fiber || 0) * ratio,
      sugars: (base.sugars || 0) * ratio,
      vitamin_a: (base.vitamin_a || 0) * ratio,
      vitamin_c: (base.vitamin_c || 0) * ratio,
      calcium: (base.calcium || 0) * ratio,
      iron: (base.iron || 0) * ratio,
      custom_nutrients: Object.fromEntries(
        Object.entries(base.custom_nutrients || {}).map(([k, v]) => [
          k,
          (Number(v) || 0) * ratio,
        ])
      ),
    };
    // Stamp AI provenance when the user accepted an AI estimate. Manual flows
    // omit these fields and the server defaults source = 'manual'.
    if (aiEstimateData) {
      variant.source = 'ai_estimate';
      variant.ai_confidence = aiEstimateData.confidence;
    }
    return variant;
  }, [
    conversionBaseVariant,
    conversionFactor,
    autoConversionFactor,
    pendingUnit,
    aiEstimateData,
  ]);

  const handleUnitChange = useCallback(
    (value: string) => {
      if (value === '__custom__') {
        setConversionBaseVariant(selectedVariant || variants[0] || null);
        setPendingUnitIsCustom(true);
        setPendingUnit('');
        setAutoConversionFactor(null);
        setConversionFactor('');
        setConversionError('');
        setAiEstimateDataState(null);
        return;
      }

      const variant = variants.find((v) => v.id === value);
      if (variant) {
        onVariantSelect(value, variant);
        setPendingUnit('');
        setPendingUnitIsCustom(false);
        setConversionFactor('');
        setAutoConversionFactor(null);
        setConversionBaseVariant(null);
        setConversionError('');
        setAiEstimateDataState(null);
        return;
      }

      // Standard unit for conversion
      const manualBase = getManualConversionBaseVariant(
        variants,
        selectedVariant
      );
      const autoConversion = resolveAutoConversionSource(
        variants,
        selectedVariant,
        value
      );

      setPendingUnit(value);
      setPendingUnitIsCustom(false);
      setConversionFactor('');
      setConversionBaseVariant(autoConversion?.baseVariant || manualBase);
      setAutoConversionFactor(autoConversion?.factor ?? null);
      setConversionError('');
      // Estimate is bound to the prior fromUnit → toUnit pair; reset on change.
      setAiEstimateDataState(null);
    },
    [selectedVariant, variants, onVariantSelect]
  );

  const cancelConversion = useCallback(() => {
    setPendingUnit('');
    setPendingUnitIsCustom(false);
    setConversionFactor('');
    setAutoConversionFactor(null);
    setConversionBaseVariant(null);
    setConversionError('');
    setAiEstimateDataState(null);
  }, []);

  const resetConversionState = useCallback(() => {
    setPendingUnit('');
    setPendingUnitIsCustom(false);
    setConversionFactor('');
    setAutoConversionFactor(null);
    setConversionBaseVariant(null);
    setConversionError('');
    setAiEstimateDataState(null);
  }, []);

  return {
    pendingUnit,
    setPendingUnit,
    pendingUnitIsCustom,
    conversionFactor,
    setConversionFactor,
    autoConversionFactor,
    conversionBaseVariant,
    conversionError,
    setConversionError,
    aiEstimateData,
    setAiEstimateData,
    isConverting,
    convertibleUnits,
    dropdownValue,
    buildConvertedVariant,
    handleUnitChange,
    cancelConversion,
    resetConversionState,
  };
}
