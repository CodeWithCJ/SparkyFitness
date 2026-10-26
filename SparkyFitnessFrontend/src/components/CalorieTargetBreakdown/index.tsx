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
import type { CalorieTargetBreakdownProps } from './types';

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
  goalModeWeeklyChangeKg = 0,
  calorieGoalAdjustmentMode,
  rawManualGoal,
  adjustedManualGoal,
  activityMultiplier,
  bmrSource,
  adaptiveActivitySeparate = false,
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

  const body = (
    <div className="mt-3 space-y-4 pl-1 text-xs text-muted-foreground leading-relaxed border-l border-border/60 ml-1.5 text-left font-sans">
      <BmrStep
        bmrAlgorithm={bmrAlgorithm}
        bmrSource={bmrSource}
        displayWeight={displayWeight}
        displayHeight={displayHeight}
        displayAge={displayAge}
        displayGender={displayGender}
        displayBodyFat={displayBodyFat}
        displayBmrVal={displayBmrVal}
      />
      <BodyFatStep
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
      <AdjustmentModeNote
        calorieGoalAdjustmentMode={calorieGoalAdjustmentMode}
      />
      {isAdaptiveMethod && (
        <AdaptiveTdeeStep
          previewResult={previewResult}
          adaptiveTdeeData={adaptiveTdeeData}
          activityMultiplier={activityMultiplier}
          activitySeparated={activitySeparated}
          displayBmrVal={displayBmrVal}
        />
      )}
      <TargetStep
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
      />
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
