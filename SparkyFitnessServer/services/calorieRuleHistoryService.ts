import { withCalorieRuleDefaults } from '@workspace/shared';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import type { CalorieRuleHistoryRow } from '../models/calorieRuleHistoryRepository.js';

/**
 * The calorie settings in force on `day`: the latest history row on or before
 * it, else null (no change recorded before that day, so the current settings
 * apply). `history` is oldest first.
 */
export function calorieRulesOnDay(
  history: readonly CalorieRuleHistoryRow[],
  day: string
): CalorieRuleHistoryRow | null {
  let found: CalorieRuleHistoryRow | null = null;
  for (const row of history) {
    if (row.effective_date !== '-infinity' && row.effective_date > day) break;
    found = row;
  }
  return found;
}

/**
 * `preferences` with the calorie settings replaced by those in force on `day`,
 * and an unset one by its default: the same values the Diary is shown.
 */
export function preferencesOnDay<T extends object>(
  preferences: T,
  history: readonly CalorieRuleHistoryRow[],
  day: string
): T {
  return {
    ...preferences,
    ...withCalorieRuleDefaults(calorieRulesOnDay(history, day) ?? preferences),
  };
}

/**
 * Loads the history for a range and returns a lookup of each day's
 * preferences, so a past day keeps the calorie target it was logged against
 * (#1795). Null preferences stay null.
 */
export async function loadPreferencesByDay<T extends object>(
  userId: string,
  preferences: T | null | undefined,
  startDate: string,
  endDate: string
): Promise<(day: string) => T | null> {
  if (!preferences) return () => null;
  const history = await calorieRuleHistoryRepository.getCalorieRuleHistory(
    userId,
    startDate,
    endDate
  );
  return (day) => preferencesOnDay(preferences, history, day);
}

export default {
  calorieRulesOnDay,
  preferencesOnDay,
  loadPreferencesByDay,
};
