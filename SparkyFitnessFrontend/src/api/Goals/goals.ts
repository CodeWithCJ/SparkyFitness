import { apiCall } from '@/services/api';
import type { ExpandedGoals } from '@/types/goals';

const PREDEFINED_GOAL_KEYS = [
  'id',
  'user_id',
  'preset_name',
  'calories',
  'protein',
  'carbs',
  'fat',
  'water_goal_ml',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'target_exercise_calories_burned',
  'target_exercise_duration_minutes',
  'protein_percentage',
  'carbs_percentage',
  'fat_percentage',
  'breakfast_percentage',
  'lunch_percentage',
  'dinner_percentage',
  'snacks_percentage',
  'created_at',
  'updated_at',
];

function flattenCustomNutrients<
  T extends { custom_nutrients?: Record<string, number> },
>(data: T): (T & Record<string, number>) | T {
  if (!data) return data;
  const { custom_nutrients, ...rest } = data;
  return { ...rest, ...custom_nutrients } as T & Record<string, number>;
}

function unflattenCustomNutrients<T extends Record<string, unknown>>(
  data: T
): T & { custom_nutrients: Record<string, number> } {
  if (!data) return data as T & { custom_nutrients: Record<string, number> };
  const custom_nutrients: Record<string, number> = {};
  const unflattened: Record<string, unknown> = {};

  Object.keys(data).forEach((key) => {
    if (PREDEFINED_GOAL_KEYS.includes(key)) {
      unflattened[key] = data[key];
    } else if (typeof data[key] === 'number') {
      custom_nutrients[key] = data[key] as number;
    } else {
      unflattened[key] = data[key]; // Preserve other non-numeric keys
    }
  });

  return { ...unflattened, custom_nutrients } as T & {
    custom_nutrients: Record<string, number>;
  };
}
export interface GoalPreset {
  id?: string;
  user_id?: string;
  preset_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_goal_ml: number;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
  target_exercise_calories_burned: number;
  target_exercise_duration_minutes: number;
  protein_percentage: number | null;
  carbs_percentage: number | null;
  fat_percentage: number | null;
  breakfast_percentage: number;
  lunch_percentage: number;
  dinner_percentage: number;
  snacks_percentage: number;
  custom_nutrients?: Record<string, number>;
}

export async function createGoalPreset(
  presetData: GoalPreset
): Promise<GoalPreset> {
  return apiCall('/goal-presets', {
    method: 'POST',
    body: unflattenCustomNutrients(
      presetData as unknown as Record<string, unknown>
    ),
  }).then(flattenCustomNutrients);
}

export async function getGoalPresets(): Promise<GoalPreset[]> {
  const data = await apiCall('/goal-presets', {
    method: 'GET',
  });
  return (data || []).map(flattenCustomNutrients);
}

export async function getGoalPresetById(id: string): Promise<GoalPreset> {
  return apiCall(`/goal-presets/${id}`, {
    method: 'GET',
  }).then(flattenCustomNutrients);
}

export async function updateGoalPreset(
  id: string,
  presetData: GoalPreset
): Promise<GoalPreset> {
  return apiCall(`/goal-presets/${id}`, {
    method: 'PUT',
    body: unflattenCustomNutrients(
      presetData as unknown as Record<string, unknown>
    ),
  }).then(flattenCustomNutrients);
}

export async function deleteGoalPreset(id: string): Promise<void> {
  return apiCall(`/goal-presets/${id}`, {
    method: 'DELETE',
  });
}

export interface WeeklyGoalPlan {
  id?: string;
  user_id?: string;
  plan_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  is_active: boolean;
  monday_preset_id: string | null;
  tuesday_preset_id: string | null;
  wednesday_preset_id: string | null;
  thursday_preset_id: string | null;
  friday_preset_id: string | null;
  saturday_preset_id: string | null;
  sunday_preset_id: string | null;
}

export async function createWeeklyGoalPlan(
  planData: WeeklyGoalPlan
): Promise<WeeklyGoalPlan> {
  return apiCall('/weekly-goal-plans', {
    method: 'POST',
    body: planData,
  });
}

export async function getWeeklyGoalPlans(): Promise<WeeklyGoalPlan[]> {
  return apiCall('/weekly-goal-plans', {
    method: 'GET',
  });
}

export async function getActiveWeeklyGoalPlan(
  date: string
): Promise<WeeklyGoalPlan | null> {
  return apiCall(`/weekly-goal-plans/active?date=${date}`, {
    method: 'GET',
  });
}

export async function updateWeeklyGoalPlan(
  id: string,
  planData: WeeklyGoalPlan
): Promise<WeeklyGoalPlan> {
  return apiCall(`/weekly-goal-plans/${id}`, {
    method: 'PUT',
    body: planData,
  });
}

export async function deleteWeeklyGoalPlan(id: string): Promise<void> {
  return apiCall(`/weekly-goal-plans/${id}`, {
    method: 'DELETE',
  });
}

export const loadGoals = async (
  selectedDate: string
): Promise<ExpandedGoals> => {
  const params = new URLSearchParams({ date: selectedDate });
  const data = await apiCall(`/goals/for-date?${params.toString()}`, {
    method: 'GET',
  });
  return flattenCustomNutrients(
    data || {
      calories: 2000,
      protein: 150,
      carbs: 250,
      fat: 67,
      water_goal_ml: 1920, // Default to 1920ml (8 glasses)
      saturated_fat: 20,
      polyunsaturated_fat: 10,
      monounsaturated_fat: 25,
      trans_fat: 0,
      cholesterol: 300,
      sodium: 2300,
      potassium: 3500,
      dietary_fiber: 25,
      sugars: 50,
      vitamin_a: 900,
      vitamin_c: 90,
      calcium: 1000,
      iron: 18,
      target_exercise_calories_burned: 0,
      target_exercise_duration_minutes: 0,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
      breakfast_percentage: 25,
      lunch_percentage: 25,
      dinner_percentage: 25,
      snacks_percentage: 25,
    }
  );
};

export const saveGoals = async (
  selectedDate: string,
  goals: ExpandedGoals,
  cascade: boolean
): Promise<void> => {
  const unflattened = unflattenCustomNutrients(goals);
  const { custom_nutrients, ...rest } = unflattened;

  await apiCall('/goals/manage-timeline', {
    method: 'POST',
    body: {
      p_start_date: selectedDate,
      p_cascade: cascade,
      p_calories: goals.calories,
      p_protein: goals.protein,
      p_carbs: goals.carbs,
      p_fat: goals.fat,
      p_water_goal_ml: goals.water_goal_ml,
      p_saturated_fat: goals.saturated_fat,
      p_polyunsaturated_fat: goals.polyunsaturated_fat,
      p_monounsaturated_fat: goals.monounsaturated_fat,
      p_trans_fat: goals.trans_fat,
      p_cholesterol: goals.cholesterol,
      p_sodium: goals.sodium,
      p_potassium: goals.potassium,
      p_dietary_fiber: goals.dietary_fiber,
      p_sugars: goals.sugars,
      p_vitamin_a: goals.vitamin_a,
      p_vitamin_c: goals.vitamin_c,
      p_calcium: goals.calcium,
      p_iron: goals.iron,
      p_target_exercise_calories_burned: goals.target_exercise_calories_burned,
      p_target_exercise_duration_minutes:
        goals.target_exercise_duration_minutes,
      p_protein_percentage: goals.protein_percentage,
      p_carbs_percentage: goals.carbs_percentage,
      p_fat_percentage: goals.fat_percentage,
      p_breakfast_percentage: goals.breakfast_percentage,
      p_lunch_percentage: goals.lunch_percentage,
      p_dinner_percentage: goals.dinner_percentage,
      p_snacks_percentage: goals.snacks_percentage,
      custom_nutrients,
    },
  });
};
