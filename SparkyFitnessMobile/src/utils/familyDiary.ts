import type { FoodEntry } from '../types/foodEntries';

export interface FamilyMealGroup {
  key: string;
  mealTypeId: string | null;
  mealTypeName: string;
  entries: FoodEntry[];
}

export interface FamilyCopySelection {
  entry: FoodEntry;
  quantity: number;
}

export interface FamilyCopyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function familyDiaryUserName(
  user: { displayName: string },
  fallback: string,
): string {
  return user.displayName.trim() || fallback;
}

export function groupFamilyFoodEntries(
  entries: FoodEntry[],
): FamilyMealGroup[] {
  const groups = new Map<string, FamilyMealGroup>();

  for (const entry of entries) {
    const key = entry.meal_type_id ?? `legacy:${entry.meal_type.toLowerCase()}`;
    const current = groups.get(key);
    if (current) {
      current.entries.push(entry);
    } else {
      groups.set(key, {
        key,
        mealTypeId: entry.meal_type_id ?? null,
        mealTypeName: entry.meal_type,
        entries: [entry],
      });
    }
  }

  return [...groups.values()];
}

function nutrientForQuantity(
  entry: FoodEntry,
  field: 'calories' | 'protein' | 'carbs' | 'fat',
  quantity: number,
): number {
  const servingSize = Number(entry.serving_size);
  const nutrient = Number(entry[field] ?? 0);
  return servingSize > 0 ? (nutrient * quantity) / servingSize : 0;
}

export function calculateFamilyCopyTotals(
  selections: FamilyCopySelection[],
): FamilyCopyTotals {
  return selections.reduce<FamilyCopyTotals>(
    (totals, { entry, quantity }) => {
      totals.calories += nutrientForQuantity(entry, 'calories', quantity);
      totals.protein += nutrientForQuantity(entry, 'protein', quantity);
      totals.carbs += nutrientForQuantity(entry, 'carbs', quantity);
      totals.fat += nutrientForQuantity(entry, 'fat', quantity);
      return totals;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function isUnchangedWholeMeal(
  sourceEntries: FoodEntry[],
  selectedEntryIds: Set<string>,
  quantitiesById: Record<string, number>,
): boolean {
  if (sourceEntries.length !== selectedEntryIds.size) return false;

  return sourceEntries.every(entry => {
    if (!selectedEntryIds.has(entry.id)) return false;
    const selectedQuantity = quantitiesById[entry.id];
    return (
      Number.isFinite(entry.quantity) &&
      entry.quantity > 0 &&
      Number.isFinite(selectedQuantity) &&
      selectedQuantity > 0 &&
      Math.abs(selectedQuantity - entry.quantity) <= 1e-9
    );
  });
}
