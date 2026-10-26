import type { CalorieTargetResult } from '@workspace/shared';

export interface AdaptiveTdeeData {
  tdee?: number;
  isFallback?: boolean;
  fallbackReason?: string;
  daysOfData?: number;
  avgIntake?: number;
  weightTrend?: number | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  // Derivation terms for the Active branch (see AdaptiveTdeeService).
  startWeightTrend?: number;
  endWeightTrend?: number;
  weightChangeKg?: number;
  daysInWindow?: number;
  windowStartDate?: string;
  windowEndDate?: string;
  dailyWeightChangeKg?: number;
  weightChangeCalories?: number;
  rawTdee?: number;
  wasClamped?: boolean;
  clampMin?: number;
  clampMax?: number;
  activityAdjustedTdee?: number;
  rawActivityAdjustedTdee?: number;
  averageActivityCalories?: number;
  activityDaysOfData?: number;
}

export interface CalorieTargetBreakdownProps {
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
  goalModeWeeklyChangeKg?: number;
  calorieGoalAdjustmentMode: string;
  rawManualGoal: number;
  adjustedManualGoal: number;
  activityMultiplier: number;
  bmrSource?: string;
  adaptiveActivitySeparate?: boolean;
}
