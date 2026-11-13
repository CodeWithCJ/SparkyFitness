import type { TFunction } from 'i18next';
import {
  ADAPTIVE_TDEE_GOAL_MIN_DAYS,
  ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
  ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
  ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS,
  ADAPTIVE_TDEE_ESTIMATE_WINDOW_DAYS,
} from '@workspace/shared';
import type { AdaptiveTdeeData } from './types';

interface TargetFallbackNoticeInputs {
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  /** The BMR-based fallback target, already converted to the shown unit. */
  fallbackVal: number;
  unitStr: string;
  daysOfCalorieLogs: number;
}

export const getTargetFallbackNotice = (
  t: TFunction,
  {
    adaptiveTdeeData,
    fallbackVal,
    unitStr,
    daysOfCalorieLogs,
  }: TargetFallbackNoticeInputs
): string => {
  if (!adaptiveTdeeData) {
    return t('diary.calculateExplanation.fallbackInsufficient', {
      defaultValue:
        'Goal target will use the BMR-based formula baseline ({{value}} {{unit}}) due to insufficient data.',
      value: fallbackVal,
      unit: unitStr,
    });
  }

  if (adaptiveTdeeData.isFallback) {
    const reason = adaptiveTdeeData.fallbackReason?.toLowerCase() || '';
    if (
      adaptiveTdeeData.weightTrendMethod === 'bounded_daily' &&
      reason.includes('overlapping history')
    ) {
      return t('diary.calculateExplanation.fallbackAlignedOverlap', {
        defaultValue:
          'The formula baseline ({{value}} {{unit}}) is used because the latest weight-observation period had fewer than {{required}} qualifying food dates. The first weight day is included and the last is excluded. A new completed weight day with enough matching food history is needed, even if the {{window}}-day checklist totals are met.',
        value: fallbackVal,
        unit: unitStr,
        required: ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
        window: ADAPTIVE_TDEE_ESTIMATE_WINDOW_DAYS,
      });
    }
    if (reason.includes('weight')) {
      const bounded = adaptiveTdeeData.weightTrendMethod === 'bounded_daily';
      return t(
        bounded
          ? 'diary.calculateExplanation.fallbackWeightIntervals'
          : 'diary.calculateExplanation.fallbackWeight',
        {
          defaultValue: bounded
            ? 'Goal target will use the BMR-based formula baseline ({{value}} {{unit}}) because weight evidence is insufficient (requires at least {{readings}} measured days spanning {{span}}+ days within {{window}} closed days, with qualifying food logs between the weights).'
            : 'Goal target will use the BMR-based formula baseline ({{value}} {{unit}}) because weight evidence is insufficient (requires at least {{readings}} measured days spanning {{span}}+ days).',
          value: fallbackVal,
          unit: unitStr,
          readings: ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
          span: bounded ? ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS : 7,
          window: ADAPTIVE_TDEE_ESTIMATE_WINDOW_DAYS,
        }
      );
    }
    if (reason.includes('calorie')) {
      return t('diary.calculateExplanation.fallbackCalories', {
        defaultValue:
          'Goal target will use the BMR-based formula baseline ({{value}} {{unit}}) because calorie evidence is insufficient (requires at least {{required}} days with ≥200 kcal).',
        value: fallbackVal,
        unit: unitStr,
        required: ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
      });
    }
    return t('diary.calculateExplanation.fallbackUnknown', {
      defaultValue:
        'Goal target will use the BMR-based formula baseline ({{value}} {{unit}}) due to: {{reason}}',
      value: fallbackVal,
      unit: unitStr,
      reason: adaptiveTdeeData.fallbackReason || t('common.unknown', 'Unknown'),
    });
  }

  if (daysOfCalorieLogs < ADAPTIVE_TDEE_GOAL_MIN_DAYS) {
    return t('diary.calculateExplanation.fallbackRequiredDays', {
      defaultValue:
        'Goal target will use the BMR-based formula baseline ({{value}} {{unit}}) until {{required}} days of calorie logs are reached (currently {{days}}/{{required}} days logged).',
      value: fallbackVal,
      unit: unitStr,
      days: daysOfCalorieLogs,
      required: ADAPTIVE_TDEE_GOAL_MIN_DAYS,
    });
  }

  return '';
};
