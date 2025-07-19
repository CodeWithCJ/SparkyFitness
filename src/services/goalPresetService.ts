import { apiCall } from './api';

export interface GoalPreset {
  id?: string;
  user_id?: string;
  preset_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_goal: number;
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
}

export async function createGoalPreset(presetData: GoalPreset): Promise<GoalPreset> {
  return apiCall('/goal-presets', {
    method: 'POST',
    body: JSON.stringify(presetData),
  });
}

export async function getGoalPresets(): Promise<GoalPreset[]> {
  return apiCall('/goal-presets', {
    method: 'GET',
  });
}

export async function getGoalPresetById(id: string): Promise<GoalPreset> {
  return apiCall(`/goal-presets/${id}`, {
    method: 'GET',
  });
}

export async function updateGoalPreset(id: string, presetData: GoalPreset): Promise<GoalPreset> {
  return apiCall(`/goal-presets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(presetData),
  });
}

export async function deleteGoalPreset(id: string): Promise<void> {
  return apiCall(`/goal-presets/${id}`, {
    method: 'DELETE',
  });
}