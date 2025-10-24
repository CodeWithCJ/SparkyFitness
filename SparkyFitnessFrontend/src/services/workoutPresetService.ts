import { apiCall } from './api';
import { WorkoutPreset, PaginatedWorkoutPresets } from '@/types/workout';

export const getWorkoutPresets = async (page: number, limit: number): Promise<PaginatedWorkoutPresets> => {
  return apiCall('/workout-presets', {
    method: 'GET',
    params: { page, limit }
  });
};

export const getWorkoutPresetById = async (id: string): Promise<WorkoutPreset> => {
  return apiCall(`/workout-presets/${id}`, {
    method: 'GET',
  });
};

export const createWorkoutPreset = async (presetData: Omit<WorkoutPreset, 'id' | 'created_at' | 'updated_at'>): Promise<WorkoutPreset> => {
  return apiCall('/workout-presets', {
    method: 'POST',
    body: JSON.stringify(presetData),
  });
};

export const updateWorkoutPreset = async (id: string, presetData: Partial<WorkoutPreset>): Promise<WorkoutPreset> => {
  return apiCall(`/workout-presets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(presetData),
  });
};

export const deleteWorkoutPreset = async (id: string): Promise<{ message: string }> => {
  return apiCall(`/workout-presets/${id}`, {
    method: 'DELETE',
  });
};

export const searchWorkoutPresets = async (searchTerm: string, limit?: number): Promise<WorkoutPreset[]> => {
  const params: Record<string, any> = { searchTerm };
  if (limit !== undefined) {
    params.limit = limit;
  }
  return apiCall('/workout-presets/search', {
    method: 'GET',
    params: params,
  });
};