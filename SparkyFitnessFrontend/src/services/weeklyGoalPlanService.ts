import { apiCall } from './api';

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
    body: JSON.stringify(planData),
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
    body: JSON.stringify(planData),
  });
}

export async function deleteWeeklyGoalPlan(id: string): Promise<void> {
  return apiCall(`/weekly-goal-plans/${id}`, {
    method: 'DELETE',
  });
}
