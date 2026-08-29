export type MealPlanItemType = 'food' | 'meal';

export interface MealPlanNutritionSnapshot {
  servingSize: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealPlanPickerTarget {
  dayOfWeek: number;
  mealTypeId: string;
  mealTypeName: string;
  assignmentIndex?: number;
}

export interface MealPlanAssignment {
  id?: string;
  day_of_week: number;
  meal_type_id: string;
  meal_type?: string | null;
  item_type: MealPlanItemType;
  meal_id?: string | null;
  meal_name?: string | null;
  food_id?: string | null;
  food_name?: string | null;
  variant_id?: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface MealPlanDraftAssignment extends Omit<MealPlanAssignment, 'quantity' | 'unit'> {
  quantity: number;
  quantityText?: string;
  unit: string;
  /** Client-only values used for live totals; never included in API payloads. */
  nutrition?: MealPlanNutritionSnapshot;
}

export interface MealPlanTemplate {
  id: string;
  user_id: string;
  plan_name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  assignments: MealPlanAssignment[];
  created_at?: string;
  updated_at?: string;
}

export interface SaveMealPlanPayload {
  plan_name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  assignments: Omit<MealPlanDraftAssignment, 'quantityText' | 'nutrition'>[];
}

export interface MealPlanDraft {
  planName: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  assignments: MealPlanDraftAssignment[];
}

export interface MealPlanValidationErrors {
  planName?: 'required';
  startDate?: 'required';
  endDate?: 'beforeStart';
  assignments?: 'invalid';
}
