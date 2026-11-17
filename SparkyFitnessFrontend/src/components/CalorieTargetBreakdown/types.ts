import type {
  AdaptiveTdeeResult,
  CalorieCyclingDay,
  CalorieTargetResult,
} from '@workspace/shared';

export type AdaptiveTdeeData = Partial<AdaptiveTdeeResult>;

export interface CalorieTargetBreakdownProps {
  title?: string;
  /** Render as a modal popup instead of an inline expander (for height-locked widgets). */
  asDialog?: boolean;
  /** Start the inline expander open, showing the numbered steps. */
  defaultOpen?: boolean;
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
  goalModeWeeklyChangeKg?: number;
  calorieGoalAdjustmentMode: string;
  rawManualGoal: number;
  adjustedManualGoal: number;
  activityMultiplier: number;
  bmrSource?: string;
  adaptiveActivitySeparate?: boolean;
  /** How calorie cycling set this day's goal (#2327), from the daily summary. */
  calorieCycling?: CalorieCyclingDay;
}
