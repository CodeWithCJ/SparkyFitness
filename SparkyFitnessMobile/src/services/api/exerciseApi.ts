import { apiFetch, normalizeUrl } from './apiClient';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { addLog } from '../LogService';
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
  const response = await apiFetch<{
    recentExercises: Record<string, unknown>[];
    topExercises: Record<string, unknown>[];
  }>({
    endpoint: `/api/exercises/suggested?limit=${limit}`,
    serviceName: 'Exercise API',
    operation: 'fetch suggested exercises',
  });
  return {
    recentExercises: (response.recentExercises ?? []).map(transformExerciseRow),
    topExercises: (response.topExercises ?? []).map(transformExerciseRow),
  };
};

export const searchExercises = async (searchTerm: string): Promise<Exercise[]> => {
  const response = await apiFetch<Record<string, unknown>[]>({
    endpoint: `/api/exercises/search?searchTerm=${encodeURIComponent(searchTerm)}`,
    serviceName: 'Exercise API',
    operation: 'search exercises',
  });
  return (response ?? []).map(transformExerciseRow);
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
  const response = await apiFetch<{
    exercises: Record<string, unknown>[];
    pagination: Pagination;
  }>({
    endpoint: `/api/v2/exercises/search?${params.toString()}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercises page',
  });
  return {
    exercises: (response.exercises ?? []).map(transformExerciseRow),
    pagination: response.pagination,
  };
};

export const fetchExercisesCount = async (): Promise<number> => {
  const response = await apiFetch<{ exercises: Exercise[]; totalCount: number }>({
    endpoint: `/api/exercises/?currentPage=1&itemsPerPage=1`,
    serviceName: 'Exercise API',
    operation: 'fetch exercises count',
  });
  return response.totalCount;
};

export interface CreateExercisePayload {
  name: string;
  category: string;
  /** Omit when blank — server defaults missing/falsy values to 0. */
  calories_per_hour?: number;
  description: string | null;
}

export interface UpdateExercisePayload {
  name?: string;
  category?: string;
  calories_per_hour?: number;
  /** Empty string clears, omitted/null preserves (server COALESCEs nulls). */
  description?: string | null;
  equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  level?: string;
  force?: string;
  mechanic?: string;
}

const parseJsonValue = (raw: unknown): unknown => {
  let value = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return value;
    }
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const parseStringArrayValue = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.flatMap(parseStringArrayValue);
  }
  if (typeof raw !== 'string') {
    return [];
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const parsed = parseJsonValue(trimmed);
  if (Array.isArray(parsed)) {
    return parsed.flatMap(parseStringArrayValue);
  }
  if (typeof parsed === 'string' && parsed !== trimmed) {
    return parseStringArrayValue(parsed);
  }
  if (trimmed === '[]') {
    return [];
  }
  return [trimmed];
};

const parseJsonArray = (raw: unknown): string[] => {
  const parsed = parseJsonValue(raw);
  if (Array.isArray(parsed)) {
    return parsed.flatMap(parseStringArrayValue);
  }
  return [];
};

const transformExerciseRow = (row: Record<string, unknown>): Exercise => ({
  id: String(row.id),
  name: String(row.name),
  category: (row.category as string | null) ?? null,
  equipment: parseJsonArray(row.equipment),
  primary_muscles: parseJsonArray(row.primary_muscles),
  secondary_muscles: parseJsonArray(row.secondary_muscles),
  calories_per_hour:
    typeof row.calories_per_hour === 'number'
      ? row.calories_per_hour
      : Number(row.calories_per_hour) || 0,
  source: String(row.source ?? ''),
  images: parseJsonArray(row.images),
  tags: [],
  force: (row.force as string | null) ?? null,
  level: (row.level as string | null) ?? null,
  mechanic: (row.mechanic as string | null) ?? null,
  instructions: parseJsonArray(row.instructions),
  description: (row.description as string | null) ?? null,
  userId: row.user_id != null ? String(row.user_id) : null,
  isCustom:
    typeof row.is_custom === 'boolean' ? row.is_custom : Boolean(row.is_custom),
});

/**
 * Creates a custom exercise. The server endpoint is multipart-only, so this
 * bypasses {@link apiFetch} (which always JSON-stringifies) and uses raw
 * fetch with FormData, mirroring the auth/proxy header injection pattern in
 * {@link healthDataApi}.
 */
export async function createExercise(payload: CreateExercisePayload): Promise<Exercise> {
  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);

  const exerciseData = {
    ...payload,
    source: 'custom',
    is_custom: true,
    shared_with_public: false,
  };

  const form = new FormData();
  form.append('exerciseData', JSON.stringify(exerciseData));

  const response = await fetch(`${baseUrl}/api/exercises/`, {
    method: 'POST',
    headers: {
      ...proxyHeadersToRecord(config.proxyHeaders),
      ...getAuthHeaders(config),
      // Do NOT set Content-Type — fetch will add the multipart boundary.
    },
    body: form,
  });

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog('[Exercise API] Failed to create exercise', 'ERROR', [text]);
    throw new Error(`Server error: ${response.status} - ${text}`);
  }

  const raw = await response.json();
  addLog('[Exercise API] createExercise raw response', 'DEBUG', [
    `images type=${Array.isArray(raw.images) ? 'array' : typeof raw.images}`,
    `images value=${JSON.stringify(raw.images)}`,
  ]);
  return transformExerciseRow(raw);
}

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

/**
 * Updates a custom exercise. Like {@link createExercise} the server endpoint
 * is multipart-only, so this bypasses {@link apiFetch} and posts FormData.
 * Server COALESCEs nulls — omit a field to preserve it; pass `''` to clear
 * a text column.
 */
export async function updateExercise(
  id: string,
  payload: UpdateExercisePayload,
): Promise<Exercise> {
  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);

  const form = new FormData();
  form.append('exerciseData', JSON.stringify(payload));

  const response = await fetch(`${baseUrl}/api/exercises/${id}`, {
    method: 'PUT',
    headers: {
      ...proxyHeadersToRecord(config.proxyHeaders),
      ...getAuthHeaders(config),
    },
    body: form,
  });

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog('[Exercise API] Failed to update exercise', 'ERROR', [text]);
    throw new Error(`Server error: ${response.status} - ${text}`);
  }

  const raw = await response.json();
  addLog('[Exercise API] Updated exercise', 'INFO', [String(id)]);
  return transformExerciseRow(raw);
}

export const deleteExerciseFromLibrary = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercises/${id}`,
    serviceName: 'Exercise API',
    operation: 'delete exercise',
    method: 'DELETE',
  });
};
