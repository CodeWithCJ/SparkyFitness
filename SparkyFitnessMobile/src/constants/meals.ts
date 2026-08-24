import { defaultMealTypeForTime } from '@workspace/shared';
import type { IconName } from '../components/Icon';
import type { MealType } from '../types/mealTypes';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

export interface MealConfig {
  label: string;
  icon: IconName;
}

export const MEAL_CONFIG: Record<string, MealConfig> = {
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata fallback; visible callers localize known meal keys.
  breakfast: { label: 'Breakfast', icon: 'meal-breakfast' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata fallback; visible callers localize known meal keys.
  lunch: { label: 'Lunch', icon: 'meal-lunch' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata fallback; visible callers localize known meal keys.
  snacks: { label: 'Snacks', icon: 'meal-snack' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata fallback; visible callers localize known meal keys.
  dinner: { label: 'Dinner', icon: 'meal-dinner' },
  // i18n-audit-ignore-next-line hardcoded-ui-text -- canonical English metadata fallback; visible callers localize known meal keys.
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
  return 'snacks';
}

/**
 * Returns the display label for a meal type name. Known types use their
 * MEAL_CONFIG label, custom/unknown types fall back to the raw name.
 */
export function getMealTypeLabel(name: string): string {
  return MEAL_CONFIG[name.toLowerCase()]?.label ?? name;
}

/**
 * Returns the id of the best matching meal type based on the current time of day
 * and configured meal type default_time values.
 * Falls back to the first meal type's id, or null if the list is empty.
 */
export function getDefaultMealTypeId(
  mealTypes: MealType[],
  now?: { hour: number; minute: number }
): string | null {
  if (mealTypes.length === 0) return null;

  const date = new Date();
  const currentNow = now ?? { hour: date.getHours(), minute: date.getMinutes() };
  const predictedName = defaultMealTypeForTime(mealTypes, currentNow);
  const match = mealTypes.find(
    (mt) => mt.name.toLowerCase() === predictedName.toLowerCase()
  );
  return match?.id ?? mealTypes[0].id;
}

/** Localized label for a KNOWN system meal type key. Unknown/custom names are returned literally. */
export function getLocalizedMealLabel(t: (key: string, options: { defaultValue: string }) => string, key: string): string {
  switch (key) {
    case 'breakfast': return t('mealTypes.breakfast', { defaultValue: 'Breakfast' });
    case 'lunch': return t('mealTypes.lunch', { defaultValue: 'Lunch' });
    case 'snacks': return t('mealTypes.snacks', { defaultValue: 'Snacks' });
    case 'dinner': return t('mealTypes.dinner', { defaultValue: 'Dinner' });
    case 'other': return t('mealTypes.other', { defaultValue: 'Other' });
    default: return MEAL_CONFIG[key]?.label ?? key;
  }
}
