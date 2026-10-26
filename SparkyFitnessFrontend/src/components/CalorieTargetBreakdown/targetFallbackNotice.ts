import type { TFunction } from 'i18next';
import { ADAPTIVE_TDEE_GOAL_MIN_DAYS } from '@workspace/shared';
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
        'Goal target will use fallback BMR ({{value}} {{unit}}) due to insufficient data.',
      value: fallbackVal,
      unit: unitStr,
    });
  }

  if (adaptiveTdeeData.isFallback) {
    const reason = adaptiveTdeeData.fallbackReason?.toLowerCase() || '';
    if (reason.includes('weight')) {
      return t('diary.calculateExplanation.fallbackWeight', {
        defaultValue:
          'Goal target will use fallback BMR ({{value}} {{unit}}) because weight logs are missing (requires at least 2 weight logs spanning 7+ days).',
        value: fallbackVal,
        unit: unitStr,
      });
    }
    if (reason.includes('calorie')) {
      return t('diary.calculateExplanation.fallbackCalories', {
        defaultValue:
          'Goal target will use fallback BMR ({{value}} {{unit}}) because calorie logs are missing (requires at least 7 days with ≥200 kcal).',
        value: fallbackVal,
        unit: unitStr,
      });
    }
    return t('diary.calculateExplanation.fallbackUnknown', {
      defaultValue:
        'Goal target will use fallback BMR ({{value}} {{unit}}) due to: {{reason}}',
      value: fallbackVal,
      unit: unitStr,
      reason: adaptiveTdeeData.fallbackReason || t('common.unknown', 'Unknown'),
    });
  }

  if (daysOfCalorieLogs < ADAPTIVE_TDEE_GOAL_MIN_DAYS) {
    return t('diary.calculateExplanation.fallbackRequiredDays', {
      defaultValue:
        'Goal target will use fallback BMR ({{value}} {{unit}}) until {{required}} days of calorie logs are reached (currently {{days}}/{{required}} days logged).',
      value: fallbackVal,
      unit: unitStr,
      days: daysOfCalorieLogs,
      required: ADAPTIVE_TDEE_GOAL_MIN_DAYS,
    });
  }

  return '';
};
