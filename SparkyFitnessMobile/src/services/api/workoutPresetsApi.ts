import { apiFetch } from './apiClient';
import type { WorkoutPresetsResponse, WorkoutPreset } from '../../types/workoutPresets';

export const fetchWorkoutPresets = async (): Promise<WorkoutPresetsResponse> => {
  return apiFetch<WorkoutPresetsResponse>({
    endpoint: '/api/workout-presets?limit=50',
    serviceName: 'Workout Presets API',
    operation: 'fetch workout presets',
  });
};

export const searchWorkoutPresets = async (searchTerm: string): Promise<WorkoutPreset[]> => {
  const params = new URLSearchParams({ searchTerm });
  return apiFetch<WorkoutPreset[]>({
    endpoint: `/api/workout-presets/search?${params.toString()}`,
    serviceName: 'Workout Presets API',
    operation: 'search workout presets',
  });
};
