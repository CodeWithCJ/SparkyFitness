import {
  calorieCyclingPattern,
  isCalorieCyclingAvailable,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';

/**
 * Whether calorie cycling (#2327) changes the calorie goal typed into a goal
 * form. When it does, the typed number is the base target and the label says so.
 */
export function useCalorieCyclingActive(): boolean {
  const {
    calorieCyclingMode,
    calorieCyclingOffsets,
    calorieGoalAdjustmentMode,
    goalModeCalculationMethod,
    adaptiveActivitySeparate,
  } = usePreferences();
  return (
    calorieCyclingPattern({
      calorie_cycling_mode: calorieCyclingMode,
      calorie_cycling_offsets: calorieCyclingOffsets,
    }) !== null &&
    isCalorieCyclingAvailable({
      calorie_goal_adjustment_mode: calorieGoalAdjustmentMode,
      goal_mode_calculation_method: goalModeCalculationMethod,
      adaptive_activity_separate: adaptiveActivitySeparate,
    })
  );
}
