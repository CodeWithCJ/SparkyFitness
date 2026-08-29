import type { Meal } from '../types/meals';
import type {
  MealPlanDraft,
  MealPlanDraftAssignment,
  MealPlanTemplate,
  MealPlanValidationErrors,
  SaveMealPlanPayload,
} from '../types/mealPlans';

function calendarDay(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? '';
}

export function createMealAssignment(
  meal: Meal,
  mealTypeId: string,
  dayOfWeek: number,
): MealPlanDraftAssignment {
  return {
    item_type: 'meal',
    day_of_week: dayOfWeek,
    meal_type_id: mealTypeId,
    meal_id: meal.id,
    meal_name: meal.name,
    quantity: meal.serving_size,
    quantityText: String(meal.serving_size),
    unit: meal.serving_unit,
  };
}

export function createMealPlanDraft(
  today: string,
  template?: MealPlanTemplate,
): MealPlanDraft {
  if (!template) {
    return {
      planName: '',
      description: '',
      startDate: today,
      endDate: '',
      isActive: true,
      assignments: [],
    };
  }

  return {
    planName: template.plan_name,
    description: template.description ?? '',
    startDate: calendarDay(template.start_date),
    endDate: calendarDay(template.end_date),
    isActive: template.is_active,
    assignments: template.assignments.map((assignment) => {
      const amount =
        assignment.quantity != null && assignment.unit
          ? { quantity: assignment.quantity, unit: assignment.unit }
          : { quantity: 1, unit: 'serving' };
      return {
        ...assignment,
        ...amount,
        quantityText: String(amount.quantity),
      };
    }),
  };
}

function assignmentIsValid(assignment: MealPlanDraftAssignment): boolean {
  const itemId = assignment.item_type === 'meal' ? assignment.meal_id : assignment.food_id;
  return (
    Number.isInteger(assignment.day_of_week) &&
    assignment.day_of_week >= 0 &&
    assignment.day_of_week <= 6 &&
    assignment.meal_type_id.trim().length > 0 &&
    typeof itemId === 'string' &&
    itemId.length > 0 &&
    Number.isFinite(assignment.quantity) &&
    assignment.quantity > 0 &&
    assignment.unit.trim().length > 0
  );
}

export function validateMealPlanDraft(draft: MealPlanDraft): MealPlanValidationErrors {
  const errors: MealPlanValidationErrors = {};
  if (!draft.planName.trim()) errors.planName = 'required';
  if (!draft.startDate) errors.startDate = 'required';
  if (draft.endDate && draft.startDate && draft.endDate < draft.startDate) {
    errors.endDate = 'beforeStart';
  }
  if (draft.assignments.length === 0 || draft.assignments.some((item) => !assignmentIsValid(item))) {
    errors.assignments = 'invalid';
  }
  return errors;
}

export function buildMealPlanPayload(draft: MealPlanDraft): SaveMealPlanPayload {
  return {
    plan_name: draft.planName.trim(),
    description: draft.description.trim() || null,
    start_date: draft.startDate,
    end_date: draft.endDate || null,
    is_active: draft.isActive,
    assignments: draft.assignments.map((assignment) => {
      const payload = { ...assignment };
      delete payload.quantityText;
      return payload;
    }),
  };
}
