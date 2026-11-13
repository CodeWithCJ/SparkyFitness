import { useTranslation } from 'react-i18next';
import {
  ADAPTIVE_TDEE_STABILITY_DAYS,
  ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL,
  ADAPTIVE_TDEE_WEIGHT_FADE_DAYS,
  ADAPTIVE_TDEE_WEIGHT_HOLD_DAYS,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import type { AdaptiveTdeeData } from './types';

export const AdaptiveEstimateStatus = ({
  adaptiveTdeeData: data,
  compact = false,
  activitySeparated = false,
}: {
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  compact?: boolean;
  activitySeparated?: boolean;
}) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  if (data?.weightTrendMethod !== 'bounded_daily') return null;

  const window = data.stabilizationWindowDays ?? ADAPTIVE_TDEE_STABILITY_DAYS;
  const historyReliable = activitySeparated
    ? data.activityHistoryReliable
    : data.historyReliable;

  if (compact) {
    const status =
      data.isFallback || data.estimateStatus === 'fallback'
        ? t(
            'diary.calculateExplanation.adaptiveSummaryFallback',
            'Status: Formula fallback while more overlapping weight and food history is needed.'
          )
        : data.estimateStatus === 'fading'
          ? t(
              'diary.calculateExplanation.adaptiveSummaryFading',
              'Status: Returning toward the formula baseline as evidence ages.'
            )
          : historyReliable !== true &&
              data.observedWeightDays !== undefined &&
              data.observedWeightDays < 3
            ? t(
                'diary.calculateExplanation.adaptiveSummaryWeeklyWeighIn',
                'Status: Weigh in at least weekly to unlock target advice.'
              )
            : historyReliable !== true
              ? t(
                  'diary.calculateExplanation.adaptiveSummaryAdjusting',
                  'Status: Still adjusting; earlier evidence remains in the gradual estimate.'
                )
              : t(
                  'diary.calculateExplanation.adaptiveSummaryReady',
                  'Status: Adaptive estimate; the recent history meets the data-quality checks.'
                );
    return (
      <p role="status" className="font-medium">
        {status}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p>
        {t('diary.calculateExplanation.adaptiveLearnedContributions', {
          defaultValue:
            'Learned contributions: {{days}} of {{window}} days in the gradual estimate.',
          days: data.stabilizationDays ?? 0,
          window,
        })}
      </p>
      {!data.isFallback && (
        <p>
          {historyReliable === true
            ? t(
                'diary.calculateExplanation.adaptiveHistoryQualityMet',
                'The selected history meets the freshness, confidence and plausibility checks. This does not guarantee that the estimate has caught up with a real change.'
              )
            : t(
                'diary.calculateExplanation.adaptiveHistoryQualityPending',
                'The whole selected history is not yet confirmed: earlier low-confidence, stale or capped evidence may still influence this number, even when the latest calculation looks settled. The number continues to adjust gradually.'
              )}
        </p>
      )}
      {data.candidateDate && (
        <p>
          {t('diary.calculateExplanation.adaptiveEvidenceAge', {
            defaultValue:
              'Latest complete evidence: {{date}} ({{days}} days ago).',
            date: data.candidateDate,
            days: data.daysSinceEstimate ?? 0,
          })}
        </p>
      )}
      {data.lastWeightDate && (
        <p>
          {t('diary.calculateExplanation.adaptiveWeightAge', {
            defaultValue: 'Last measured weight: {{date}} ({{days}} days ago).',
            date: data.lastWeightDate,
            days: data.daysSinceLastWeight ?? 0,
          })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t('diary.calculateExplanation.adaptiveAlignedHistoryPolicy', {
          defaultValue:
            'The estimate averages {{window}} daily inputs. Complete evidence is held for {{hold}} days, then fades toward the formula baseline over {{fade}} days. The displayed average can continue moving while that evidence is held.',
          window,
          hold: ADAPTIVE_TDEE_WEIGHT_HOLD_DAYS,
          fade: ADAPTIVE_TDEE_WEIGHT_FADE_DAYS,
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('diary.calculateExplanation.adaptiveAlignedDailyBound', {
          defaultValue:
            'With an unchanged formula baseline and unchanged past records, advancing one day changes the estimate by at most {{limit}} {{unit}}/day. Birthdays, changes in measured BMR, or profile/settings changes can change the baseline; corrected past records can also recalculate the estimate.',
          limit: Math.round(
            convertEnergy(
              data.dailyChangeLimitKcal ??
                ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL,
              'kcal',
              energyUnit
            )
          ),
          unit: getEnergyUnitString(energyUnit),
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('diary.calculateExplanation.adaptiveWholeChainCaveat', {
          defaultValue:
            'The averaging window is only one part of the response: fitting weight changes, carrying older evidence and fading it also add delay. Sudden weight shifts are attenuated, not identified as water or eliminated. These time windows are engineering choices, not clinically validated thresholds.',
        })}
      </p>
    </div>
  );
};
