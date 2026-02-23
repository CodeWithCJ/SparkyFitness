import type { IconName } from '../components/Icon';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface MealConfig {
  label: string;
  icon: IconName;
}

export const MEAL_CONFIG: Record<string, MealConfig> = {
  breakfast: { label: 'Breakfast', icon: 'meal-breakfast' },
  lunch: { label: 'Lunch', icon: 'meal-lunch' },
  snack: { label: 'Snack', icon: 'meal-snack' },
  dinner: { label: 'Dinner', icon: 'meal-dinner' },
  other: { label: 'Other', icon: 'meal-snack' },
};

/**
 * Returns a default meal type based on the hour of day.
 * breakfast: before 11, lunch: 11-14, dinner: 15-19, snack: 20+
 */
export function getDefaultMealType(hour?: number): (typeof MEAL_TYPES)[number] {
  const h = hour ?? new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 20) return 'dinner';
  return 'snack';
}
