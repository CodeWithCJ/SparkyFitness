import type { TFunction } from 'i18next';
import {
  OVERALL_CONFIDENCE_LABELS,
  type AiConfidence,
} from '@workspace/shared';

export type AiConfidenceTranslationScope = 'editFoodEntry' | 'foodUnitSelector';

export const getAiConfidenceLabel = (
  t: TFunction,
  scope: AiConfidenceTranslationScope,
  confidence: AiConfidence
): string =>
  t(`${scope}.confidence.${confidence}`, OVERALL_CONFIDENCE_LABELS[confidence]);

export const getAiEstimateLabel = (
  t: TFunction,
  scope: AiConfidenceTranslationScope,
  confidence: AiConfidence
): string =>
  t(`${scope}.aiEstimateConfidence`, {
    defaultValue: 'AI estimate ({{confidence}} confidence)',
    confidence: getAiConfidenceLabel(t, scope, confidence),
  });
