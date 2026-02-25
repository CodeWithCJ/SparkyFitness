import type { IconName } from '../components/Icon';
import type { MealType } from '../types/mealTypes';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface MealConfig {
  label: string;
  icon: IconName;
}

export const MEAL_CONFIG: Record<string, MealConfig> = {
  breakfast: { label: 'Breakfast', icon: 'meal-breakfast' },
  lunch: { label: 'Lunch', icon: 'meal-lunch' },
  snack: { label: 'Snack', icon: 'meal-snack' },
  snacks: { label: 'Snacks', icon: 'meal-snack' },
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

/**
 * Returns the display label for a meal type name. Known types use their
 * MEAL_CONFIG label, custom/unknown types fall back to the raw name.
 */
export function getMealTypeLabel(name: string): string {
  return MEAL_CONFIG[name.toLowerCase()]?.label ?? name;
}

/**
 * Returns the icon for a meal type name. Known types get their specific icon,
 * custom/unknown types fall back to 'meal-snack'.
 */
export function getMealTypeIcon(name: string): IconName {
  const key = name.toLowerCase();
  if (key === 'breakfast') return 'meal-breakfast';
  if (key === 'lunch') return 'meal-lunch';
  if (key === 'dinner') return 'meal-dinner';
  if (key === 'snack' || key === 'snacks') return 'meal-snack';
  return 'meal-snack';
}

/**
 * Returns the id of the best matching meal type based on the current time of day.
 * Falls back to the first meal type's id, or null if the list is empty.
 */
export function getDefaultMealTypeId(mealTypes: MealType[]): string | null {
  if (mealTypes.length === 0) return null;

  const defaultName = getDefaultMealType();
  const match = mealTypes.find((mt) => mt.name.toLowerCase().startsWith(defaultName));
  return match?.id ?? mealTypes[0].id;
}
