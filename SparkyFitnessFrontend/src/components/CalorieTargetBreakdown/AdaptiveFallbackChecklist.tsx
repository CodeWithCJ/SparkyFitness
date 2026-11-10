import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import {
  ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
  ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
  ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS,
  ADAPTIVE_TDEE_ESTIMATE_WINDOW_DAYS,
  type CalorieTargetResult,
} from '@workspace/shared';
import type { AdaptiveTdeeData } from './types';
import { getTargetFallbackNotice } from './targetFallbackNotice';

interface AdaptiveFallbackChecklistProps {
  previewResult: CalorieTargetResult;
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  activityMultiplier: number;
  displayBmrVal: number;
  variant?: 'all' | 'requirements' | 'calculation';
}

export const AdaptiveFallbackChecklist = ({
  previewResult,
  adaptiveTdeeData,
  activityMultiplier,
  displayBmrVal,
  variant = 'all',
}: AdaptiveFallbackChecklistProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();

  const bounded = adaptiveTdeeData?.weightTrendMethod === 'bounded_daily';
  const hasWeightFallback = bounded
    ? (adaptiveTdeeData.observedWeightDays ?? 0) <
        ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS ||
      (adaptiveTdeeData.weightObservationSpanDays ?? 0) <
        ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS
    : !adaptiveTdeeData ||
      (adaptiveTdeeData.isFallback &&
        adaptiveTdeeData.fallbackReason?.toLowerCase().includes('weight'));
  const daysOfCalorieLogs = adaptiveTdeeData?.daysOfData ?? 0;
  // From the count, not the fallback reason: a weight fallback carries a weight
  // reason even when the calorie requirement is (or is not) met.
  const hasCalorieFallback = daysOfCalorieLogs < ADAPTIVE_TDEE_MIN_CALORIE_DAYS;
  const fallbackNotice = bounded
    ? getTargetFallbackNotice(t, {
        adaptiveTdeeData,
        fallbackVal: Math.round(
          convertEnergy(
            previewResult.rmr * activityMultiplier,
            'kcal',
            energyUnit
          )
        ),
        unitStr: getEnergyUnitString(energyUnit),
        daysOfCalorieLogs,
      })
    : '';

  return (
    <div className="space-y-2 mt-1">
      {variant !== 'calculation' && (
        <>
          {fallbackNotice && <p>{fallbackNotice}</p>}
          {!bounded && (
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              {t('diary.calculateExplanation.adaptiveBypassedStatus', {
                defaultValue:
                  'Status: Bypassed raw calculation ({{value}} {{unit}}) due to insufficient history.',
                value: Math.round(
                  convertEnergy(adaptiveTdeeData?.tdee || 0, 'kcal', energyUnit)
                ),
                unit: getEnergyUnitString(energyUnit),
              })}
            </p>
          )}

          <div className="bg-muted/50 dark:bg-muted/40 p-2 rounded border border-border/60 space-y-1.5 mt-1 text-sm">
            <span className="font-semibold text-foreground block border-b border-border/60 pb-1 mb-1">
              {t(
                'diary.calculateExplanation.adaptiveChecklist',
                'Adaptive TDEE checklist to transition from fallback:'
              )}
            </span>
            <div className="flex items-center justify-between">
              <span>
                {t(
                  bounded
                    ? 'diary.calculateExplanation.weightIntervalRequirement'
                    : 'diary.calculateExplanation.weightLogRequirement',
                  {
                    defaultValue: bounded
                      ? '• Weight Logs ({{readings}}+ measured days spanning {{span}}+ days within {{window}} closed days)'
                      : '• Weight Logs ({{readings}}+ measured days spanning {{span}}+ days)',
                    readings: ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
                    span: bounded ? ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS : 7,
                    window: ADAPTIVE_TDEE_ESTIMATE_WINDOW_DAYS,
                  }
                )}
              </span>
              <span
                className={
                  hasWeightFallback
                    ? 'text-red-500 font-semibold'
                    : 'text-green-600 font-semibold'
                }
              >
                {hasWeightFallback
                  ? t(
                      'diary.calculateExplanation.weightLogsMissing',
                      '❌ Missing (Check-In weight logs)'
                    )
                  : t('diary.calculateExplanation.requirementMet', '✓ Met')}
              </span>
            </div>
            {bounded && (
              <p className="text-muted-foreground">
                {t('diary.calculateExplanation.measuredWeightCoverage', {
                  defaultValue:
                    'Observed weights: {{readings}} measured days spanning {{span}} days.',
                  readings: adaptiveTdeeData.observedWeightDays ?? 0,
                  span: adaptiveTdeeData.weightObservationSpanDays ?? 0,
                })}
              </p>
            )}
            <div className="flex items-center justify-between">
              <span>
                {t(
                  bounded
                    ? 'diary.calculateExplanation.calorieIntervalRequirement'
                    : 'diary.calculateExplanation.calorieLogRequirement',
                  {
                    defaultValue: bounded
                      ? '• Calorie Logs in the {{window}}-day lookback ({{required}}+ qualifying dates ≥ 200 kcal)'
                      : '• Calorie Logs for TDEE calculation and automatic targets ({{required}}+ days ≥ 200 kcal)',
                    required: ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
                    window: ADAPTIVE_TDEE_ESTIMATE_WINDOW_DAYS,
                  }
                )}
              </span>
              <span
                className={
                  hasCalorieFallback
                    ? 'text-red-500 font-semibold'
                    : 'text-green-600 font-semibold'
                }
              >
                {hasCalorieFallback
                  ? t('diary.calculateExplanation.daysMissing', {
                      defaultValue:
                        '❌ Missing ({{days}}/{{required}} days logged)',
                      days: daysOfCalorieLogs,
                      required: ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
                    })
                  : t('diary.calculateExplanation.daysMet', {
                      defaultValue: '✓ Met ({{days}}/{{required}} days logged)',
                      days: daysOfCalorieLogs,
                      required: ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
                    })}
              </span>
            </div>
            {bounded && (
              <p className="text-muted-foreground">
                {t('diary.calculateExplanation.calorieOverlapAction', {
                  defaultValue:
                    'A complete estimate also needs {{required}} qualifying food dates between the fitted weights: first weight day included, last weight day excluded. The lookback total alone does not confirm this overlap.',
                  required: ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
                })}
              </p>
            )}
          </div>
        </>
      )}
      {variant !== 'requirements' && (
        <>
          <p className="mt-2 text-muted-foreground/90 font-medium">
            {t(
              'diary.calculateExplanation.usingFallbackBmr',
              'Using fallback BMR × Activity Multiplier:'
            )}
          </p>
          <p className="pl-2 text-muted-foreground/80">
            {t('diary.calculateExplanation.fallbackMath', {
              defaultValue:
                'Math: BMR ({{bmr}} {{unit}}) × activity multiplier ({{multiplier}}) = {{result}} {{unit}}',
              bmr: displayBmrVal,
              multiplier: activityMultiplier.toFixed(3),
              result: Math.round(
                convertEnergy(
                  previewResult.rmr * activityMultiplier,
                  'kcal',
                  energyUnit
                )
              ),
              unit: getEnergyUnitString(energyUnit),
            })}
          </p>
        </>
      )}
    </div>
  );
};
