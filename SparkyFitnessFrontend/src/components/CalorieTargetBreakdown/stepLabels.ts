import type { TFunction } from 'i18next';
import type { CalorieTargetResult } from '@workspace/shared';
import {
  getBmrAlgorithmLabel,
  getBodyFatAlgorithmLabel,
} from '@/utils/calculationLabels';

/**
 * The tag beside each step's title: shown in the step's own heading and in
 * the row header of the collapsible breakdown, so both say the same thing.
 */
export const bmrStepTag = (
  t: TFunction,
  bmrAlgorithm: string,
  bmrSource: string | undefined
) =>
  bmrSource === 'measured'
    ? t('diary.calculateExplanation.bmrMeasured', 'Measured')
    : getBmrAlgorithmLabel(t, bmrAlgorithm);

export const bodyFatStepTag = (t: TFunction, bodyFatAlgorithm: string) =>
  getBodyFatAlgorithmLabel(t, bodyFatAlgorithm);

export const adaptiveStepTag = (
  t: TFunction,
  previewResult: CalorieTargetResult
) =>
  previewResult.insufficientHistory
    ? t('diary.calculateExplanation.fallbackEstimate', 'Fallback Estimate')
    : t('diary.calculateExplanation.adaptiveTdee', 'Adaptive TDEE');

export const targetStepTag = (
  t: TFunction,
  previewResult: CalorieTargetResult,
  isAdaptiveMethod: boolean,
  goalModeCalculationMethod: string
) =>
  isAdaptiveMethod
    ? previewResult.insufficientHistory
      ? t(
          'diary.calculateExplanation.fallbackEstimateUnavailable',
          'Fallback Estimate (Adaptive TDEE unavailable)'
        )
      : t('diary.calculateExplanation.adaptiveTdee', 'Adaptive TDEE')
    : t('diary.calculateExplanation.calculationMethod', {
        defaultValue: '{{method}} Method',
        method: t(
          `diary.calculateExplanation.methods.${goalModeCalculationMethod}`,
          goalModeCalculationMethod
        ),
      });
