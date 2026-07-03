import { fetchFoodEntryMealsByDate } from '../services/api/foodEntryMealsApi';
import type { FoodEntry } from '../types/foodEntries';
import type { FoodEntryMeal } from '../types/foodEntryMeals';

// Logged meals arrive from the daily summary as their individual component food
// entries (each tagged with food_entry_meal_id). Left as-is they double-count
// against the meal total, so consumers collapse the components into one entry per
// logged meal. Shared by useDailySummary (display) and Health Connect writeback
// (one HC record per logged meal, not per component).
//
// The collapsed entry has no `source` (logged meals are assembled manually in
// Sparky), so writeback always exports it — see the source filter in writeback.ts.

export function hasLoggedMealComponents(foodEntries: FoodEntry[]): boolean {
  return foodEntries?.some((entry) => !!entry?.food_entry_meal_id) ?? false;
}

export function loggedMealToFoodEntry(meal: FoodEntryMeal): FoodEntry {
  const quantity = Number(meal.quantity) > 0 ? Number(meal.quantity) : 1;

  return {
    id: meal.id,
    user_id: meal.user_id,
    meal_id: meal.meal_template_id ?? undefined,
    food_entry_meal_id: meal.id,
    meal_type: meal.meal_type,
    meal_type_id: meal.meal_type_id ?? undefined,
    quantity,
    unit: meal.unit,
    entry_date: meal.entry_date,
    food_name: meal.name,
    // serving_size === quantity so the consumed-amount scaling
    // (value * quantity / serving_size) returns the meal's own totals.
    serving_size: quantity,
    serving_unit: meal.unit,
    calories: meal.calories ?? 0,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    saturated_fat: meal.saturated_fat,
    polyunsaturated_fat: meal.polyunsaturated_fat,
    monounsaturated_fat: meal.monounsaturated_fat,
    trans_fat: meal.trans_fat,
    cholesterol: meal.cholesterol,
    sodium: meal.sodium,
    potassium: meal.potassium,
    dietary_fiber: meal.dietary_fiber,
    sugars: meal.sugars,
    vitamin_a: meal.vitamin_a,
    vitamin_c: meal.vitamin_c,
    calcium: meal.calcium,
    iron: meal.iron,
    glycemic_index: meal.glycemic_index,
    custom_nutrients: meal.custom_nutrients,
  };
}

export function collapseLoggedMealComponents(
  foodEntries: FoodEntry[],
  loggedMeals: FoodEntryMeal[],
): FoodEntry[] {
  if (!foodEntries) {
    return [];
  }
  if (!loggedMeals || loggedMeals.length === 0) {
    return foodEntries;
  }

  const mealById = new Map(loggedMeals.map((meal) => [meal.id, meal]));
  const addedMealIds = new Set<string>();
  const collapsedEntries: FoodEntry[] = [];

  for (const entry of foodEntries) {
    const loggedMealId = entry.food_entry_meal_id;
    if (!loggedMealId) {
      collapsedEntries.push(entry);
      continue;
    }

    const loggedMeal = mealById.get(loggedMealId);
    if (!loggedMeal) {
      collapsedEntries.push(entry);
      continue;
    }

    if (!addedMealIds.has(loggedMealId)) {
      collapsedEntries.push(loggedMealToFoodEntry(loggedMeal));
      addedMealIds.add(loggedMealId);
    }
  }

  for (const meal of loggedMeals) {
    if (!addedMealIds.has(meal.id)) {
      collapsedEntries.push(loggedMealToFoodEntry(meal));
    }
  }

  return collapsedEntries;
}

/**
 * Given a date and its raw daily-summary food entries, fetch the logged meals and
 * return the collapsed list (one entry per logged meal). On any fetch failure it
 * falls back to the raw entries. Used after `fetchDailySummary`.
 */
export async function resolveCollapsedFoodEntries(
  date: string,
  rawFoodEntries: FoodEntry[],
): Promise<FoodEntry[]> {
  if (!rawFoodEntries || !hasLoggedMealComponents(rawFoodEntries)) {
    return rawFoodEntries ?? [];
  }
  try {
    const loggedMeals = await fetchFoodEntryMealsByDate(date);
    return collapseLoggedMealComponents(rawFoodEntries, loggedMeals);
  } catch {
    return rawFoodEntries;
  }
}
