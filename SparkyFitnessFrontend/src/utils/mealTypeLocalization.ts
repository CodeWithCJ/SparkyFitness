import type { TFunction } from 'i18next';

const STANDARD_MEAL_KEYS: Readonly<Record<string, string>> = {
  breakfast: 'common.breakfast',
  lunch: 'common.lunch',
  dinner: 'common.dinner',
  snack: 'common.snacks',
  snacks: 'common.snacks',
};

export const getLocalizedMealTypeName = (
  mealName: string,
  t: TFunction
): string => {
  const trimmedName = mealName.trim();
  const translationKey = STANDARD_MEAL_KEYS[trimmedName.toLowerCase()];

  return translationKey ? t(translationKey) : trimmedName;
};
