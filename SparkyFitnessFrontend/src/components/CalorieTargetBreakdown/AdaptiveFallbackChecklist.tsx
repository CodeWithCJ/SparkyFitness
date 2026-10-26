import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import {
  ADAPTIVE_TDEE_GOAL_MIN_DAYS,
  ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
  type CalorieTargetResult,
} from '@workspace/shared';
import type { AdaptiveTdeeData } from './types';

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

  const hasWeightFallback =
    !adaptiveTdeeData ||
    (adaptiveTdeeData.isFallback &&
      adaptiveTdeeData.fallbackReason?.toLowerCase().includes('weight'));
  const daysOfCalorieLogs = adaptiveTdeeData?.daysOfData ?? 0;
  // From the count, not the fallback reason: a weight fallback carries a weight
  // reason even when the calorie requirement is (or is not) met.
  const hasCalorieFallback = daysOfCalorieLogs < ADAPTIVE_TDEE_MIN_CALORIE_DAYS;

  return (
    <div className="space-y-2 mt-1">
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
              'diary.calculateExplanation.weightLogRequirement',
              '• Weight Logs (2+ entries spanning 7+ days)'
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
        <div className="flex items-center justify-between">
          <span>
            {t(
              'diary.calculateExplanation.calorieLogRequirement',
              '• Calorie Logs for TDEE calculation (7+ days ≥ 200 kcal)'
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
        <div className="flex items-center justify-between">
          <span>
            {t('diary.calculateExplanation.stabilityRequirement', {
              defaultValue:
                '• Calorie Logs for target budget stability ({{required}}+ days ≥ 200 kcal)',
              required: ADAPTIVE_TDEE_GOAL_MIN_DAYS,
            })}
          </span>
          <span
            className={
              daysOfCalorieLogs >= ADAPTIVE_TDEE_GOAL_MIN_DAYS
                ? 'text-green-600 font-semibold'
                : 'text-amber-600 font-semibold'
            }
          >
            {daysOfCalorieLogs >= ADAPTIVE_TDEE_GOAL_MIN_DAYS
              ? t('diary.calculateExplanation.daysMet', {
                  defaultValue: '✓ Met ({{days}}/{{required}} days logged)',
                  days: daysOfCalorieLogs,
                  required: ADAPTIVE_TDEE_GOAL_MIN_DAYS,
                })
              : t('diary.calculateExplanation.daysWarning', {
                  defaultValue:
                    '⚠️ Missing ({{days}}/{{required}} days logged)',
                  days: daysOfCalorieLogs,
                  required: ADAPTIVE_TDEE_GOAL_MIN_DAYS,
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
            'Math: BMR ({{bmr}} kcal) × activity multiplier ({{multiplier}}) = {{result}} {{unit}}',
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
