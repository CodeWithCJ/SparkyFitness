import { apiFetch } from './apiClient';
import type { GoalPreset } from '../../types/goals';

export const fetchGoalPresets = async (): Promise<GoalPreset[]> => {
  const presets = await apiFetch<GoalPreset[] | null>({
    endpoint: '/api/goal-presets',
    serviceName: 'Goal Presets API',
    operation: 'fetch goal presets',
  });
  return presets ?? [];
};

export const createGoalPreset = async (
  preset: GoalPreset
): Promise<GoalPreset> => {
  return apiFetch<GoalPreset>({
    endpoint: '/api/goal-presets',
    serviceName: 'Goal Presets API',
    operation: 'create goal preset',
    method: 'POST',
    body: preset,
  });
};

export const updateGoalPreset = async (
  id: string,
  preset: GoalPreset
): Promise<GoalPreset> => {
  return apiFetch<GoalPreset>({
    endpoint: `/api/goal-presets/${encodeURIComponent(id)}`,
    serviceName: 'Goal Presets API',
    operation: 'update goal preset',
    method: 'PUT',
    body: preset,
  });
};

export const deleteGoalPreset = async (id: string): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: `/api/goal-presets/${encodeURIComponent(id)}`,
    serviceName: 'Goal Presets API',
    operation: 'delete goal preset',
    method: 'DELETE',
  });
};
