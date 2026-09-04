import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, ChevronDown, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import {
  getBmrAlgorithmLabel,
  getBodyFatAlgorithmLabel,
  getGoalModeLabel,
} from '@/utils/calculationLabels';
import {
  ADAPTIVE_TDEE_GOAL_MIN_DAYS,
  getGoalModeAdjustment,
  ENERGY_DENSITY_KCAL_PER_KG,
  type CalorieTargetResult,
} from '@workspace/shared';

interface AdaptiveTdeeData {
  tdee?: number;
  isFallback?: boolean;
  fallbackReason?: string;
  daysOfData?: number;
  avgIntake?: number;
  weightTrend?: number | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface CalorieTargetBreakdownProps {
  title?: string;
  /** Render as a modal popup instead of an inline expander (for height-locked widgets). */
  asDialog?: boolean;
  previewResult: CalorieTargetResult;
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  bmrAlgorithm: string;
  bodyFatAlgorithm: string;
  displayWeight: number;
  displayHeight: number;
  displayAge: number;
  displayGender: 'male' | 'female';
  displayBodyFat?: number;
  displayWaist?: number;
  displayNeck?: number;
  displayHips?: number;
  goalMode: string;
  goalModeCalculationMethod: string;
  goalModeCustomPercentage: number;
  calorieGoalAdjustmentMode: string;
  rawManualGoal: number;
  adjustedManualGoal: number;
  activityMultiplier: number;
  bmrSource?: string;
}

export const CalorieTargetBreakdown: React.FC<CalorieTargetBreakdownProps> = ({
  title,
  asDialog = false,
  previewResult,
  adaptiveTdeeData,
  bmrAlgorithm,
  bodyFatAlgorithm,
  displayWeight,
  displayHeight,
  displayAge,
  displayGender,
  displayBodyFat = 0,
  displayWaist,
  displayNeck,
  displayHips,
  goalMode,
  goalModeCalculationMethod,
  goalModeCustomPercentage,
  calorieGoalAdjustmentMode,
  rawManualGoal,
  adjustedManualGoal,
  activityMultiplier,
  bmrSource,
}) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const bmrAlgorithmLabel = getBmrAlgorithmLabel(t, bmrAlgorithm);
  const bodyFatAlgorithmLabel = getBodyFatAlgorithmLabel(t, bodyFatAlgorithm);
  const goalModeLabel = getGoalModeLabel(t, goalMode);

  const isAdaptiveMethod = goalModeCalculationMethod === 'adaptive';
  // Same label matrix as the CalculationSettings Live Preview (shared t() keys):
  // the baseline is only a TDEE under the adaptive method.
  let baselineLabel: string;
  if (isAdaptiveMethod) {
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

  const displayBmrVal = Math.round(
    convertEnergy(previewResult.rmr, 'kcal', energyUnit)
  );

  // Inputs are printed at the precision the formula actually evaluates at. Rounding
  // weight to one decimal made the panel unable to reproduce its own answer: a stored
  // 73.45 kg printed as "73.5" recomputes to 1597 kcal against a stated 1596.
  const formatInput = (value: number) => Number(value.toFixed(2)).toString();

  const bmrMathText = () => {
    if (bmrAlgorithm === 'Katch-McArdle' || bmrAlgorithm === 'Cunningham') {
      if (!displayBodyFat) {
        return t('diary.calculateExplanation.requiresBodyFat', {
          defaultValue:
            'Requires Weight and Body Fat Percentage. Math: Skipped (using Mifflin-St Jeor fallback).',
        });
      }
      const lbm = displayWeight * (1 - displayBodyFat / 100);
      if (bmrAlgorithm === 'Katch-McArdle') {
        return t('diary.calculateExplanation.katchMath', {
          defaultValue:
            'Formula: 370 + 21.6 × LBM (where LBM = weight × (1 - BF/100))\nMath: 370 + 21.6 × ({{weight}} kg × (1 - {{bodyFat}}/100)) = {{result}} kcal',
          weight: formatInput(displayWeight),
          bodyFat: formatInput(displayBodyFat),
          result: Math.round(370 + 21.6 * lbm),
        });
      } else {
        return t('diary.calculateExplanation.cunninghamMath', {
          defaultValue:
            'Formula: 500 + 22 × LBM (where LBM = weight × (1 - BF/100))\nMath: 500 + 22 × ({{weight}} kg × (1 - {{bodyFat}}/100)) = {{result}} kcal',
          weight: formatInput(displayWeight),
          bodyFat: formatInput(displayBodyFat),
          result: Math.round(500 + 22 * lbm),
        });
      }
    }

    if (bmrAlgorithm === 'Revised Harris-Benedict') {
      if (displayGender === 'male') {
        return t('diary.calculateExplanation.harrisMaleMath', {
          defaultValue:
            'Formula: 13.397 × weight + 4.799 × height - 5.677 × age + 88.362\nMath: 13.397 × {{weight}} + 4.799 × {{height}} - 5.677 × {{age}} + 88.362 = {{result}} kcal',
          weight: formatInput(displayWeight),
          height: formatInput(displayHeight),
          age: displayAge,
          result: Math.round(
            13.397 * displayWeight +
              4.799 * displayHeight -
              5.677 * displayAge +
              88.362
          ),
        });
      } else {
        return t('diary.calculateExplanation.harrisFemaleMath', {
          defaultValue:
            'Formula: 9.247 × weight + 3.098 × height - 4.33 × age + 447.593\nMath: 9.247 × {{weight}} + 3.098 × {{height}} - 4.33 × {{age}} + 447.593 = {{result}} kcal',
          weight: formatInput(displayWeight),
          height: formatInput(displayHeight),
          age: displayAge,
          result: Math.round(
            9.247 * displayWeight +
              3.098 * displayHeight -
              4.33 * displayAge +
              447.593
          ),
        });
      }
    }

    if (bmrAlgorithm === 'Oxford') {
      if (displayGender === 'male') {
        return t('diary.calculateExplanation.oxfordMaleMath', {
          defaultValue:
            'Formula: 14.2 × weight + 593\nMath: 14.2 × {{weight}} + 593 = {{result}} kcal',
          weight: formatInput(displayWeight),
          result: Math.round(14.2 * displayWeight + 593),
        });
      } else {
        return t('diary.calculateExplanation.oxfordFemaleMath', {
          defaultValue:
            'Formula: 10.9 × weight + 677\nMath: 10.9 × {{weight}} + 677 = {{result}} kcal',
          weight: formatInput(displayWeight),
          result: Math.round(10.9 * displayWeight + 677),
        });
      }
    }

    // Default: Mifflin-St Jeor
    const genderOffset = displayGender === 'male' ? 5 : -161;
    return t('diary.calculateExplanation.mifflinMath', {
      defaultValue:
        'Formula: 10 × weight + 6.25 × height - 5 × age + offset ({{offset}})\nMath: 10 × {{weight}} + 6.25 × {{height}} - 5 × {{age}} {{sign}} {{absoluteOffset}} = {{result}} kcal',
      offset: genderOffset,
      weight: formatInput(displayWeight),
      height: formatInput(displayHeight),
      age: displayAge,
      sign: genderOffset >= 0 ? '+' : '-',
      absoluteOffset: Math.abs(genderOffset),
      result: Math.round(
        10 * displayWeight +
          6.25 * displayHeight -
          5 * displayAge +
          genderOffset
      ),
    });
  };

  // Only the lean-mass formulas consume body fat; for the others section 2 is purely
  // informational and should not read like an input to the target.
  const bmrConsumesBodyFat =
    bmrAlgorithm === 'Katch-McArdle' || bmrAlgorithm === 'Cunningham';
  const hasMeasuredBodyFat = displayBodyFat !== undefined && displayBodyFat > 0;
  // Claiming the measured value "is used" while none exists would be wrong twice over:
  // there is nothing to use, and the lean-mass formula silently treats a missing figure
  // as 0% body fat, which reads as an implausibly high BMR.
  const bodyFatUsedByBmr = bmrConsumesBodyFat && hasMeasuredBodyFat;

  const bodyFatMathText = () => {
    if (bodyFatAlgorithm === 'BMI Method') {
      const heightInM = displayHeight / 100;
      const bmi = displayWeight / (heightInM * heightInM);
      const constant = displayGender === 'male' ? 16.2 : 5.4;
      return t('diary.calculateExplanation.bmiBodyFatMath', {
        defaultValue:
          'Formula: 1.2 × BMI + 0.23 × age - constant ({{constant}})\nMath: 1.2 × {{bmi}} (BMI) + 0.23 × {{age}} - {{constant}} = {{result}}%',
        constant,
        bmi: bmi.toFixed(1),
        age: displayAge,
        result: (1.2 * bmi + 0.23 * displayAge - constant).toFixed(1),
      });
    }

    // Default: U.S. Navy
    if (
      !displayWaist ||
      !displayNeck ||
      (displayGender === 'female' && !displayHips)
    ) {
      return t('diary.calculateExplanation.navyMissingMeasurements', {
        defaultValue:
          'Formula: U.S. Navy Method (requires waist, neck, and hips for females)\nMissing measurements for formula visualization. Go to Check-In to record waist & neck.',
      });
    }

    const CM_TO_INCH = 1 / 2.54;
    const heightIn = displayHeight * CM_TO_INCH;
    const waistIn = displayWaist * CM_TO_INCH;
    const neckIn = displayNeck * CM_TO_INCH;

    if (displayGender === 'male') {
      const logValue = waistIn - neckIn;
      if (logValue <= 0 || heightIn <= 0)
        return t(
          'diary.calculateExplanation.invalidMeasurements',
          'Invalid measurements for log calculation.'
        );
      const bfp =
        86.01 * Math.log10(logValue) - 70.041 * Math.log10(heightIn) + 36.76;
      // Print the inch values the formula is actually evaluated with. Showing the raw
      // cm figures here made the panel contradict itself: plugging those into these
      // (imperial) constants yields a visibly different number from the result below.
      return t('diary.calculateExplanation.navyMaleMath', {
        defaultValue:
          'Formula (Male): 86.01 × log10(waist - neck) - 70.041 × log10(height) + 36.76 (in inches)\nMath: 86.01 × log10({{waist}}in - {{neck}}in) - 70.041 × log10({{height}}in) + 36.76\nCalculated: {{result}}%',
        waist: waistIn.toFixed(1),
        neck: neckIn.toFixed(1),
        height: heightIn.toFixed(1),
        result: bfp.toFixed(1),
      });
    } else {
      const displayHipsVal = displayHips || 0;
      const hipsIn = displayHipsVal * CM_TO_INCH;
      const logValue = waistIn + hipsIn - neckIn;
      if (logValue <= 0 || heightIn <= 0)
        return t(
          'diary.calculateExplanation.invalidMeasurements',
          'Invalid measurements for log calculation.'
        );
      const bfp =
        163.205 * Math.log10(logValue) - 97.684 * Math.log10(heightIn) - 78.387;
      return t('diary.calculateExplanation.navyFemaleMath', {
        defaultValue:
          'Formula (Female): 163.205 × log10(waist + hips - neck) - 97.684 × log10(height) - 78.387 (in inches)\nMath: 163.205 × log10({{waist}}in + {{hips}}in - {{neck}}in) - 97.684 × log10({{height}}in) - 78.387\nCalculated: {{result}}%',
        waist: waistIn.toFixed(1),
        hips: hipsIn.toFixed(1),
        neck: neckIn.toFixed(1),
        height: heightIn.toFixed(1),
        result: bfp.toFixed(1),
      });
    }
  };

  const hasWeightFallback =
    !adaptiveTdeeData ||
    (adaptiveTdeeData.isFallback &&
      adaptiveTdeeData.fallbackReason?.toLowerCase().includes('weight'));
  const hasCalorieFallback =
    !adaptiveTdeeData ||
    (adaptiveTdeeData.isFallback &&
      adaptiveTdeeData.fallbackReason?.toLowerCase().includes('calorie'));
  const daysOfCalorieLogs = adaptiveTdeeData?.daysOfData ?? 0;

  const getTargetFallbackNotice = () => {
    const fallbackVal = Math.round(
      convertEnergy(previewResult.rmr * activityMultiplier, 'kcal', energyUnit)
    );
    const unitStr = getEnergyUnitString(energyUnit);

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
        reason:
          adaptiveTdeeData.fallbackReason || t('common.unknown', 'Unknown'),
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

  const triggerLabel =
    title ||
    t(
      'diary.calculateExplanation.todayTarget',
      "How today's target is calculated"
    );

  const isMeasuredBmr = bmrSource === 'measured';

  const body = (
    <div className="mt-3 space-y-4 pl-1 text-xs text-muted-foreground leading-relaxed border-l border-border/60 ml-1.5 text-left font-sans">
      {/* Step 1: BMR/RMR Calculation */}
      <div className="space-y-1">
        <div className="flex items-center justify-between font-medium text-foreground">
          <span>
            {t(
              'diary.calculateExplanation.bmrTitle',
              '1. Basal Metabolic Rate (BMR)'
            )}
          </span>
          <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
            {isMeasuredBmr
              ? t('diary.calculateExplanation.bmrMeasured', 'Measured')
              : bmrAlgorithmLabel}
          </span>
        </div>
        {isMeasuredBmr ? (
          <div className="text-muted-foreground text-sm bg-muted/40 p-1.5 rounded border border-border/60">
            {t(
              'diary.calculateExplanation.bmrMeasuredDesc',
              'Using your measured BMR. No formula applied.'
            )}
          </div>
        ) : (
          <pre className="text-muted-foreground font-sans whitespace-pre-line text-sm bg-muted/40 p-1.5 rounded border border-border/60">
            {bmrMathText()}
          </pre>
        )}
        {!isMeasuredBmr && (
          <div className="flex justify-between items-center bg-muted/50 dark:bg-muted/40 p-1.5 rounded mt-1">
            <span>
              {t(
                'diary.calculateExplanation.restingMetabolism',
                'Resting Metabolism (RMR/BMR):'
              )}
            </span>
            <span className="font-semibold text-foreground">
              {displayBmrVal} {getEnergyUnitString(energyUnit)}
            </span>
          </div>
        )}
      </div>

      {/* Step 2: Body Fat Percentage */}
      <div className="space-y-1">
        <div className="flex items-center justify-between font-medium text-foreground">
          <span>
            {t(
              'diary.calculateExplanation.bodyFatTitle',
              '2. Body Fat Percentage'
            )}
          </span>
          <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
            {bodyFatAlgorithmLabel}
          </span>
        </div>
        <pre className="text-muted-foreground font-sans whitespace-pre-line text-sm bg-muted/40 p-1.5 rounded border border-border/60">
          {bodyFatMathText()}
        </pre>
        <div className="flex justify-between items-center bg-muted/50 dark:bg-muted/40 p-1.5 rounded mt-1">
          <span>
            {t(
              'diary.calculateExplanation.currentBodyFatMeasured',
              'Current Body Fat (measured):'
            )}
          </span>
          <span className="font-semibold text-foreground">
            {displayBodyFat !== undefined && displayBodyFat > 0
              ? `${displayBodyFat.toFixed(1)}%`
              : t('diary.calculateExplanation.noMeasurement', 'No measurement')}
          </span>
        </div>
        {/*
          The block above is an estimate from tape measurements; this row is the logged
          measurement. They rarely agree, and the panel previously showed both with no
          indication of which -- if either -- feeds the target.
        */}
        <p className="text-xs text-muted-foreground">
          {bodyFatUsedByBmr
            ? t(
                'settings.calorieBreakdown.bodyFatUsed',
                'The measured value above is used by this BMR formula; the estimate is shown for comparison.'
              )
            : bmrConsumesBodyFat
              ? t(
                  'settings.calorieBreakdown.bodyFatMissing',
                  '{{algorithm}} uses body fat, but no measurement is logged — log one for an accurate target.',
                  { algorithm: bmrAlgorithmLabel }
                )
              : t(
                  'settings.calorieBreakdown.bodyFatUnused',
                  'Shown for reference only — {{algorithm}} does not take body fat as an input.',
                  { algorithm: bmrAlgorithmLabel }
                )}
        </p>
      </div>

      {/* Step 3: Adaptive TDEE (Expenditure) */}
      {isAdaptiveMethod && (
        <div className="space-y-1">
          <div className="flex items-center justify-between font-medium text-foreground">
            <span>
              {t(
                'diary.calculateExplanation.adaptiveTitle',
                '3. Adaptive TDEE (Expenditure)'
              )}
            </span>
            <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/40 rounded text-sm">
              {previewResult.insufficientHistory
                ? t(
                    'diary.calculateExplanation.fallbackEstimate',
                    'Fallback Estimate'
                  )
                : t('diary.calculateExplanation.adaptiveTdee', 'Adaptive TDEE')}
            </span>
          </div>
          <div className="text-muted-foreground text-sm bg-muted/40 p-1.5 rounded border border-border/60 space-y-1 text-left">
            <div className="font-semibold text-foreground">
              {t(
                'settings.breakdown.adaptiveFormula',
                'Formula: Average Daily Calories − (Daily Weight Change in kg × {{kcalPerKg}} kcal/kg)',
                { kcalPerKg: ENERGY_DENSITY_KCAL_PER_KG }
              )}
            </div>
            <p className="text-muted-foreground">
              {t(
                'settings.breakdown.adaptiveFormulaExplainer',
                '{{kcalPerKg}} kcal/kg is how much energy a kilogram of body weight represents, so your weight trend can be converted into calories. Body weight lost or gained is a mix of fat (~9,441 kcal/kg) and lean tissue and water (~1,816 kcal/kg), and {{kcalPerKg}} reflects a typical blend.',
                { kcalPerKg: ENERGY_DENSITY_KCAL_PER_KG }
              )}
            </p>
            {previewResult.insufficientHistory ? (
              <div className="space-y-2 mt-1">
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  {t('diary.calculateExplanation.adaptiveBypassedStatus', {
                    defaultValue:
                      'Status: Bypassed raw calculation ({{value}} {{unit}}) due to insufficient history.',
                    value: Math.round(
                      convertEnergy(
                        adaptiveTdeeData?.tdee || 0,
                        'kcal',
                        energyUnit
                      )
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
                        : t(
                            'diary.calculateExplanation.requirementMet',
                            '✓ Met'
                          )}
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
                            required: 7,
                          })
                        : t('diary.calculateExplanation.daysMet', {
                            defaultValue:
                              '✓ Met ({{days}}/{{required}} days logged)',
                            days: daysOfCalorieLogs,
                            required: 7,
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
                            defaultValue:
                              '✓ Met ({{days}}/{{required}} days logged)',
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
            ) : (
              <div className="space-y-1 mt-1">
                <p>
                  {t(
                    'diary.calculateExplanation.adaptiveActiveStatus',
                    'Status: Active (calculated baseline from logs).'
                  )}
                  {adaptiveTdeeData?.confidence && (
                    <>
                      {' '}
                      <span
                        className={
                          adaptiveTdeeData.confidence === 'HIGH'
                            ? 'font-medium text-green-600 dark:text-green-400'
                            : adaptiveTdeeData.confidence === 'MEDIUM'
                              ? 'font-medium text-amber-600 dark:text-amber-400'
                              : 'font-medium text-red-600 dark:text-red-400'
                        }
                      >
                        {t(
                          'settings.calorieBreakdown.confidence',
                          'Confidence: {{level}}',
                          { level: adaptiveTdeeData.confidence }
                        )}
                      </span>
                    </>
                  )}
                </p>
                {(adaptiveTdeeData?.confidence === 'LOW' ||
                  adaptiveTdeeData?.confidence === 'MEDIUM') && (
                  // Only on an explicit downgrade. The server lowers confidence for
                  // sparse logs, short tracking history, or weight gaps; adaptive TDEE
                  // infers expenditure from intake vs weight trend, so under-logging
                  // inflates the result and the target should not be presented as firm.
                  // A missing confidence is not a downgrade -- warning there would
                  // nag about "0 day(s)" on a server that simply did not report it.
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'settings.calorieBreakdown.adaptiveConfidenceCaveat',
                      'Based on {{days}} day(s) of calorie logs. Under-logging intake makes this estimate read high — log consistently to improve it.',
                      { days: adaptiveTdeeData?.daysOfData ?? 0 }
                    )}
                  </p>
                )}
                <ul className="list-disc pl-4 space-y-0.5 text-sm">
                  <li>
                    {t(
                      'diary.calculateExplanation.averageDailyIntake',
                      'Average daily calorie intake:'
                    )}{' '}
                    {Math.round(
                      convertEnergy(
                        adaptiveTdeeData?.avgIntake || 0,
                        'kcal',
                        energyUnit
                      )
                    )}{' '}
                    {getEnergyUnitString(energyUnit)}
                  </li>
                  <li>
                    {t(
                      'diary.calculateExplanation.calculatedExpenditure',
                      'Calculated Expenditure (TDEE):'
                    )}{' '}
                    {Math.round(
                      convertEnergy(
                        adaptiveTdeeData?.tdee || 0,
                        'kcal',
                        energyUnit
                      )
                    )}{' '}
                    {getEnergyUnitString(energyUnit)}
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Target Calculation */}
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
                    'diary.calculateExplanation.adaptiveTdeeExpenditure',
                    'Adaptive TDEE (Expenditure)'
                  )}{' '}
                  ={' '}
                  {Math.round(
                    convertEnergy(
                      previewResult.baselineTdee,
                      'kcal',
                      energyUnit
                    )
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </span>
              )
            ) : (
              <span>
                {calorieGoalAdjustmentMode === 'adaptive' ? (
                  <>
                    {t(
                      'diary.calculateExplanation.adaptiveManualGoal',
                      'Adaptive Manual Calorie Goal'
                    )}{' '}
                    ={' '}
                    {Math.round(
                      convertEnergy(adjustedManualGoal, 'kcal', energyUnit)
                    )}{' '}
                    {getEnergyUnitString(energyUnit)}
                  </>
                ) : (
                  <>
                    {t(
                      'diary.calculateExplanation.manualDailyGoal',
                      'Manual Daily Calorie Goal'
                    )}{' '}
                    ={' '}
                    {Math.round(
                      convertEnergy(rawManualGoal, 'kcal', energyUnit)
                    )}{' '}
                    {getEnergyUnitString(energyUnit)}
                  </>
                )}
              </span>
            )}
          </div>
          <div>
            <span className="font-medium">
              {!hasAdjustment
                ? t(
                    'settings.breakdown.goalAdjustmentLabel',
                    'Goal Adjustment:'
                  )
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
                {goalModeLabel} {adjustmentLabel} ({adjustmentSign}
                {Math.abs(Math.round(deficitPct * 100))}%) = {adjustmentSign}
                {Math.abs(
                  Math.round(
                    convertEnergy(calculatedDeficitAmount, 'kcal', energyUnit)
                  )
                )}{' '}
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
                {t('diary.calculateExplanation.rmrFloor', 'RMR Floor:')}{' '}
                {displayBmrVal} {getEnergyUnitString(energyUnit)}
              </li>
              <li>
                {t(
                  'diary.calculateExplanation.clinicalFloor',
                  'Clinical Absolute Floor:'
                )}{' '}
                {Math.round(
                  convertEnergy(absoluteSafetyFloor, 'kcal', energyUnit)
                )}{' '}
                {getEnergyUnitString(energyUnit)}
              </li>
              <li>
                {t(
                  'diary.calculateExplanation.effectiveFloor',
                  'Effective Safety Floor:'
                )}{' '}
                {effectiveSafetyFloor === null ? (
                  t('settings.goalMode.safetyFloorDisabled', 'Disabled')
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
          {isAdaptiveMethod && (
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
                  {getTargetFallbackNotice()}
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
    </div>
  );

  if (!asDialog) {
    return (
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer py-1 text-sm text-muted-foreground hover:text-foreground transition-colors font-semibold">
          <span className="flex items-center gap-1.5 font-sans">
            <Calculator className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{triggerLabel}</span>
          </span>
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 text-muted-foreground" />
        </summary>
        {body}
      </details>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between cursor-pointer py-1 text-sm text-muted-foreground hover:text-foreground transition-colors font-semibold"
        >
          <span className="flex items-center gap-1.5 font-sans">
            <Calculator className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{triggerLabel}</span>
          </span>
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <Calculator className="h-4 w-4" />
            {triggerLabel}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t(
              'diary.calculateExplanation.dialogDescription',
              'Step-by-step breakdown of how your daily energy target is calculated.'
            )}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
};
