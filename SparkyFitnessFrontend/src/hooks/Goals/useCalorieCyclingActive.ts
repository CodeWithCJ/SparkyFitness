import {
  calorieCyclingPattern,
  isCalorieCyclingAvailable,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDailySummary } from '@/hooks/Diary/useDailyProgress';

export interface CalorieCyclingForDay {
  /** Cycling changes this day's goal, so the typed calories are the base target. */
  active: boolean;
  /** Saving this calorie edit switches to a manual goal, which pauses cycling. */
  pausedBySave: boolean;
  offsets: number[] | null;
  floor: number | null;
}

/**
 * Calorie cycling (#2327) for the day a goal form edits, from that day's
 * settings and safety floor as the server resolved them, so a past day that
 * had cycling off is not labelled as a base target.
 */
export function useCalorieCyclingForDay(
  day: string,
  caloriesEdited: boolean
): CalorieCyclingForDay {
  const { goalMode, goalModeCalculationMethod } = usePreferences();
  const { data: summary } = useDailySummary(day);
  const rules = summary?.calorieInputs?.rules;
  const status = summary?.calorieCycling?.status;
  const offsets = rules ? calorieCyclingPattern(rules) : null;

  if (!rules || !offsets || status === 'paused_weekly_plan') {
    return { active: false, pausedBySave: false, offsets: null, floor: null };
  }

  // Same condition the forms use to switch to a manual maintain goal on save.
  const saveSwitchesToManual =
    caloriesEdited &&
    (goalModeCalculationMethod === 'adaptive' || goalMode !== 'maintain');
  const availableNow = isCalorieCyclingAvailable(rules);
  const availableAfterSave = saveSwitchesToManual
    ? isCalorieCyclingAvailable({
        ...rules,
        goal_mode_calculation_method: 'manual',
      })
    : availableNow;

  return {
    active: availableNow && availableAfterSave,
    pausedBySave: availableNow && !availableAfterSave,
    offsets,
    floor: summary?.calorieCycling?.floor ?? null,
  };
}
