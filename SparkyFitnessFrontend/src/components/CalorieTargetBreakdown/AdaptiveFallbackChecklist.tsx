import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import {
  ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
  ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
  ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS,
  type CalorieTargetResult,
} from '@workspace/shared';
import type { AdaptiveTdeeData } from './types';
import { AdaptiveEstimateStatus } from './AdaptiveEstimateStatus';
import { getTargetFallbackNotice } from './targetFallbackNotice';

interface AdaptiveFallbackChecklistProps {
  previewResult: CalorieTargetResult;
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  activityMultiplier: number;
  displayBmrVal: number;
}

export const AdaptiveFallbackChecklist = ({
  previewResult,
  adaptiveTdeeData,
  activityMultiplier,
  displayBmrVal,
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
      <AdaptiveEstimateStatus adaptiveTdeeData={adaptiveTdeeData} />
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
            {t('diary.calculateExplanation.weightLogRequirement', {
              defaultValue:
                '• Weight Logs ({{readings}}+ measured days spanning {{span}}+ days)',
              readings: ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
              span: ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS,
            })}
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
            {t('diary.calculateExplanation.calorieLogRequirement', {
              defaultValue:
                '• Calorie Logs for TDEE calculation and automatic targets ({{required}}+ days ≥ 200 kcal)',
              required: ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
            })}
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
      </div>

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
    </div>
  );
};
