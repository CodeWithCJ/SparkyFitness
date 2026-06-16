import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, ChevronDown, Info } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { getGoalModeDeficit } from '@workspace/shared';

interface CalorieTargetResult {
  baselineTdee: number;
  appliedDeficit: number;
  rmr: number;
  absoluteFloorValue: number;
  finalTarget: number;
  insufficientHistory: boolean;
}

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

  const isAdaptiveMethod = goalModeCalculationMethod === 'adaptive';
  const targetBaseline = previewResult.baselineTdee;
  const deficitPct = getGoalModeDeficit(goalMode, goalModeCustomPercentage);
  const calculatedDeficitAmount = previewResult.appliedDeficit;
  const safetyRmr = previewResult.rmr;
  const absoluteSafetyFloor = previewResult.absoluteFloorValue;
  const targetSafetyFloor = Math.max(safetyRmr, absoluteSafetyFloor);

  const displayBmrVal = Math.round(
    convertEnergy(previewResult.rmr, 'kcal', energyUnit)
  );

  const bmrMathText = () => {
    if (bmrAlgorithm === 'Katch-McArdle' || bmrAlgorithm === 'Cunningham') {
      if (!displayBodyFat) {
        return `Requires Weight and Body Fat Percentage. Math: Skipped (using Mifflin-St Jeor fallback).`;
      }
      const lbm = displayWeight * (1 - displayBodyFat / 100);
      if (bmrAlgorithm === 'Katch-McArdle') {
        return `Formula: 370 + 21.6 × LBM (where LBM = weight × (1 - BF/100))
Math: 370 + 21.6 × (${displayWeight.toFixed(1)} kg × (1 - ${displayBodyFat.toFixed(1)}/100)) = ${Math.round(370 + 21.6 * lbm)} kcal`;
      } else {
        return `Formula: 500 + 22 × LBM (where LBM = weight × (1 - BF/100))
Math: 500 + 22 × (${displayWeight.toFixed(1)} kg × (1 - ${displayBodyFat.toFixed(1)}/100)) = ${Math.round(500 + 22 * lbm)} kcal`;
      }
    }

    if (bmrAlgorithm === 'Revised Harris-Benedict') {
      if (displayGender === 'male') {
        return `Formula: 13.397 × weight + 4.799 × height - 5.677 × age + 88.362
Math: 13.397 × ${displayWeight.toFixed(1)} + 4.799 × ${displayHeight.toFixed(1)} - 5.677 × ${displayAge} + 88.362 = ${Math.round(13.397 * displayWeight + 4.799 * displayHeight - 5.677 * displayAge + 88.362)} kcal`;
      } else {
        return `Formula: 9.247 × weight + 3.098 × height - 4.33 × age + 447.593
Math: 9.247 × ${displayWeight.toFixed(1)} + 3.098 × ${displayHeight.toFixed(1)} - 4.33 × ${displayAge} + 447.593 = ${Math.round(9.247 * displayWeight + 3.098 * displayHeight - 4.33 * displayAge + 447.593)} kcal`;
      }
    }

    if (bmrAlgorithm === 'Oxford') {
      if (displayGender === 'male') {
        return `Formula: 14.2 × weight + 593
Math: 14.2 × ${displayWeight.toFixed(1)} + 593 = ${Math.round(14.2 * displayWeight + 593)} kcal`;
      } else {
        return `Formula: 10.9 × weight + 677
Math: 10.9 × ${displayWeight.toFixed(1)} + 677 = ${Math.round(10.9 * displayWeight + 677)} kcal`;
      }
    }

    // Default: Mifflin-St Jeor
    const genderOffset = displayGender === 'male' ? 5 : -161;
    return `Formula: 10 × weight + 6.25 × height - 5 × age + offset (${genderOffset})
Math: 10 × ${displayWeight.toFixed(1)} + 6.25 × ${displayHeight.toFixed(1)} - 5 × ${displayAge} ${genderOffset >= 0 ? '+' : '-'} ${Math.abs(genderOffset)} = ${Math.round(10 * displayWeight + 6.25 * displayHeight - 5 * displayAge + genderOffset)} kcal`;
  };

  const bodyFatMathText = () => {
    if (bodyFatAlgorithm === 'BMI Method') {
      const heightInM = displayHeight / 100;
      const bmi = displayWeight / (heightInM * heightInM);
      const constant = displayGender === 'male' ? 16.2 : 5.4;
      return `Formula: 1.2 × BMI + 0.23 × age - constant (${constant})
Math: 1.2 × ${bmi.toFixed(1)} (BMI) + 0.23 × ${displayAge} - ${constant} = ${(1.2 * bmi + 0.23 * displayAge - constant).toFixed(1)}%`;
    }

    // Default: U.S. Navy
    if (
      !displayWaist ||
      !displayNeck ||
      (displayGender === 'female' && !displayHips)
    ) {
      return `Formula: U.S. Navy Method (requires waist, neck, and hips for females)
Missing measurements for formula visualization. Go to Check-In to record waist & neck.`;
    }

    const CM_TO_INCH = 1 / 2.54;
    const heightIn = displayHeight * CM_TO_INCH;
    const waistIn = displayWaist * CM_TO_INCH;
    const neckIn = displayNeck * CM_TO_INCH;

    if (displayGender === 'male') {
      const logValue = waistIn - neckIn;
      if (logValue <= 0 || heightIn <= 0)
        return `Invalid measurements for log calculation.`;
      const bfp =
        86.01 * Math.log10(logValue) - 70.041 * Math.log10(heightIn) + 36.76;
      return `Formula (Male): 86.01 × log10(waist - neck) - 70.041 × log10(height) + 36.76 (in inches)
Math: 86.01 × log10(${displayWaist}cm - ${displayNeck}cm) - 70.041 × log10(${displayHeight}cm) + 36.76
Calculated: ${bfp.toFixed(1)}%`;
    } else {
      const displayHipsVal = displayHips || 0;
      const hipsIn = displayHipsVal * CM_TO_INCH;
      const logValue = waistIn + hipsIn - neckIn;
      if (logValue <= 0 || heightIn <= 0)
        return `Invalid measurements for log calculation.`;
      const bfp =
        163.205 * Math.log10(logValue) - 97.684 * Math.log10(heightIn) - 78.387;
      return `Formula (Female): 163.205 × log10(waist + hips - neck) - 97.684 × log10(height) - 78.387 (in inches)
Math: 163.205 × log10(${displayWaist}cm + ${displayHipsVal}cm - ${displayNeck}cm) - 97.684 × log10(${displayHeight}cm) - 78.387
Calculated: ${bfp.toFixed(1)}%`;
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
      return `Goal target will use fallback BMR (${fallbackVal} ${unitStr}) due to insufficient data.`;
    }

    if (adaptiveTdeeData.isFallback) {
      const reason = adaptiveTdeeData.fallbackReason?.toLowerCase() || '';
      if (reason.includes('weight')) {
        return `Goal target will use fallback BMR (${fallbackVal} ${unitStr}) because weight logs are missing (requires at least 2 weight logs spanning 7+ days).`;
      }
      if (reason.includes('calorie')) {
        return `Goal target will use fallback BMR (${fallbackVal} ${unitStr}) because calorie logs are missing (requires at least 7 days with ≥200 kcal).`;
      }
      return `Goal target will use fallback BMR (${fallbackVal} ${unitStr}) due to: ${adaptiveTdeeData.fallbackReason}`;
    }

    if (daysOfCalorieLogs < 14) {
      return `Goal target will use fallback BMR (${fallbackVal} ${unitStr}) until 14 days of calorie logs are reached (currently ${daysOfCalorieLogs}/14 days logged).`;
    }

    return '';
  };

  return (
    <details className="group">
      <summary className="flex items-center justify-between cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold">
        <span className="flex items-center gap-1.5 font-sans">
          <Calculator className="w-3.5 h-3.5 text-muted-foreground/80" />
          <span>
            {title ||
              t(
                'diary.calculateExplanation.todayTarget',
                "How today's target is calculated"
              )}
          </span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 text-muted-foreground/60" />
      </summary>

      <div className="mt-3 space-y-4 pl-1 text-[11px] text-muted-foreground/90 leading-relaxed border-l border-border/60 ml-1.5 text-left font-sans">
        {/* Step 1: BMR/RMR Calculation */}
        <div className="space-y-1">
          <div className="flex items-center justify-between font-medium text-foreground/85">
            <span>1. Basal Metabolic Rate (BMR)</span>
            <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px]">
              {bmrSource === 'external' ? 'Health App' : bmrAlgorithm}
            </span>
          </div>
          {bmrSource === 'external' ? (
            <div className="text-muted-foreground/70 text-[10px] bg-muted/10 p-1.5 rounded border border-border/30">
              BMR synced from your health app (Apple Health / Health Connect).
              No formula applied.
            </div>
          ) : (
            <pre className="text-muted-foreground/70 font-sans whitespace-pre-line text-[10px] bg-muted/10 p-1.5 rounded border border-border/30">
              {bmrMathText()}
            </pre>
          )}
          {bmrSource !== 'external' && (
            <div className="flex justify-between items-center bg-muted/20 dark:bg-muted/10 p-1.5 rounded mt-1">
              <span>Resting Metabolism (RMR/BMR):</span>
              <span className="font-semibold text-foreground">
                {displayBmrVal} {getEnergyUnitString(energyUnit)}
              </span>
            </div>
          )}
        </div>

        {/* Step 2: Body Fat Percentage */}
        <div className="space-y-1">
          <div className="flex items-center justify-between font-medium text-foreground/85">
            <span>2. Body Fat Percentage</span>
            <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px]">
              {bodyFatAlgorithm}
            </span>
          </div>
          <pre className="text-muted-foreground/70 font-sans whitespace-pre-line text-[10px] bg-muted/10 p-1.5 rounded border border-border/30">
            {bodyFatMathText()}
          </pre>
          <div className="flex justify-between items-center bg-muted/20 dark:bg-muted/10 p-1.5 rounded mt-1">
            <span>Current Body Fat:</span>
            <span className="font-semibold text-foreground">
              {displayBodyFat !== undefined && displayBodyFat > 0
                ? `${displayBodyFat.toFixed(1)}%`
                : 'No measurement'}
            </span>
          </div>
        </div>

        {/* Step 3: Adaptive TDEE (Expenditure) */}
        {isAdaptiveMethod && (
          <div className="space-y-1">
            <div className="flex items-center justify-between font-medium text-foreground/85">
              <span>3. Adaptive TDEE (Expenditure)</span>
              <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px]">
                {previewResult.insufficientHistory
                  ? 'Fallback Estimate'
                  : 'Adaptive TDEE'}
              </span>
            </div>
            <div className="text-muted-foreground/70 text-[10px] bg-muted/10 p-1.5 rounded border border-border/30 space-y-1 text-left">
              <div className="font-semibold text-foreground/90">
                Formula: Average Daily Calories - (Daily Weight Change in kg ×
                7700 kcal)
              </div>
              {previewResult.insufficientHistory ? (
                <div className="space-y-2 mt-1">
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    Status: Bypassed raw calculation (
                    {Math.round(
                      convertEnergy(
                        adaptiveTdeeData?.tdee || 0,
                        'kcal',
                        energyUnit
                      )
                    )}{' '}
                    {getEnergyUnitString(energyUnit)}) due to insufficient
                    history.
                  </p>

                  <div className="bg-muted/20 dark:bg-muted/10 p-2 rounded border border-border/30 space-y-1.5 mt-1 text-[10px]">
                    <span className="font-semibold text-foreground/80 block border-b border-border/40 pb-1 mb-1">
                      Adaptive TDEE checklist to transition from fallback:
                    </span>
                    <div className="flex items-center justify-between">
                      <span>• Weight Logs (2+ entries spanning 7+ days)</span>
                      <span
                        className={
                          hasWeightFallback
                            ? 'text-red-500 font-semibold'
                            : 'text-green-600 font-semibold'
                        }
                      >
                        {hasWeightFallback
                          ? '❌ Missing (Check-In weight logs)'
                          : '✓ Met'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>
                        • Calorie Logs for TDEE calculation (7+ days ≥ 200 kcal)
                      </span>
                      <span
                        className={
                          hasCalorieFallback
                            ? 'text-red-500 font-semibold'
                            : 'text-green-600 font-semibold'
                        }
                      >
                        {hasCalorieFallback
                          ? `❌ Missing (${daysOfCalorieLogs}/7 days logged)`
                          : `✓ Met (${daysOfCalorieLogs}/7 days logged)`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>
                        • Calorie Logs for target budget stability (14+ days ≥
                        200 kcal)
                      </span>
                      <span
                        className={
                          daysOfCalorieLogs >= 14
                            ? 'text-green-600 font-semibold'
                            : 'text-amber-600 font-semibold'
                        }
                      >
                        {daysOfCalorieLogs >= 14
                          ? `✓ Met (${daysOfCalorieLogs}/14 days logged)`
                          : `⚠️ Missing (${daysOfCalorieLogs}/14 days logged)`}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-muted-foreground/90 font-medium">
                    Using fallback BMR × Activity Multiplier:
                  </p>
                  <p className="pl-2 text-muted-foreground/80">
                    Math: BMR ({displayBmrVal} kcal) × activity multiplier (
                    {activityMultiplier.toFixed(3)}) ={' '}
                    {Math.round(
                      convertEnergy(
                        previewResult.rmr * activityMultiplier,
                        'kcal',
                        energyUnit
                      )
                    )}{' '}
                    {getEnergyUnitString(energyUnit)}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 mt-1">
                  <p>Status: Active (calculated baseline from logs).</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
                    <li>
                      Average daily calorie intake:{' '}
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
                      Calculated Expenditure (TDEE):{' '}
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
          <div className="flex items-center justify-between font-medium text-foreground/85">
            <span>
              {isAdaptiveMethod ? '4' : '3'}. Daily Calorie Goal calculation
            </span>
            <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px]">
              {isAdaptiveMethod
                ? previewResult.insufficientHistory
                  ? 'Fallback Estimate (Adaptive TDEE unavailable)'
                  : 'Adaptive TDEE'
                : `${goalModeCalculationMethod} Method`}
            </span>
          </div>
          <div className="text-muted-foreground/70 text-[10px] bg-muted/10 p-1.5 rounded border border-border/30 space-y-1 text-left">
            <div>
              <span className="font-medium">Baseline TDEE (Expenditure):</span>{' '}
              {isAdaptiveMethod ? (
                previewResult.insufficientHistory ? (
                  <span>
                    BMR ({displayBmrVal}) × Activity Multiplier (
                    {activityMultiplier.toFixed(3)}) ={' '}
                    {Math.round(
                      convertEnergy(
                        previewResult.rmr * activityMultiplier,
                        'kcal',
                        energyUnit
                      )
                    )}{' '}
                    {getEnergyUnitString(energyUnit)} (Fallback used: not enough
                    history [&lt;14 days]; raw calculation of{' '}
                    {adaptiveTdeeData
                      ? Math.round(
                          convertEnergy(
                            adaptiveTdeeData.tdee ?? 0,
                            'kcal',
                            energyUnit
                          )
                        )
                      : 0}{' '}
                    {getEnergyUnitString(energyUnit)} bypassed)
                  </span>
                ) : (
                  <span>
                    Adaptive TDEE (Expenditure) ={' '}
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
                      Adaptive Manual Calorie Goal ={' '}
                      {Math.round(
                        convertEnergy(adjustedManualGoal, 'kcal', energyUnit)
                      )}{' '}
                      {getEnergyUnitString(energyUnit)}
                    </>
                  ) : (
                    <>
                      Manual Daily Calorie Goal ={' '}
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
              <span className="font-medium">Goal Deficit:</span>{' '}
              {goalMode === 'maintain' ? (
                <span>Maintain (0% deficit)</span>
              ) : (
                <span>
                  {goalMode} Deficit (-{Math.round(deficitPct * 100)}%) = -
                  {Math.round(
                    convertEnergy(calculatedDeficitAmount, 'kcal', energyUnit)
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </span>
              )}
            </div>
            <div>
              <span className="font-medium">Target Cap Safety Floors:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-[9px] mt-0.5">
                <li>
                  RMR Floor: {displayBmrVal} {getEnergyUnitString(energyUnit)}
                </li>
                <li>
                  Clinical Absolute Floor:{' '}
                  {Math.round(
                    convertEnergy(absoluteSafetyFloor, 'kcal', energyUnit)
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </li>
                <li>
                  Effective Safety Floor:{' '}
                  {Math.round(
                    convertEnergy(targetSafetyFloor, 'kcal', energyUnit)
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </li>
              </ul>
            </div>
            {isAdaptiveMethod && (
              <div className="text-[10px] text-gray-500 italic mt-0.5">
                {previewResult.finalTarget === Math.round(targetSafetyFloor) &&
                Math.round(targetBaseline * (1 - deficitPct)) <
                  targetSafetyFloor ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    ⚠️ Daily budget was automatically raised to safety floor
                    limit.
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">
                    ✓ Target is in safe range above metabolic safety floor.
                  </span>
                )}
              </div>
            )}
            {!isAdaptiveMethod &&
              previewResult.finalTarget < targetSafetyFloor && (
                <div className="text-[10px] text-red-600 dark:text-red-400 font-medium mt-0.5">
                  ⚠️ Warning: Calorie budget is below the recommended safety
                  floor (
                  {Math.round(
                    convertEnergy(targetSafetyFloor, 'kcal', energyUnit)
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}).
                </div>
              )}
            {isAdaptiveMethod && daysOfCalorieLogs < 14 && (
              <div className="flex items-start gap-1 mt-1 p-1 bg-yellow-100 dark:bg-yellow-900/30 rounded border border-yellow-200 dark:border-yellow-800 text-[9px]">
                <Info className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <span className="text-yellow-700 dark:text-yellow-300">
                  {getTargetFallbackNotice()}
                </span>
              </div>
            )}
            <div className="pt-1 border-t border-border/40 font-bold text-foreground/90 mt-1 flex justify-between items-center text-[10px]">
              <span>Final Energy Budget Target:</span>
              <span className="text-primary text-xs font-semibold">
                {Math.round(
                  convertEnergy(previewResult.finalTarget, 'kcal', energyUnit)
                )}{' '}
                {getEnergyUnitString(energyUnit)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
};
