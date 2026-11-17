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
import { isAdaptiveActivitySeparated } from '@workspace/shared';
import { AdaptiveTdeeStep } from './AdaptiveTdeeStep';
import { AdjustmentModeNote } from './AdjustmentModeNote';
import { BmrStep } from './BmrStep';
import { BodyFatStep } from './BodyFatStep';
import { TargetStep } from './TargetStep';
import { BreakdownSection } from './BreakdownSection';
import {
  adaptiveStepTag,
  bmrStepTag,
  bodyFatStepTag,
  targetStepTag,
} from './stepLabels';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import type { CalorieTargetBreakdownProps } from './types';

export const CalorieTargetBreakdown: React.FC<CalorieTargetBreakdownProps> = ({
  title,
  asDialog = false,
  defaultOpen = false,
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
  goalModeWeeklyChangeKg = 0,
  calorieGoalAdjustmentMode,
  rawManualGoal,
  adjustedManualGoal,
  activityMultiplier,
  bmrSource,
  adaptiveActivitySeparate = false,
  calorieCycling,
}) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();

  const isAdaptiveMethod = goalModeCalculationMethod === 'adaptive';
  const activitySeparated = isAdaptiveActivitySeparated(
    calorieGoalAdjustmentMode,
    goalModeCalculationMethod,
    adaptiveActivitySeparate
  );
  const displayBmrVal = Math.round(
    convertEnergy(previewResult.rmr, 'kcal', energyUnit)
  );

  const triggerLabel =
    title ||
    t(
      'diary.calculateExplanation.todayTarget',
      "How today's target is calculated"
    );

  const energy = (kcal: number) =>
    `${Math.round(convertEnergy(kcal, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`;
  const finalTarget =
    calorieCycling?.status === 'active'
      ? calorieCycling.target
      : previewResult.finalTarget;
  const goalStep = isAdaptiveMethod ? 4 : 3;

  const body = (
    <div className="mt-2 space-y-2 text-left text-xs leading-relaxed text-muted-foreground font-sans">
      <AdjustmentModeNote
        calorieGoalAdjustmentMode={calorieGoalAdjustmentMode}
      />
      <div>
        <BreakdownSection
          step={1}
          testId="breakdown-step-bmr"
          title={t(
            'diary.calculateExplanation.stepBmr',
            'Resting metabolism (BMR)'
          )}
          tag={bmrStepTag(t, bmrAlgorithm, bmrSource)}
          value={energy(previewResult.rmr)}
        >
          <BmrStep
            headless
            bmrAlgorithm={bmrAlgorithm}
            bmrSource={bmrSource}
            displayWeight={displayWeight}
            displayHeight={displayHeight}
            displayAge={displayAge}
            displayGender={displayGender}
            displayBodyFat={displayBodyFat}
            displayBmrVal={displayBmrVal}
          />
        </BreakdownSection>
        <BreakdownSection
          step={2}
          testId="breakdown-step-body-fat"
          title={t(
            'diary.calculateExplanation.stepBodyFat',
            'Body fat percentage'
          )}
          tag={bodyFatStepTag(t, bodyFatAlgorithm)}
          value={
            displayBodyFat > 0
              ? `${displayBodyFat.toFixed(1)}%`
              : t('diary.calculateExplanation.noMeasurement', 'No measurement')
          }
        >
          <BodyFatStep
            headless
            bmrAlgorithm={bmrAlgorithm}
            bodyFatAlgorithm={bodyFatAlgorithm}
            displayWeight={displayWeight}
            displayHeight={displayHeight}
            displayAge={displayAge}
            displayGender={displayGender}
            displayBodyFat={displayBodyFat}
            displayWaist={displayWaist}
            displayNeck={displayNeck}
            displayHips={displayHips}
          />
        </BreakdownSection>
        {isAdaptiveMethod && (
          <BreakdownSection
            step={3}
            testId="breakdown-step-adaptive"
            title={t(
              'diary.calculateExplanation.stepAdaptive',
              'Adaptive TDEE (expenditure)'
            )}
            tag={adaptiveStepTag(t, previewResult)}
            value={energy(previewResult.baselineTdee)}
          >
            <AdaptiveTdeeStep
              headless
              previewResult={previewResult}
              adaptiveTdeeData={adaptiveTdeeData}
              activityMultiplier={activityMultiplier}
              activitySeparated={activitySeparated}
              displayBmrVal={displayBmrVal}
            />
          </BreakdownSection>
        )}
        <BreakdownSection
          step={goalStep}
          testId="breakdown-step-goal"
          title={t('diary.calculateExplanation.stepGoal', 'Daily calorie goal')}
          tag={targetStepTag(
            t,
            previewResult,
            isAdaptiveMethod,
            goalModeCalculationMethod
          )}
          value={energy(finalTarget)}
        >
          <TargetStep
            headless
            previewResult={previewResult}
            adaptiveTdeeData={adaptiveTdeeData}
            goalMode={goalMode}
            goalModeCalculationMethod={goalModeCalculationMethod}
            goalModeCustomPercentage={goalModeCustomPercentage}
            goalModeWeeklyChangeKg={goalModeWeeklyChangeKg}
            calorieGoalAdjustmentMode={calorieGoalAdjustmentMode}
            rawManualGoal={rawManualGoal}
            adjustedManualGoal={adjustedManualGoal}
            activityMultiplier={activityMultiplier}
            isAdaptiveMethod={isAdaptiveMethod}
            activitySeparated={activitySeparated}
            displayBmrVal={displayBmrVal}
            calorieCycling={calorieCycling}
          />
        </BreakdownSection>
      </div>
    </div>
  );

  if (!asDialog) {
    return (
      <details className="group" open={defaultOpen}>
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
