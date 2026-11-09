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
}: {
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
}) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  if (data?.weightTrendMethod !== 'bounded_daily') return null;

  const window = data.stabilizationWindowDays ?? ADAPTIVE_TDEE_STABILITY_DAYS;
  const statuses = {
    learning: t('diary.calculateExplanation.adaptiveStatusLearning', {
      defaultValue:
        'Status: Learning ({{days}}/{{window}} daily inputs contain learned evidence).',
      days: data.stabilizationDays ?? 0,
      window,
    }),
    adaptive: t(
      'diary.calculateExplanation.adaptiveStatusAdaptive',
      'Status: Adaptive (gradual estimate from complete evidence).'
    ),
    held: t(
      'diary.calculateExplanation.adaptiveStatusHeld',
      'Status: Holding the latest complete estimate while awaiting new eligible weight evidence.'
    ),
    fading: t(
      'diary.calculateExplanation.adaptiveStatusFading',
      'Status: Gradually returning to the formula baseline as complete evidence ages.'
    ),
    fallback: t(
      'diary.calculateExplanation.adaptiveStatusFallback',
      'Status: Formula fallback (no complete evidence is contributing to the estimate).'
    ),
  };

  return (
    <div className="space-y-1">
      {data.estimateStatus && (
        <p className="font-medium">{statuses[data.estimateStatus]}</p>
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
        {t('diary.calculateExplanation.adaptiveHistoryPolicy', {
          defaultValue:
            'The estimate averages {{window}} daily inputs. Complete evidence is held for {{hold}} days, then fades toward the formula baseline over {{fade}} days. The displayed average can continue moving while that evidence is held.',
          window,
          hold: ADAPTIVE_TDEE_WEIGHT_HOLD_DAYS,
          fade: ADAPTIVE_TDEE_WEIGHT_FADE_DAYS,
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('diary.calculateExplanation.adaptiveDailyBound', {
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
        {t('diary.calculateExplanation.adaptiveHistoryCaveat', {
          defaultValue:
            'Averaging attenuates sudden weight shifts but does not identify or eliminate water effects. It adds about {{lag}} days of lag. These time windows are engineering choices, not clinically validated thresholds.',
          lag: Math.round((window - 1) / 2),
        })}
      </p>
    </div>
  );
};
