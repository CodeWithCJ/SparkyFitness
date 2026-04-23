import { MEAL_TYPES } from '../constants/meals';
import type { FoodEntry } from '../types/foodEntries';
import type { FoodDisplayValues } from './foodDetails';

export type MealTypeKey = (typeof MEAL_TYPES)[number] | 'other';

export type MealEntryGroups = Record<MealTypeKey, FoodEntry[]>;

export interface EntryNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function emptyMealGroups(): MealEntryGroups {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
    other: [],
  };
}

export function getFoodEntryMealTypeKey(entry: FoodEntry): MealTypeKey {
  const mealType = entry.meal_type?.toLowerCase() || 'snacks';
  return MEAL_TYPES.includes(mealType as (typeof MEAL_TYPES)[number])
    ? (mealType as MealTypeKey)
    : 'other';
}

export function groupFoodEntriesByMealType(entries: FoodEntry[]): MealEntryGroups {
  const grouped = emptyMealGroups();

  for (const entry of entries) {
    grouped[getFoodEntryMealTypeKey(entry)].push(entry);
  }

  return grouped;
}

export function filterFoodEntriesByMealType(entries: FoodEntry[], mealType: MealTypeKey): FoodEntry[] {
  const key = mealType.toLowerCase();
  return entries.filter((entry) => getFoodEntryMealTypeKey(entry) === key);
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

export function calculateMealNutrition(entries: FoodEntry[]): FoodDisplayValues {
  return {
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
  };
}
