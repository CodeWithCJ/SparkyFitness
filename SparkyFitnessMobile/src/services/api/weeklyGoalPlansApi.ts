import { apiFetch } from './apiClient';
import type { WeeklyGoalPlan } from '../../types/goals';

export const fetchWeeklyGoalPlans = async (): Promise<WeeklyGoalPlan[]> => {
  const plans = await apiFetch<WeeklyGoalPlan[] | null>({
    endpoint: '/api/weekly-goal-plans',
    serviceName: 'Weekly Goal Plans API',
    operation: 'fetch weekly goal plans',
  });
  return plans ?? [];
};

export const createWeeklyGoalPlan = async (
  plan: WeeklyGoalPlan
): Promise<WeeklyGoalPlan> => {
  return apiFetch<WeeklyGoalPlan>({
    endpoint: '/api/weekly-goal-plans',
    serviceName: 'Weekly Goal Plans API',
    operation: 'create weekly goal plan',
    method: 'POST',
    body: plan,
  });
};

export const updateWeeklyGoalPlan = async (
  id: string,
  plan: WeeklyGoalPlan
): Promise<WeeklyGoalPlan> => {
  return apiFetch<WeeklyGoalPlan>({
    endpoint: `/api/weekly-goal-plans/${encodeURIComponent(id)}`,
    serviceName: 'Weekly Goal Plans API',
    operation: 'update weekly goal plan',
    method: 'PUT',
    body: plan,
  });
};

export const deleteWeeklyGoalPlan = async (id: string): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: `/api/weekly-goal-plans/${encodeURIComponent(id)}`,
    serviceName: 'Weekly Goal Plans API',
    operation: 'delete weekly goal plan',
    method: 'DELETE',
  });
};
