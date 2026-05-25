import type { FoodVariant } from '@/types/food';

export type SavedAiUnitIndicator = {
  unit: string;
  confidence: 'high' | 'medium' | 'low';
};

export const deriveSavedAiUnits = (
  loadedVariants: ReadonlyArray<FoodVariant | null | undefined>,
  currentVariants: ReadonlyArray<FoodVariant | null | undefined>,
  aiEstimatedUnits: ReadonlyArray<string | null | undefined>
): SavedAiUnitIndicator[] =>
  loadedVariants.flatMap((loadedVariant, index) => {
    if (
      !loadedVariant?.id ||
      loadedVariant.source !== 'ai_estimate' ||
      (loadedVariant.ai_confidence !== 'high' &&
        loadedVariant.ai_confidence !== 'medium' &&
        loadedVariant.ai_confidence !== 'low')
    ) {
      return [];
    }

    const currentVariant = currentVariants[index] ?? null;
    const stillAiControlled =
      currentVariant?.source === 'ai_estimate' ||
      aiEstimatedUnits[index] === loadedVariant.serving_unit;

    if (!stillAiControlled) {
      return [];
    }

    return [
      {
        unit: loadedVariant.serving_unit,
        confidence: loadedVariant.ai_confidence,
      },
    ];
  });
