import {
  computeExerciseCredited,
  type CalorieBalance,
  type NutrientGoalPreferenceEntry,
} from '@workspace/shared';

export function getCalorieBudget(
  balance: Pick<CalorieBalance, 'goal' | 'eaten' | 'remaining'>,
  preference?: NutrientGoalPreferenceEntry
): number {
  if (
    preference?.goalType === 'target' &&
    preference.targetMin != null &&
    preference.targetMax != null
  ) {
    return (
      preference.targetMax +
      computeExerciseCredited(balance.remaining, balance.goal, balance.eaten)
    );
  }

  return balance.eaten + balance.remaining;
}
