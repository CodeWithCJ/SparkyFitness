import { getMicronutrientById, normalizeNutrientName } from '@workspace/shared';
import type { UserCustomNutrient } from '@/types/customNutrient';

/**
 * A nutrient row the user chose in the picker, before anything exists server-side.
 *
 * Nothing is created when a nutrient is picked — only when the supplement is SAVED.
 * Picking used to seed `user_custom_nutrients` immediately, which meant a mis-click on
 * "Multivitamin panel" followed by Cancel still left 20 custom nutrients (and their
 * display-preference and goal rows) behind permanently.
 *
 * `catalogId` marks a canonical catalog nutrient that must be find-or-created on save;
 * `isNew` a free-text one. Neither set means the key is already storable as-is (a fixed
 * food-variant column, or a custom nutrient the user already has).
 */
export interface NutrientPick {
  /** the key to store the value against (provisional for catalog/free-text picks) */
  key: string;
  unit: string;
  catalogId?: string;
  isNew?: boolean;
}

/**
 * Every name the rows already in the supplement editor answer to: each row's own key,
 * plus the aliases of the custom nutrient behind it.
 *
 * Aliases matter because the server resolves a catalog pick onto a matching alias — a
 * user who tracks "Vit D" (alias "Vitamin D3") already HAS the catalog's "Vitamin D".
 */
export function collectClaimedNutrientNames(
  selected: string[],
  customNutrients?: UserCustomNutrient[]
): Set<string> {
  const claimed = new Set<string>();
  for (const key of selected) {
    claimed.add(normalizeNutrientName(key));
    const custom = customNutrients?.find((nutrient) => nutrient.name === key);
    for (const alias of custom?.aliases ?? []) {
      claimed.add(normalizeNutrientName(alias));
    }
  }
  return claimed;
}

/**
 * A picker option is unavailable once the editor holds a row that answers to any of its
 * names — its field key, its canonical name, or (for a catalog entry) any of its aliases.
 *
 * Without the alias arm the picker would offer a nutrient the user already tracks under
 * their own spelling, and adding it would silently do nothing.
 */
export function isNutrientOptionAlreadyAdded(
  option: { label: string; fieldKey?: string; catalogId?: string },
  selected: string[],
  claimedNames: Set<string>
): boolean {
  if (option.fieldKey && selected.includes(option.fieldKey)) return true;
  const names = [option.label];
  if (option.catalogId) {
    const entry = getMicronutrientById(option.catalogId);
    if (entry) names.push(...entry.aliases);
  }
  return names.some((name) => claimedNames.has(normalizeNutrientName(name)));
}
