import { MEAL_TYPES } from '../constants/meals';
import type { TFunction } from 'i18next';
import type { FoodEntry } from '../types/foodEntries';
import type { FoodDisplayValues } from './foodDetails';
import type { DailyGoals } from '../types/goals';
import type { MealType } from '../types/mealTypes';
import { calculateCustomNutrientTotals } from '../services/api/foodEntriesApi';

export type MealTypeKey = string;

export type MealEntryGroups = Record<string, FoodEntry[]>;

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

export function getMealTypeSystemKey(name: string): string {
  const lower = name.toLowerCase();
  if (lower === 'breakfast') return 'mealTypes.breakfast';
  if (lower === 'lunch') return 'mealTypes.lunch';
  if (lower === 'dinner') return 'mealTypes.dinner';
  if (lower === 'snacks' || lower === 'snack') return 'mealTypes.snacks';
  if (lower === 'other') return 'mealTypes.other';
  return '';
}

/**
 * Single source of truth for a meal type's display label.
 *
 * - System meal types resolve to their static i18n key (never a dynamic key).
 * - Custom and unknown/historical types render their literal name — the name
 *   is user data and is NEVER passed to `t()`.
 */
export function getMealTypeDisplayLabel(name: string, t: TFunction): string {
  switch (getMealTypeSystemKey(name)) {
    case 'mealTypes.breakfast':
      return t('mealTypes.breakfast');
    case 'mealTypes.lunch':
      return t('mealTypes.lunch');
    case 'mealTypes.dinner':
      return t('mealTypes.dinner');
    case 'mealTypes.snacks':
      return t('mealTypes.snacks');
    case 'mealTypes.other':
      return t('mealTypes.other');
    default:
      return name;
  }
}

export function getFoodEntryMealTypeKey(entry: FoodEntry, mealTypes: MealType[]): string {
  if (entry.meal_type_id) {
    const mt = mealTypes.find((m) => m.id === entry.meal_type_id);
    if (mt) return mt.name;
  }
  const name = (entry.meal_type || '').toLowerCase();
  if (name) {
    const mt = mealTypes.find((m) => m.name.toLowerCase() === name);
    if (mt) return mt.name;
  }
  if (MEAL_TYPES.includes(name as (typeof MEAL_TYPES)[number])) {
    return name;
  }
  return 'other';
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
      matched = typeMap.get(entry.meal_type_id) ?? null;
    }
    if (!matched) {
      const name = (entry.meal_type || '').toLowerCase();
      matched = mealTypes.find((m) => m.name.toLowerCase() === name) ?? null;
    }
    if (matched) {
      const key = matched.id;
      if (!groupMap.has(key)) {
        groupMap.set(key, { entries: [], mt: matched });
      }
      groupMap.get(key)!.entries.push(entry);
    } else {
      const fallbackName = entry.meal_type || 'other';
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

export function filterFoodEntriesByMealType(
  entries: FoodEntry[],
  mealTypeName: string,
  mealTypes: MealType[],
): FoodEntry[] {
  return entries.filter((entry) => {
    const key = getFoodEntryMealTypeKey(entry, mealTypes);
    return key.toLowerCase() === mealTypeName.toLowerCase();
  });
}

/**
 * Filters entries by canonical meal type ID first, falling back to the
 * (snapshotted) name only for historical entries or older servers that do not
 * send `meal_type_id`. Two categories that share the same name but have
 * different IDs are never mixed: entries carrying an ID always match by ID.
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
      return (entry.meal_type || '').toLowerCase() === nameLower;
    }
    // Entry has no id: resolve its type by name against the active list first.
    const entryName = (entry.meal_type || '').toLowerCase();
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

export interface MealNutrition {
  values: FoodDisplayValues;
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
