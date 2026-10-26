import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { formatWeeklyGoalRateWithUnit } from '@/utils/weeklyWeightGoal';
import { getGoalModeLabel } from '@/utils/calculationLabels';
import {
  ADAPTIVE_TDEE_GOAL_MIN_DAYS,
  getGoalModeAdjustment,
} from '@workspace/shared';
import { getTargetFallbackNotice } from './targetFallbackNotice';
import type { CalorieTargetBreakdownProps } from './types';

interface TargetStepProps extends Pick<
  CalorieTargetBreakdownProps,
  | 'previewResult'
  | 'adaptiveTdeeData'
  | 'goalMode'
  | 'goalModeCalculationMethod'
  | 'goalModeCustomPercentage'
  | 'goalModeWeeklyChangeKg'
  | 'calorieGoalAdjustmentMode'
  | 'rawManualGoal'
  | 'adjustedManualGoal'
  | 'activityMultiplier'
> {
  isAdaptiveMethod: boolean;
  activitySeparated: boolean;
  displayBmrVal: number;
}

export const TargetStep = ({
  previewResult,
  adaptiveTdeeData,
  goalMode,
  goalModeCalculationMethod,
  goalModeCustomPercentage,
  goalModeWeeklyChangeKg = 0,
  calorieGoalAdjustmentMode,
  rawManualGoal,
  adjustedManualGoal,
  activityMultiplier,
  isAdaptiveMethod,
  activitySeparated,
  displayBmrVal,
}: TargetStepProps) => {
  const { t, i18n } = useTranslation();
  const { energyUnit, convertEnergy, weightUnit = 'kg' } = usePreferences();
  const goalModeLabel = getGoalModeLabel(t, goalMode);
  const daysOfCalorieLogs = adaptiveTdeeData?.daysOfData ?? 0;

  // Same label matrix as the CalculationSettings Live Preview (shared t() keys):
  // the baseline is only a TDEE under the adaptive method.
  let baselineLabel: string;
  if (activitySeparated) {
    baselineLabel = t(
      'settings.goalMode.baselineActivityExcluded',
      'Adaptive baseline (activity excluded)'
    );
  } else if (isAdaptiveMethod) {
    baselineLabel = previewResult.insufficientHistory
      ? t('settings.goalMode.baselineEstimatedTdee', 'Estimated TDEE')
      : t(
          'settings.goalMode.baselineAdaptiveTdee',
          'Adaptive TDEE (Expenditure)'
        );
  } else if (calorieGoalAdjustmentMode === 'adaptive') {
    baselineLabel = t(
      'settings.goalMode.baselineAdaptiveGoal',
      'Baseline (Adaptive Goal)'
    );
  } else {
    baselineLabel = t(
      'settings.goalMode.baselineManualGoal',
      'Baseline (Manual Goal)'
    );
  }
  const deficitPct = getGoalModeAdjustment(goalMode, goalModeCustomPercentage);
  const calculatedDeficitAmount = previewResult.appliedDeficit;
  const absoluteSafetyFloor = previewResult.absoluteFloorValue;
  const recommendedSafetyFloor = previewResult.recommendedSafetyFloor;
  const effectiveSafetyFloor = previewResult.effectiveSafetyFloor;

  // A manual 0% is neither a deficit nor a surplus, so it gets no sign at all:
  // signing it renders "Deficit (-0%) = -0 kcal", which reads as an error.
  const hasAdjustment = calculatedDeficitAmount !== 0;
  const adjustmentSign = !hasAdjustment
    ? ''
    : previewResult.isGainGoal
      ? '+'
      : '-';
  const adjustmentLabel = !hasAdjustment
    ? t('settings.breakdown.adjustment', 'Adjustment')
    : previewResult.isGainGoal
      ? t('settings.breakdown.surplus', 'Surplus')
      : t('settings.breakdown.deficit', 'Deficit');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-medium text-foreground">
        <span>
          {t('diary.calculateExplanation.goalCalculationTitle', {
            defaultValue: '{{step}}. Daily Calorie Goal calculation',
            step: isAdaptiveMethod ? '4' : '3',
          })}
        </span>
        <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
          {isAdaptiveMethod
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
              })}
        </span>
      </div>
      <div className="text-muted-foreground text-sm bg-muted/40 p-1.5 rounded border border-border/60 space-y-1 text-left">
        <div>
          <span className="font-medium">{baselineLabel}:</span>{' '}
          {isAdaptiveMethod ? (
            previewResult.insufficientHistory ? (
              <span>
                {t('diary.calculateExplanation.fallbackBaselineDetail', {
                  defaultValue:
                    'BMR ({{bmr}}) × Activity Multiplier ({{multiplier}}) = {{result}} {{unit}} (Fallback used: not enough history [<{{required}} days]; raw calculation of {{raw}} {{unit}} bypassed)',
                  bmr: displayBmrVal,
                  multiplier: activityMultiplier.toFixed(3),
                  result: Math.round(
                    convertEnergy(
                      previewResult.rmr * activityMultiplier,
                      'kcal',
                      energyUnit
                    )
                  ),
                  raw: adaptiveTdeeData
                    ? Math.round(
                        convertEnergy(
                          adaptiveTdeeData.tdee ?? 0,
                          'kcal',
                          energyUnit
                        )
                      )
                    : 0,
                  unit: getEnergyUnitString(energyUnit),
                  required: ADAPTIVE_TDEE_GOAL_MIN_DAYS,
                })}
              </span>
            ) : (
              <span>
                {t(
                  activitySeparated
                    ? 'diary.calculateExplanation.activityExcludedBaselineValue'
                    : 'diary.calculateExplanation.adaptiveTDEEExpenditure',
                  activitySeparated
                    ? 'Adaptive baseline = {{energy}} {{energyUnitString}}'
                    : 'Adaptive TDEE (Expenditure) = {{energy}} {{energyUnitString}}',
                  {
                    energy: Math.round(
                      convertEnergy(
                        previewResult.baselineTdee,
                        'kcal',
                        energyUnit
                      )
                    ),
                    energyUnitString: getEnergyUnitString(energyUnit),
                  }
                )}
              </span>
            )
          ) : (
            <span>
              {calorieGoalAdjustmentMode === 'adaptive' ? (
                <>
                  {t(
                    'diary.calculateExplanation.adaptiveManualCalorieGoal',
                    'Adaptive Manual Calorie Goal = {{energy}} {{energyUnitString}}',
                    {
                      energy: Math.round(
                        convertEnergy(adjustedManualGoal, 'kcal', energyUnit)
                      ),
                      energyUnitString: getEnergyUnitString(energyUnit),
                    }
                  )}
                </>
              ) : (
                <>
                  {t(
                    'diary.calculateExplanation.manualDailyCalorieGoal',
                    'Manual Daily Calorie Goal = {{energy}} {{energyUnitString}}',
                    {
                      energy: Math.round(
                        convertEnergy(rawManualGoal, 'kcal', energyUnit)
                      ),
                      energyUnitString: getEnergyUnitString(energyUnit),
                    }
                  )}
                </>
              )}
            </span>
          )}
        </div>
        <div>
          <span className="font-medium">
            {!hasAdjustment
              ? t('settings.breakdown.goalAdjustmentLabel', 'Goal Adjustment:')
              : previewResult.isGainGoal
                ? t('settings.breakdown.goalSurplusLabel', 'Goal Surplus:')
                : t('settings.breakdown.goalDeficitLabel', 'Goal Deficit:')}
          </span>{' '}
          {goalMode === 'maintain' ? (
            <span>
              {t('settings.breakdown.goalMaintain', 'Maintain (0% change)')}
            </span>
          ) : (
            /* Magnitudes only: deficitPct and calculatedDeficitAmount are
                 signed, so formatting them raw double-prints the sign for gain
                 modes ("Deficit (--10%) = --200 kcal"). */
            <span>
              {goalModeLabel} {adjustmentLabel} (
              {goalMode === 'weekly'
                ? t('settings.goalMode.weeklyRateWithUnit', {
                    defaultValue: '{{rate}} / week',
                    rate: `${
                      goalModeWeeklyChangeKg < 0
                        ? '-'
                        : goalModeWeeklyChangeKg > 0
                          ? '+'
                          : ''
                    }${formatWeeklyGoalRateWithUnit(
                      goalModeWeeklyChangeKg,
                      weightUnit,
                      i18n.resolvedLanguage ?? i18n.language
                    )}`,
                  })
                : `${adjustmentSign}${Math.abs(Math.round(deficitPct * 100))}%`}
              ) ={' '}
              {`${adjustmentSign}${Math.abs(
                Math.round(
                  convertEnergy(calculatedDeficitAmount, 'kcal', energyUnit)
                )
              )}`}{' '}
              {getEnergyUnitString(energyUnit)}
            </span>
          )}
        </div>
        <div>
          <span className="font-medium">
            {t(
              'diary.calculateExplanation.safetyFloors',
              'Target Cap Safety Floors:'
            )}
          </span>
          <ul className="list-disc pl-4 space-y-0.5 text-[9px] mt-0.5">
            <li>
              {t(
                'diary.calculateExplanation.rmrFloor2',
                'RMR Floor: {{displayBmrVal}} {{energyUnitString}}',
                {
                  displayBmrVal,
                  energyUnitString: getEnergyUnitString(energyUnit),
                }
              )}
            </li>
            <li>
              {t(
                'diary.calculateExplanation.clinicalAbsoluteFloor',
                'Clinical Absolute Floor: {{energy}} {{energyUnitString}}',
                {
                  energy: Math.round(
                    convertEnergy(absoluteSafetyFloor, 'kcal', energyUnit)
                  ),
                  energyUnitString: getEnergyUnitString(energyUnit),
                }
              )}
            </li>
            <li>
              {t(
                'diary.calculateExplanation.effectiveFloor',
                'Effective Safety Floor:'
              )}{' '}
              {effectiveSafetyFloor === null ? (
                <span>
                  {t('settings.goalMode.safetyFloorDisabled', 'Disabled')}
                </span>
              ) : (
                <>
                  {Math.round(
                    convertEnergy(effectiveSafetyFloor, 'kcal', energyUnit)
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </>
              )}
            </li>
          </ul>
        </div>
        {(isAdaptiveMethod || goalMode === 'weekly') && (
          <div className="text-sm text-gray-500 italic mt-0.5">
            {/* computeCalorieTarget already decided this; re-deriving it here
                  drifts if the rounding or floor rules change. */}
            {effectiveSafetyFloor === null ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {t(
                  'settings.calorieBreakdown.safetyFloorDisabled',
                  'Automatic safety-floor clamping is disabled; recommended limits are still shown above.'
                )}
              </span>
            ) : previewResult.wasClampedToFloor ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {t(
                  'settings.calorieBreakdown.raisedToSafetyFloor',
                  '⚠️ Daily budget was automatically raised to the safety-floor limit.'
                )}
              </span>
            ) : effectiveSafetyFloor < recommendedSafetyFloor ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {t(
                  'settings.calorieBreakdown.customFloorActive',
                  'A custom safety floor is active; recommended limits are still shown above.'
                )}
              </span>
            ) : (
              <span className="text-green-600 dark:text-green-400">
                {t(
                  'diary.calculateExplanation.targetSafeRange',
                  '✓ Target is in safe range above metabolic safety floor.'
                )}
              </span>
            )}
          </div>
        )}
        {previewResult.finalTarget < recommendedSafetyFloor && (
          <div className="text-sm text-red-600 dark:text-red-400 font-medium mt-0.5">
            {t(
              'settings.calorieBreakdown.belowRecommendedFloor',
              '⚠️ Warning: Calorie budget is below the recommended safety floor ({{floor}} {{unit}}).',
              {
                floor: Math.round(
                  convertEnergy(recommendedSafetyFloor, 'kcal', energyUnit)
                ),
                unit: getEnergyUnitString(energyUnit),
              }
            )}
          </div>
        )}
        {isAdaptiveMethod &&
          daysOfCalorieLogs < ADAPTIVE_TDEE_GOAL_MIN_DAYS && (
            <div className="flex items-start gap-1 mt-1 p-1 bg-yellow-100 dark:bg-yellow-900/30 rounded border border-yellow-200 dark:border-yellow-800 text-xs">
              <Info className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <span className="text-yellow-700 dark:text-yellow-300">
                {getTargetFallbackNotice(t, {
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
                })}
              </span>
            </div>
          )}
        <div className="pt-1 border-t border-border/60 font-bold text-foreground mt-1 flex justify-between items-center text-sm">
          <span>
            {t(
              'diary.calculateExplanation.finalTarget',
              'Final Energy Budget Target:'
            )}
          </span>
          <span className="text-primary text-sm font-semibold">
            {Math.round(
              convertEnergy(previewResult.finalTarget, 'kcal', energyUnit)
            )}{' '}
            {getEnergyUnitString(energyUnit)}
          </span>
        </div>
      </div>
    </div>
  );
};
