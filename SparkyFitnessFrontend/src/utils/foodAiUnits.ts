type AiTrackedVariant = {
  id?: string;
  serving_unit?: string;
  source?: 'manual' | 'ai_estimate' | 'imported';
  ai_confidence?: 'high' | 'medium' | 'low' | null;
};

export type SavedAiUnitIndicator = {
  unit: string;
  confidence: 'high' | 'medium' | 'low';
};

export const deriveSavedAiUnits = (
  loadedVariants: ReadonlyArray<AiTrackedVariant | null | undefined>,
  currentVariants: ReadonlyArray<AiTrackedVariant | null | undefined>,
  aiEstimatedUnits: ReadonlyArray<string | null | undefined>
): SavedAiUnitIndicator[] =>
  loadedVariants.flatMap((loadedVariant, index) => {
    if (
      !loadedVariant?.id ||
      typeof loadedVariant.serving_unit !== 'string' ||
      loadedVariant.serving_unit.length === 0 ||
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
