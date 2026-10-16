import { apiFetch } from './apiClient';
import type { DailyGoals } from '../../types/goals';

/**
 * Fetches daily goals for a given date.
 */
export const fetchDailyGoals = async (date: string): Promise<DailyGoals> => {
  return apiFetch<DailyGoals>({
    endpoint: `/api/goals/for-date?date=${date}`,
    serviceName: 'Goals API',
    operation: 'fetch goals',
  });
};

/**
 * Fetches the resolved goal for every day in `[startDate, endDate]`, walking the same
 * `goal_date` timeline `fetchDailyGoals` resolves for a single day.
 */
export const fetchGoalsRange = async (
  startDate: string,
  endDate: string,
  adjust: boolean
): Promise<Record<string, DailyGoals>> => {
  return apiFetch<Record<string, DailyGoals>>({
    endpoint: `/api/goals/for-date?date=${startDate}&end_date=${endDate}&adjust=${adjust}`,
    serviceName: 'Goals API',
    operation: 'fetch goals range',
  });
};

/**
 * Saves the goals that take effect from `startDate`. `manage-timeline` replaces the
 * whole goal row, so callers pass the full goals (fetched values plus edits).
 */
export const saveDailyGoals = async (
  startDate: string,
  goals: DailyGoals,
  cascade: boolean
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: '/api/goals/manage-timeline',
    serviceName: 'Goals API',
    operation: 'save goals',
    method: 'POST',
    body: {
      p_start_date: startDate,
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
      p_caffeine_mg: goals.caffeine_mg,
      p_alcohol_g: goals.alcohol_g,
      p_target_exercise_calories_burned: goals.target_exercise_calories_burned,
      p_target_exercise_duration_minutes:
        goals.target_exercise_duration_minutes,
      p_target_steps: goals.target_steps,
      p_protein_percentage: goals.protein_percentage,
      p_carbs_percentage: goals.carbs_percentage,
      p_fat_percentage: goals.fat_percentage,
      p_breakfast_percentage: goals.breakfast_percentage,
      p_lunch_percentage: goals.lunch_percentage,
      p_dinner_percentage: goals.dinner_percentage,
      p_snacks_percentage: goals.snacks_percentage,
      custom_meal_percentages: goals.custom_meal_percentages,
      custom_nutrients: goals.custom_nutrients,
    },
  });
};
