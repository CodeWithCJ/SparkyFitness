import type { MealIngredientDraft } from '../types/meals';

export interface RecipeImportPickerTarget {
  draftKey: string;
  ingredientId: string;
  quantity: number | null;
  unit: string | null;
}
let pending: {
  target: RecipeImportPickerTarget;
  ingredient: MealIngredientDraft;
} | null = null;
export function setPendingRecipeImportSelection(
  target: RecipeImportPickerTarget,
  ingredient: MealIngredientDraft
) {
  pending = { target, ingredient };
}
export function consumePendingRecipeImportSelection() {
  const result = pending;
  pending = null;
  return result;
}
