import { getLocalizedMealLabel } from '../constants/meals';
import type { TFunction } from 'i18next';
import type { FoodEntry } from '../types/foodEntries';
import type { FoodDisplayValues } from './foodDetails';
import type { DailyGoals } from '../types/goals';
import type { MealType } from '../types/mealTypes';
import { calculateCustomNutrientTotals } from '../services/api/foodEntriesApi';

export type MealTypeKey = string;

export interface MealGroup {
  mealTypeId: string | null;
  name: string;
  sortOrder: number;
  entries: FoodEntry[];
  isSystem: boolean;
}

export interface EntryNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Single source of truth for a KNOWN meal type's display label.
 *
 * The decision is based on ownership metadata, never on the name string alone:
 * - `user_id === null` (system)  → localized label via mealTypes.* (app language).
 * - `user_id !== null` (custom)  → the literal user-defined name.
 *
 * A custom category called "breakfast", "lunch", "dinner", "snack" or
 * "other" therefore always renders its literal name.
 */
export function getMealTypeDisplayLabel(
  mealType: Pick<MealType, 'name' | 'user_id'>,
  t: TFunction,
): string {
  if (mealType.user_id != null) return mealType.name;
  const lower = mealType.name.toLowerCase();
  const key = lower === 'snack' ? 'snacks' : lower;
  return getLocalizedMealLabel(t, key);
}

/**
 * Fallback label for a HISTORICAL entry whose meal type definition is not
 * present in the active list (deleted, hidden, or an older server). The
 * snapshotted name is returned literally — never auto-translated just because
 * it happens to read "breakfast" — and only entries with no name at all fall
 * back to "Other".
 */
export function getHistoricalMealTypeLabel(
  name: string | null | undefined,
  t: TFunction,
): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return t('mealTypes.other', { defaultValue: 'Other' });
  return trimmed;
}

/**
 * Resolves the display label for a FOOD ENTRY by canonical id first, falling
 * back to name-only resolution only when the entry has no `meal_type_id`.
 * An id that exists but no longer resolves (deleted/hidden custom type) keeps
 * its literal historical name instead of being rematched to an active type
 * that merely shares the name.
 */
export function getFoodEntryMealTypeLabel(
  entry: { meal_type_id?: string | null; meal_type?: string | null },
  mealTypes: MealType[],
  t: TFunction,
): string {
  if (entry.meal_type_id) {
    const mt = mealTypes.find((m) => m.id === entry.meal_type_id);
    if (mt) return getMealTypeDisplayLabel(mt, t);
    return getHistoricalMealTypeLabel(entry.meal_type, t);
  }
  // No id: legacy name matching may occur (pre-id servers). Resolve against
  // the active list with ownership-aware display; blank names stay literal.
  const name = ((entry.meal_type || '') as string).toLowerCase();
  if (name) {
    const mt = mealTypes.find((m) => m.name.toLowerCase() === name);
    if (mt) return getMealTypeDisplayLabel(mt, t);
  }
  return getHistoricalMealTypeLabel(entry.meal_type, t);
}

export function groupFoodEntriesByMealType(
  entries: FoodEntry[],
  mealTypes: MealType[],
): MealGroup[] {
  const typeMap = new Map<string, MealType>();
  for (const mt of mealTypes) {
    typeMap.set(mt.id, mt);
  }

  const groupMap = new Map<string, { entries: FoodEntry[]; mt: MealType | null }>();
  // Unmatched entries (hidden/deleted/legacy types) are grouped by their own
  // id when present, else by their snapshotted name, so two different unknown
  // types never collapse into a single "Other" bucket. Only entries with no
  // id and no name fall through to the synthetic "other" group.
  const fallbackGroups = new Map<
    string,
    { entries: FoodEntry[]; mealTypeId: string | null; name: string }
  >();

  for (const entry of entries) {
    let matched: MealType | null = null;
    if (entry.meal_type_id) {
      // The id is canonical: resolve by id only. When it exists but does not
      // resolve (deleted/hidden custom type), the entry falls through to the
      // id-based historical fallback below — it is NEVER rematched to an
      // active type that merely shares the name (a deleted custom "breakfast"
      // must not merge into the system Breakfast group).
      matched = typeMap.get(entry.meal_type_id) ?? null;
    } else {
      // Name-based matching is allowed only for entries without an id (legacy
      // servers / pre-id records).
      const name = ((entry.meal_type || 'other') as string).toLowerCase();
      matched = mealTypes.find((m) => m.name.toLowerCase() === name) ?? null;
    }
    if (matched) {
      const key = matched.id;
      if (!groupMap.has(key)) {
        groupMap.set(key, { entries: [], mt: matched });
      }
      groupMap.get(key)!.entries.push(entry);
    } else {
      // Blank names normalize to the synthetic "Other" group (display name
      // capitalized, key normalized to lowercase) so the detail screen's
      // `filterFoodEntriesByMealTypeId(..., 'other', ...)` matches.
      const fallbackName =
        entry.meal_type && entry.meal_type.trim() ? entry.meal_type : 'Other';
      const key = entry.meal_type_id
        ? `id:${entry.meal_type_id}`
        : `name:${fallbackName.toLowerCase()}`;
      if (!fallbackGroups.has(key)) {
        fallbackGroups.set(key, {
          entries: [],
          mealTypeId: entry.meal_type_id ?? null,
          name: fallbackName,
        });
      }
      fallbackGroups.get(key)!.entries.push(entry);
    }
  }

  const result: MealGroup[] = [];
  for (const mt of mealTypes) {
    const group = groupMap.get(mt.id);
    if (group) {
      result.push({
        mealTypeId: mt.id,
        name: mt.name,
        sortOrder: mt.sort_order ?? 999,
        entries: group.entries,
        isSystem: mt.user_id === null,
      });
    }
  }

  if (fallbackGroups.size > 0) {
    for (const group of fallbackGroups.values()) {
      result.push({
        mealTypeId: group.mealTypeId,
        name: group.name,
        sortOrder: 9999,
        entries: group.entries,
        isSystem: false,
      });
    }
  }

  return result.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Display label for a grouped section. System groups (isSystem === true) use
 * the canonical MEAL_CONFIG label; every fallback/historical group
 * (isSystem === false) keeps its literal snapshotted name. Consumers branch on
 * `isSystem` — never on the raw name — so a deleted custom type named
 * "breakfast" never renders as the translated system "Breakfast".
 */
export function getMealGroupLabel(
  group: MealGroup,
  t: TFunction,
): string {
  if (group.isSystem) {
    const lower = group.name.toLowerCase();
    const key = lower === 'snack' ? 'snacks' : lower;
    return getLocalizedMealLabel(t, key);
  }
  return getHistoricalMealTypeLabel(group.name, t);
}

/**
 * Filters entries by canonical meal type ID first, falling back to the
 * (snapshotted) name only for historical entries or older servers that do not
 * send `meal_type_id`. Two categories that share the same name but have
 * different IDs are never mixed: entries carrying an ID always match by ID.
 * Blank historical names are normalized to "other" so the synthetic Other
 * bucket and its detail screen stay in sync.
 */
export function filterFoodEntriesByMealTypeId(
  entries: FoodEntry[],
  mealTypeId: string | null | undefined,
  mealTypeName: string,
  mealTypes: MealType[],
): FoodEntry[] {
  const nameLower = mealTypeName.toLowerCase();
  return entries.filter((entry) => {
    if (entry.meal_type_id) {
      if (mealTypeId) return entry.meal_type_id === mealTypeId;
      return ((entry.meal_type && entry.meal_type.trim() ? entry.meal_type : 'other') as string).toLowerCase() === nameLower;
    }
    // Entry has no id: resolve its type by name against the active list first.
    const entryName = ((entry.meal_type && entry.meal_type.trim() ? entry.meal_type : 'other') as string).toLowerCase();
    if (mealTypeId) {
      const mt = mealTypes.find((m) => m.name.toLowerCase() === entryName);
      return mt ? mt.id === mealTypeId : false;
    }
    return entryName === nameLower;
  });
}

export function calculateEntryValue(value: number | undefined, entry: FoodEntry): number {
  if (value === undefined || !entry.serving_size) return 0;
  return (value * entry.quantity) / entry.serving_size;
}

export function calculateEntryNutrition(entry: FoodEntry): EntryNutrition {
  return {
    calories: Math.round(calculateEntryValue(entry.calories, entry)),
    protein: Math.round(calculateEntryValue(entry.protein, entry)),
    carbs: Math.round(calculateEntryValue(entry.carbs, entry)),
    fat: Math.round(calculateEntryValue(entry.fat, entry)),
  };
}

function sumField(entries: FoodEntry[], field: keyof FoodEntry): number {
  return entries.reduce((sum, entry) => {
    const value = entry[field];
    return typeof value === 'number'
      ? sum + calculateEntryValue(value, entry)
      : sum;
  }, 0);
}

function optionalSum(entries: FoodEntry[], field: keyof FoodEntry): number | undefined {
  const hasValue = entries.some((entry) => typeof entry[field] === 'number');
  return hasValue ? Math.round(sumField(entries, field)) : undefined;
}

/** Result type for calculateMealNutrition — standard display values plus custom nutrient aggregates. */
export interface MealNutrition {
  values: FoodDisplayValues;
  /** Aggregated custom nutrient totals across all entries (name → total consumed). */
  customNutrients: Record<string, number>;
}

export function calculateMealNutrition(entries: FoodEntry[]): MealNutrition {
  return {
    values: {
      servingSize: 1,
      servingUnit: 'meal',
      calories: Math.round(sumField(entries, 'calories')),
      protein: Math.round(sumField(entries, 'protein')),
      carbs: Math.round(sumField(entries, 'carbs')),
      fat: Math.round(sumField(entries, 'fat')),
      fiber: optionalSum(entries, 'dietary_fiber'),
      saturatedFat: optionalSum(entries, 'saturated_fat'),
      sodium: optionalSum(entries, 'sodium'),
      sugars: optionalSum(entries, 'sugars'),
      transFat: optionalSum(entries, 'trans_fat'),
      potassium: optionalSum(entries, 'potassium'),
      calcium: optionalSum(entries, 'calcium'),
      iron: optionalSum(entries, 'iron'),
      cholesterol: optionalSum(entries, 'cholesterol'),
      vitaminA: optionalSum(entries, 'vitamin_a'),
      vitaminC: optionalSum(entries, 'vitamin_c'),
    },
    customNutrients: calculateCustomNutrientTotals(entries),
  };
}

export function getMealPercentage(mealName: string, goals?: DailyGoals): number {
  if (!goals) return 0;

  const key = mealName.toLowerCase();

  if (goals.custom_meal_percentages) {
    if (key in goals.custom_meal_percentages) {
      return goals.custom_meal_percentages[key] ?? 0;
    }
    const altKey = key.includes('_') ? key.replace(/_/g, ' ') : key.replace(/ /g, '_');
    if (altKey in goals.custom_meal_percentages) {
      return goals.custom_meal_percentages[altKey] ?? 0;
    }
  }

  const legacyKey = `${key}_percentage` as keyof DailyGoals;
  if (legacyKey in goals && typeof goals[legacyKey] === 'number') {
    return (goals[legacyKey] as number) ?? 0;
  }
  const altLegacyKey = `${key.replace(/ /g, '_')}_percentage` as keyof DailyGoals;
  if (altLegacyKey in goals && typeof goals[altLegacyKey] === 'number') {
    return (goals[altLegacyKey] as number) ?? 0;
  }

  return 0;
}

/** Localized fallback for a historical system group. Non-system groups keep literal name. */
export function getLocalizedMealGroupLabel(
  group: Pick<MealGroup, 'name' | 'isSystem'>,
  t: TFunction,
): string {
  if (!group.isSystem) return getHistoricalMealTypeLabel(group.name, t);
  const key = group.name.toLowerCase() === 'snack' ? 'snacks' : group.name.toLowerCase();
  return getLocalizedMealLabel(t, key);
}
