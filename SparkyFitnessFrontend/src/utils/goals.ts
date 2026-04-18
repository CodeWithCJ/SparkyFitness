import { ExpandedGoals } from '@/types/goals';

export const getMealPercentage = (
  mealName: string,
  goals?: ExpandedGoals
): number => {
  if (!goals) return 0;

  const key = mealName.toLowerCase();

  if (goals.custom_meal_percentages && key in goals.custom_meal_percentages) {
    return goals.custom_meal_percentages[key] ?? 0;
  }

  const legacyKey = `${key}_percentage` as keyof ExpandedGoals;
  return (goals[legacyKey] as number) ?? 0;
};

export const buildGoalsPayload = (
  sliderValues: Record<string, number>,
  currentGoals: ExpandedGoals
): Partial<ExpandedGoals> => {
  const payload: Partial<ExpandedGoals> = {
    custom_meal_percentages: { ...currentGoals.custom_meal_percentages },
  };
  const defaultMeals = ['breakfast', 'lunch', 'dinner', 'snacks'];

  for (const [mealName, percentage] of Object.entries(sliderValues)) {
    const key = mealName.toLowerCase();

    if (defaultMeals.includes(key)) {
      payload[`${key}_percentage` as keyof ExpandedGoals] = percentage;
    } else {
      payload.custom_meal_percentages![key] = percentage;
    }
  }

  return payload;
};
