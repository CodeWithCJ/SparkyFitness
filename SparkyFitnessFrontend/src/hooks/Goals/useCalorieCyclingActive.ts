import {
  calorieCyclingPattern,
  isCalorieCyclingAvailable,
  todayInZone,
  type CalorieRules,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDailySummary } from '@/hooks/Diary/useDailyProgress';

export interface CalorieCyclingForDay {
  /** Cycling changes this day's goal once the form is saved. */
  active: boolean;
  /** The typed calories are the base cycling works from (not adaptive). */
  typedIsBase: boolean;
  /** Saving this calorie edit switches to a manual goal, which pauses cycling. */
  pausedBySave: boolean;
  offsets: number[] | null;
  floor: number | null;
  /** The server's cycled target for the day, for when the typed value is not the base. */
  serverTarget: { target: number; delta: number } | null;
}

const INACTIVE: CalorieCyclingForDay = {
  active: false,
  typedIsBase: false,
  pausedBySave: false,
  offsets: null,
  floor: null,
  serverTarget: null,
};

const isAdaptiveTarget = (rules: CalorieRules) =>
  rules.goal_mode_calculation_method === 'adaptive' ||
  rules.calorie_goal_adjustment_mode === 'adaptive';

/**
 * Calorie cycling (#2327) for the day a goal form edits, from that day's
 * settings and safety floor as the server resolved them, so a past day that
 * had cycling off is not labelled as a base target.
 */
export function useCalorieCyclingForDay(
  day: string,
  caloriesEdited: boolean
): CalorieCyclingForDay {
  const { goalMode, goalModeCalculationMethod, timezone } = usePreferences();
  const { data: summary } = useDailySummary(day);
  const rules = summary?.calorieInputs?.rules;
  const cycling = summary?.calorieCycling;
  const offsets = rules ? calorieCyclingPattern(rules) : null;

  if (!rules || !offsets || cycling?.status === 'paused_weekly_plan') {
    return INACTIVE;
  }

  // The forms switch today's settings to a manual maintain goal when the
  // calories are edited. That only reaches days from today on: a past day
  // keeps the settings it had.
  const today = todayInZone(timezone || 'UTC');
  const saveSwitchesToManual =
    caloriesEdited &&
    day >= today &&
    (goalModeCalculationMethod === 'adaptive' || goalMode !== 'maintain');
  const rulesAfterSave: CalorieRules = saveSwitchesToManual
    ? { ...rules, goal_mode_calculation_method: 'manual' }
    : rules;
  const availableNow = isCalorieCyclingAvailable(rules);
  const availableAfterSave = isCalorieCyclingAvailable(rulesAfterSave);

  return {
    active: availableNow && availableAfterSave,
    typedIsBase:
      availableNow && availableAfterSave && !isAdaptiveTarget(rulesAfterSave),
    pausedBySave: availableNow && !availableAfterSave,
    offsets,
    floor: cycling?.floor ?? null,
    serverTarget:
      cycling?.status === 'active' && !caloriesEdited
        ? { target: cycling.target, delta: cycling.delta }
        : null,
  };
}
