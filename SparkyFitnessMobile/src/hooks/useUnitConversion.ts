import { useCallback, useMemo, useState } from 'react';
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
  pendingUnit: string;
  setPendingUnit: (unit: string) => void;
  pendingUnitIsCustom: boolean;
  conversionFactor: number | '';
  setConversionFactor: (factor: number | '') => void;
  autoConversionFactor: number | null;
  conversionBaseVariant: FoodUnitVariant | null;
  conversionError: string;
  setConversionError: (error: string) => void;
  isConverting: boolean;
  convertibleUnits: string[];
  buildConvertedVariant: () => FoodUnitVariant | null;
  handleExistingUnitSelection: (unit: string) => void;
  startCustomUnit: () => void;
  cancelConversion: () => void;
  resetConversionState: () => void;
}

interface ResolvedAutoConversion {
  baseVariant: FoodUnitVariant;
  factor: number;
}

function getManualConversionBaseVariant(
  variants: FoodUnitVariant[],
  selectedVariant: FoodUnitVariant | null,
): FoodUnitVariant | null {
  return selectedVariant || variants[0] || null;
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
  const [pendingUnit, setPendingUnit] = useState('');
  const [pendingUnitIsCustom, setPendingUnitIsCustom] = useState(false);
  const [conversionFactor, setConversionFactor] = useState<number | ''>('');
  const [autoConversionFactor, setAutoConversionFactor] = useState<
    number | null
  >(null);
  const [conversionBaseVariant, setConversionBaseVariant] =
    useState<FoodUnitVariant | null>(null);
  const [conversionError, setConversionError] = useState('');

  const isConverting = !!(pendingUnit || pendingUnitIsCustom);

  const convertibleUnits = useMemo(() => {
    const existingUnits = new Set(
      variants.map((variant) => variant.serving_unit.toLowerCase())
    );

    return ALL_CONVERSION_UNITS.filter(
      (unit) => !existingUnits.has(unit.toLowerCase())
    );
  }, [variants]);

  const buildConvertedVariant = useCallback((): FoodUnitVariant | null => {
    const base = conversionBaseVariant;
    const effectiveFactor =
      autoConversionFactor !== null
        ? autoConversionFactor
        : typeof conversionFactor === 'number'
          ? conversionFactor > 0
            ? conversionFactor
            : null
          : null;

    if (!base || effectiveFactor === null || !pendingUnit.trim()) {
      return null;
    }

    const ratio = effectiveFactor / base.serving_size;

    return {
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
      glycemic_index: base.glycemic_index,
      custom_nutrients: Object.fromEntries(
        Object.entries(base.custom_nutrients || {}).map(([key, value]) => [
          key,
          (Number(value) || 0) * ratio,
        ]),
      ),
    };
  }, [
    autoConversionFactor,
    conversionBaseVariant,
    conversionFactor,
    pendingUnit,
  ]);

  const handleExistingUnitSelection = useCallback(
    (unit: string) => {
      const manualBase = getManualConversionBaseVariant(variants, selectedVariant);
      const autoConversion = resolveAutoConversionSource(
        variants,
        selectedVariant,
        unit,
      );

      setPendingUnit(unit);
      setPendingUnitIsCustom(false);
      setConversionFactor('');
      setConversionBaseVariant(autoConversion?.baseVariant || manualBase);
      setAutoConversionFactor(autoConversion?.factor ?? null);
      setConversionError('');
    },
    [selectedVariant, variants],
  );

  const startCustomUnit = useCallback(() => {
    setConversionBaseVariant(selectedVariant || variants[0] || null);
    setPendingUnitIsCustom(true);
    setPendingUnit('');
    setAutoConversionFactor(null);
    setConversionFactor('');
    setConversionError('');
  }, [selectedVariant, variants]);

  const cancelConversion = useCallback(() => {
    setPendingUnit('');
    setPendingUnitIsCustom(false);
    setConversionFactor('');
    setAutoConversionFactor(null);
    setConversionBaseVariant(null);
    setConversionError('');
  }, []);

  const resetConversionState = useCallback(() => {
    setPendingUnit('');
    setPendingUnitIsCustom(false);
    setConversionFactor('');
    setAutoConversionFactor(null);
    setConversionBaseVariant(null);
    setConversionError('');
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
    isConverting,
    convertibleUnits,
    buildConvertedVariant,
    handleExistingUnitSelection,
    startCustomUnit,
    cancelConversion,
    resetConversionState,
  };
}
