import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  resolveSupplementTotals,
  type FoodVariantNutrientField,
} from '@workspace/shared';
import type { DailySummary, MacroSummary } from '../types/dailySummary';
import type { FoodEntry } from '../types/foodEntries';

/**
 * Returns net carbs: `max(0, carbs - dietaryFiber)`.
 *
 * Floored at zero so an entry with over-reported fiber (fiber > carbs) does
 * not surface as a negative carb count. Mirrors the web implementation in
 * `SparkyFitnessFrontend/src/utils/nutrientUtils.ts` so behavior matches
 * across clients honoring the same `show_net_carbs` user preference.
 */
export const getNetCarbsValue = (
  carbs: number | null | undefined,
  dietaryFiber: number | null | undefined
): number => {
  const carbsValue = Number(carbs) || 0;
  const fiberValue = Number(dietaryFiber) || 0;
  return Math.max(0, carbsValue - fiberValue);
};

/** Adds/removes a nutrient key from a visible_nutrients list, idempotently. */
export const toggleNutrientVisibility = (
  current: string[],
  name: string,
  enabled: boolean
): string[] =>
  enabled
    ? current.includes(name)
      ? current
      : [...current, name]
    : current.filter((n) => n !== name);

/** A day's amount of one nutrient against its goal (undefined = no goal set). */
export interface DayNutrientAmount {
  consumed: number;
  goal?: number;
}

const isFixedNutrient = (key: string): key is FoodVariantNutrientField =>
  (FOOD_VARIANT_NUTRIENT_FIELDS as readonly string[]).includes(key);

/** Sum of one nutrient over the day's food entries, scaled to each serving. */
const foodEntriesTotal = (entries: FoodEntry[], key: string): number =>
  entries.reduce((total, entry) => {
    if (!entry.serving_size) return total;
    const value = entry[key as keyof FoodEntry];
    if (typeof value !== 'number') return total;
    return total + (value * entry.quantity) / entry.serving_size;
  }, 0);

/**
 * How much of a standard nutrient (`NUTRIENT_META` key) the day holds, and
 * its goal.
 *
 * Fields the summary already rolls up come from it, because they include
 * logged supplement doses; recomputing one from `foodEntries` would print a
 * different number from the macro card. Anything else is summed from the food
 * entries, which are food-only, so a fixed nutrient a supplement can carry has
 * its dose added back (#2145) or it shows less than Reports does.
 */
export function dayStandardNutrient(
  summary: DailySummary,
  key: string
): DayNutrientAmount {
  // The summary's own macro goals, not `goals`: they carry any adjustment
  // the day made to the plan, and are what the macro card shows.
  const rolledUp: Record<string, MacroSummary> = {
    protein: summary.protein,
    carbs: summary.carbs,
    fat: summary.fat,
    dietary_fiber: summary.fiber,
  };
  const macro = rolledUp[key];
  const supplements = resolveSupplementTotals(summary.supplementTotals);
  const consumed =
    macro?.consumed ??
    foodEntriesTotal(summary.foodEntries, key) +
      (isFixedNutrient(key) ? supplements[key] : 0);
  const goal =
    macro?.goal ??
    (summary.goals[key as keyof typeof summary.goals] as number | undefined);
  return { consumed, goal: goal && goal > 0 ? goal : undefined };
}

/** A custom (user-defined) nutrient's amount for the day, by its name. */
export function dayCustomNutrient(
  summary: DailySummary,
  name: string
): DayNutrientAmount {
  const goal = summary.customNutrientGoals[name];
  return {
    consumed: summary.customNutrientTotals[name] ?? 0,
    goal: goal && goal > 0 ? goal : undefined,
  };
}

/**
 * Applies a nutrient display preference to a list of rows: rows whose
 * `preferenceKey` is not in `visible` are dropped, and the rest are reordered
 * to follow `visible`. Rows without a key (derived rows such as Total Carbs)
 * stay where they are, and the kept rows reorder among the slots the keyed
 * rows occupied. With no preference the list is returned unchanged.
 */
export function applyNutrientDisplayPreference<
  T extends { preferenceKey?: string },
>(items: T[], visible: readonly string[] | undefined): T[] {
  if (!visible) return items;
  const rank = new Map(visible.map((key, index) => [key, index]));
  const kept = items.filter(
    (item) => item.preferenceKey === undefined || rank.has(item.preferenceKey)
  );
  const ordered = kept
    .filter((item) => item.preferenceKey !== undefined)
    .sort((a, b) => rank.get(a.preferenceKey!)! - rank.get(b.preferenceKey!)!);
  let next = 0;
  return kept.map((item) =>
    item.preferenceKey === undefined ? item : ordered[next++]!
  );
}
