import type { FoodInfoItem } from '../types/foodInfo';
import type { MealIngredientDraft } from '../types/meals';
import type {
  MealPlanDraftAssignment,
  MealPlanPickerTarget,
} from '../types/mealPlans';

interface PendingMealPlanSelection {
  assignment: MealPlanDraftAssignment;
  assignmentIndex?: number;
}

let pendingSelection: PendingMealPlanSelection | null = null;

export function setPendingMealPlanSelection(
  selection: PendingMealPlanSelection,
) {
  pendingSelection = selection;
}

export function consumePendingMealPlanSelection() {
  const selection = pendingSelection;
  pendingSelection = null;
  return selection;
}

export function buildMealPlanFoodAssignment(
  ingredient: MealIngredientDraft,
  target: MealPlanPickerTarget,
  quantityText = String(ingredient.quantity),
): MealPlanDraftAssignment {
  return {
    item_type: 'food',
    day_of_week: target.dayOfWeek,
    meal_type_id: target.mealTypeId,
    meal_type: target.mealTypeName,
    food_id: ingredient.food_id,
    food_name: ingredient.food_name,
    variant_id: ingredient.variant_id,
    quantity: ingredient.quantity,
    quantityText,
    unit: ingredient.unit,
    nutrition: {
      servingSize: ingredient.serving_size,
      calories: ingredient.calories,
      protein: ingredient.protein,
      carbs: ingredient.carbs,
      fat: ingredient.fat,
    },
  };
}

export function buildMealPlanMealAssignment(
  item: FoodInfoItem,
  target: MealPlanPickerTarget,
  quantity: number,
  quantityText: string,
): MealPlanDraftAssignment {
  return {
    item_type: 'meal',
    day_of_week: target.dayOfWeek,
    meal_type_id: target.mealTypeId,
    meal_type: target.mealTypeName,
    meal_id: item.id,
    meal_name: item.name,
    quantity,
    quantityText,
    unit: item.servingUnit,
    nutrition: {
      servingSize: item.servingSize,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    },
  };
}
