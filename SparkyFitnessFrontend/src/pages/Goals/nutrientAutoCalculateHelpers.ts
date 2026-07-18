import { normalizeNutrientName } from '@workspace/shared';
import { getAutoCalculateFamily } from '@/services/nutrientCalculationService';
import type { NutrientGoalType } from '@/constants/nutrients';

// Recognized name variants for a user-created "Added Sugars" custom
// nutrient, matched case-insensitively and punctuation/whitespace-normalized
// (see normalizeNutrientName) against the nutrient's name and its aliases.
export const SUGAR_LIKE_NAMES = [
  'sugar',
  'sugars',
  'added sugar',
  'added sugars',
  'added_sugar',
  'added_sugars',
];

export function isSugarLikeName(name: string, aliases: string[] = []): boolean {
  const candidates = [name, ...aliases].map(normalizeNutrientName);
  return SUGAR_LIKE_NAMES.map(normalizeNutrientName).some((sugarAlias) =>
    candidates.includes(sugarAlias)
  );
}

/**
 * Whether a nutrient (predefined or custom) has any auto-calculate formula
 * available at all — used to decide whether to render the calculator icon
 * and bulk-select checkbox, and to build each surface's "Select All" list.
 */
export function isAutoCalculable(
  nutrientId: string,
  customNutrientAliases: string[] | undefined,
  goalType: NutrientGoalType | undefined
): boolean {
  return (
    getAutoCalculateFamily(nutrientId) !== null ||
    (goalType === 'maximum' &&
      isSugarLikeName(nutrientId, customNutrientAliases))
  );
}
