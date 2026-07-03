import type { MealIngredientDraft } from '../types/meals';

interface PendingMealIngredientSelection {
  ingredient: MealIngredientDraft;
  ingredientIndex?: number;
}

let pendingSelection: PendingMealIngredientSelection | null = null;

export function setPendingMealIngredientSelection(
  selection: PendingMealIngredientSelection,
) {
  pendingSelection = selection;
}

export function consumePendingMealIngredientSelection() {
  const selection = pendingSelection;
  pendingSelection = null;
  return selection;
}
