import { apiFetch } from './apiClient';
import type { Exercise, SuggestedExercisesResponse } from '../../types/exercise';
import type {
  ExerciseHistoryResponse,
  ExerciseSessionResponse,
  CreatePresetSessionRequest,
  UpdatePresetSessionRequest,
  PresetSessionResponse,
  ExerciseEntryResponse,
} from '@workspace/shared';

/**
 * Fetches exercise entries for a given date.
 */
export const fetchExerciseEntries = async (date: string): Promise<ExerciseSessionResponse[]> => {
  return apiFetch<ExerciseSessionResponse[]>({
    endpoint: `/api/exercise-entries/by-date?selectedDate=${date}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercise entries',
  });
};

/**
 * Calculates total calories burned from exercise entries.
 */
export const calculateCaloriesBurned = (entries: ExerciseSessionResponse[]): number => {
  return entries.reduce((total, session) => {
    if (session.type === 'preset') {
      return total + session.exercises.reduce((sum, e) => sum + e.calories_burned, 0);
    }
    return total + (session.calories_burned || 0);
  }, 0);
};

/**
 * Calculates calories from "Active Calories" exercises (e.g., from watch/fitness tracker).
 * Active Calories entries are always individual synced entries, never part of preset workouts.
 */
export const calculateActiveCalories = (entries: ExerciseSessionResponse[]): number => {
  return entries.reduce((total, session) => {
    if (session.type === 'preset') return total;
    if (session.exercise_snapshot?.name === 'Active Calories') {
      return total + (session.calories_burned || 0);
    }
    return total;
  }, 0);
};

/**
 * Calculates calories from non-"Active Calories" exercises.
 */
export const calculateOtherExerciseCalories = (entries: ExerciseSessionResponse[]): number => {
  return entries.reduce((total, session) => {
    if (session.type === 'preset') {
      return total + session.exercises.reduce((sum, e) => sum + e.calories_burned, 0);
    }
    if (session.exercise_snapshot?.name !== 'Active Calories') {
      return total + (session.calories_burned || 0);
    }
    return total;
  }, 0);
};

/**
 * Calculates total exercise duration in minutes, excluding "Active Calories" entries.
 */
export const calculateExerciseDuration = (entries: ExerciseSessionResponse[]): number => {
  return entries.reduce((total, session) => {
    if (session.type === 'preset') {
      return total + session.total_duration_minutes;
    }
    if (session.exercise_snapshot?.name !== 'Active Calories') {
      return total + (session.duration_minutes ?? 0);
    }
    return total;
  }, 0);
};

/**
 * Fetches paginated exercise session history.
 */
export const fetchExerciseHistory = async (
  page: number = 1,
  pageSize: number = 20,
): Promise<ExerciseHistoryResponse> => {
  return apiFetch<ExerciseHistoryResponse>({
    endpoint: `/api/v2/exercise-entries/history?page=${page}&pageSize=${pageSize}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercise history',
  });
};

/**
 * Fetches suggested exercises (recent + popular).
 */
export const fetchSuggestedExercises = async (
  limit: number = 10,
): Promise<SuggestedExercisesResponse> => {
  return apiFetch<SuggestedExercisesResponse>({
    endpoint: `/api/exercises/suggested?limit=${limit}`,
    serviceName: 'Exercise API',
    operation: 'fetch suggested exercises',
  });
};

/**
 * Searches exercises by name.
 */
export const searchExercises = async (searchTerm: string): Promise<Exercise[]> => {
  return apiFetch<Exercise[]>({
    endpoint: `/api/exercises/search?searchTerm=${encodeURIComponent(searchTerm)}`,
    serviceName: 'Exercise API',
    operation: 'search exercises',
  });
};

/**
 * Creates a workout from preset entries.
 */
export const createWorkout = async (
  payload: CreatePresetSessionRequest,
): Promise<PresetSessionResponse> => {
  return apiFetch<PresetSessionResponse>({
    endpoint: '/api/exercise-preset-entries/',
    serviceName: 'Exercise API',
    operation: 'create workout',
    method: 'POST',
    body: payload,
  });
};

export interface CreateExerciseEntryPayload {
  exercise_id: string;
  duration_minutes: number;
  calories_burned: number;
  entry_date: string;
  distance?: number | null;
  notes?: string | null;
}

export const createExerciseEntry = async (
  payload: CreateExerciseEntryPayload,
): Promise<ExerciseEntryResponse> => {
  return apiFetch<ExerciseEntryResponse>({
    endpoint: '/api/exercise-entries/',
    serviceName: 'Exercise API',
    operation: 'create exercise entry',
    method: 'POST',
    body: payload,
  });
};

export const updateExerciseEntry = async (
  id: string,
  payload: CreateExerciseEntryPayload,
): Promise<ExerciseEntryResponse> => {
  return apiFetch<ExerciseEntryResponse>({
    endpoint: `/api/exercise-entries/${id}`,
    serviceName: 'Exercise API',
    operation: 'update exercise entry',
    method: 'PUT',
    body: payload,
  });
};

/**
 * Updates a workout.
 */
export const updateWorkout = async (
  id: string,
  payload: UpdatePresetSessionRequest,
): Promise<PresetSessionResponse> => {
  return apiFetch<PresetSessionResponse>({
    endpoint: `/api/exercise-preset-entries/${id}`,
    serviceName: 'Exercise API',
    operation: 'update workout',
    method: 'PUT',
    body: payload,
  });
};

/**
 * Deletes a workout (returns 204 No Content).
 */
export const deleteWorkout = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-preset-entries/${id}`,
    serviceName: 'Exercise API',
    operation: 'delete workout',
    method: 'DELETE',
  });
};

/**
 * Deletes an exercise entry.
 */
export const deleteExerciseEntry = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${id}`,
    serviceName: 'Exercise API',
    operation: 'delete exercise entry',
    method: 'DELETE',
  });
};
