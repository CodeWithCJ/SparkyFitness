import { apiFetch } from './apiClient';
import type { Exercise, SuggestedExercisesResponse } from '../../types/exercise';
import type {
  ExerciseHistoryResponse,
  ExerciseSessionResponse,
  CreatePresetSessionRequest,
  UpdatePresetSessionRequest,
  PresetSessionResponse,
  ExerciseEntryResponse,
  Pagination,
} from '@workspace/shared';

export const fetchExerciseEntries = async (date: string): Promise<ExerciseSessionResponse[]> => {
  return apiFetch<ExerciseSessionResponse[]>({
    endpoint: `/api/v2/exercise-entries/by-date?selectedDate=${encodeURIComponent(date)}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercise entries',
  });
};

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

/** Returns recent + popular exercises. */
export const fetchSuggestedExercises = async (
  limit: number = 10,
): Promise<SuggestedExercisesResponse> => {
  return apiFetch<SuggestedExercisesResponse>({
    endpoint: `/api/exercises/suggested?limit=${limit}`,
    serviceName: 'Exercise API',
    operation: 'fetch suggested exercises',
  });
};

export const searchExercises = async (searchTerm: string): Promise<Exercise[]> => {
  return apiFetch<Exercise[]>({
    endpoint: `/api/exercises/search?searchTerm=${encodeURIComponent(searchTerm)}`,
    serviceName: 'Exercise API',
    operation: 'search exercises',
  });
};

export interface FetchExercisesPageOptions {
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedExercisesPage {
  exercises: Exercise[];
  pagination: Pagination;
}

export const fetchExercisesPage = async ({
  searchTerm = '',
  page = 1,
  pageSize = 20,
}: FetchExercisesPageOptions = {}): Promise<PaginatedExercisesPage> => {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (searchTerm) {
    params.set('searchTerm', searchTerm);
  }
  return apiFetch<PaginatedExercisesPage>({
    endpoint: `/api/v2/exercises/search?${params.toString()}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercises page',
  });
};

export const fetchExercisesCount = async (): Promise<number> => {
  const response = await apiFetch<{ exercises: Exercise[]; totalCount: number }>({
    endpoint: `/api/exercises/?currentPage=1&itemsPerPage=1`,
    serviceName: 'Exercise API',
    operation: 'fetch exercises count',
  });
  return response.totalCount;
};

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
  exercise_name?: string | null;
  duration_minutes: number;
  calories_burned: number;
  entry_date: string;
  distance?: number | null;
  avg_heart_rate?: number | null;
  notes?: string | null;
  sets?: {
    id?: number;
    set_number: number;
    set_type?: string | null;
    weight: number | null;
    reps: number | null;
    duration?: number | null;
    rest_time?: number | null;
    notes?: string | null;
    rpe?: number | null;
  }[];
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

export const deleteWorkout = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-preset-entries/${id}`,
    serviceName: 'Exercise API',
    operation: 'delete workout',
    method: 'DELETE',
  });
};

export const deleteExerciseEntry = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${id}`,
    serviceName: 'Exercise API',
    operation: 'delete exercise entry',
    method: 'DELETE',
  });
};
