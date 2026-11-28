import { apiFetch, normalizeUrl } from './apiClient';
import {
  cacheCount,
  getCacheRow,
  listCacheRowsPage,
  putCacheRows,
  searchCacheRowsPage,
} from '../../offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  exerciseStatsCacheKey,
} from '../../offline/collections';
import { withOfflineFallback } from '../../offline/withOfflineFallback';
import { ApiError } from './errors';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
} from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { addLog } from '../LogService';
import { UPLOAD_TIMEOUT_MS, fetchWithTimeout } from '../../utils/concurrency';
import type {
  Exercise,
  SuggestedExercisesResponse,
} from '../../types/exercise';
import { isExerciseModality } from '@workspace/shared';
import type {
  ExerciseAlternativeMode,
  ExerciseAlternativesResponse,
  ExerciseHistoryResponse,
  ExerciseModality,
  ExerciseStatsResponse,
  ExerciseProgressResponse,
  CreatePresetSessionRequest,
  UpdatePresetSessionRequest,
  PresetSessionResponse,
  ExerciseEntryResponse,
  AttachExerciseEntryGpsTrackRequest,
  AttachExerciseEntryLapsRequest,
  CalorieLinkSuggestionsResponse,
  SetCalorieLinkRequest,
  SetCalorieLinkResponse,
  Pagination,
} from '@workspace/shared';

/** The user's own previously logged workout locations, most recent first. */
export const fetchWorkoutLocations = async (): Promise<string[]> => {
  const data = await apiFetch<string[]>({
    endpoint: '/api/exercise-preset-entries/locations',
    serviceName: 'Exercise API',
    operation: 'fetch workout locations',
  });
  return Array.isArray(data) ? data : [];
};

export const fetchExerciseHistory = async (
  page: number = 1,
  pageSize: number = 20,
  exerciseId?: string
): Promise<ExerciseHistoryResponse> => {
  const exerciseFilter = exerciseId
    ? `&exerciseId=${encodeURIComponent(exerciseId)}`
    : '';
  return apiFetch<ExerciseHistoryResponse>({
    endpoint: `/api/v2/exercise-entries/history?page=${page}&pageSize=${pageSize}${exerciseFilter}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercise history',
  });
};

export const fetchExerciseStats = async (
  exerciseId: string,
  excludePresetEntryId?: string,
  presetId?: number
): Promise<ExerciseStatsResponse> => {
  // The live active-workout card passes its session id so today's in-progress
  // (or pre-persisted planned) sets are excluded from the historical baseline.
  // presetId (when the workout was started from a preset) scopes
  // recentSessions to that preset's own history instead of this exercise's
  // history from every preset/freeform workout.
  const params = new URLSearchParams();
  if (excludePresetEntryId)
    params.set('excludePresetEntryId', excludePresetEntryId);
  if (presetId != null) params.set('presetId', String(presetId));
  const query = params.toString() ? `?${params.toString()}` : '';
  const cacheKey = exerciseStatsCacheKey(exerciseId, presetId);
  return withOfflineFallback<ExerciseStatsResponse>({
    fetch: () =>
      apiFetch<ExerciseStatsResponse>({
        endpoint: `/api/v2/exercises/${encodeURIComponent(exerciseId)}/stats${query}`,
        serviceName: 'Exercise API',
        operation: 'fetch exercise stats',
      }),
    // An answer that leaves a session out is that session's view of the
    // history, not the general one, so only the plain answer is kept.
    store: excludePresetEntryId
      ? undefined
      : (db, serverConfigId, value) =>
          putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.exerciseStats, [
            { key: cacheKey, payload: value },
          ]),
    // Offline the kept answer serves a live workout too: a workout that has
    // not reached the server cannot be in the server's history, so there is
    // nothing to leave out.
    read: async (db, serverConfigId) => {
      const row = await getCacheRow(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.exerciseStats,
        cacheKey
      );
      return row ? (row.payload as ExerciseStatsResponse) : null;
    },
  });
};

/**
 * Every entry of one exercise between two calendar days, with its sets and
 * the day's body weight, oldest first. The web's Exercise Progress charts read
 * the same route.
 */
export const fetchExerciseProgress = (
  exerciseId: string,
  startDate: string,
  endDate: string
): Promise<ExerciseProgressResponse[]> => {
  const params = new URLSearchParams({ startDate, endDate });
  return apiFetch<ExerciseProgressResponse[]>({
    endpoint: `/api/exercise-entries/progress/${encodeURIComponent(exerciseId)}?${params.toString()}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercise progress',
  });
};

/**
 * Ranked substitutes for an exercise (issue #1560). `excludeIds` keeps
 * exercises already in the workout out of the list.
 */
export const fetchExerciseAlternatives = async (
  exerciseId: string,
  mode: ExerciseAlternativeMode,
  excludeIds: readonly string[] = []
): Promise<ExerciseAlternativesResponse> => {
  const params = new URLSearchParams({ mode });
  if (excludeIds.length > 0) params.set('excludeIds', excludeIds.join(','));
  return apiFetch<ExerciseAlternativesResponse>({
    endpoint: `/api/v2/exercises/${encodeURIComponent(exerciseId)}/alternatives?${params.toString()}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercise alternatives',
  });
};

/** Returns recent + popular exercises. */
export const fetchSuggestedExercises = async (
  limit: number = 10
): Promise<SuggestedExercisesResponse> => {
  return withOfflineFallback<SuggestedExercisesResponse>({
    fetch: async () => {
      const response = await apiFetch<{
        recentExercises: Record<string, unknown>[];
        topExercises: Record<string, unknown>[];
      }>({
        endpoint: `/api/exercises/suggested?limit=${limit}`,
        serviceName: 'Exercise API',
        operation: 'fetch suggested exercises',
      });
      return {
        recentExercises: (response.recentExercises ?? []).map(
          transformExerciseRow
        ),
        topExercises: (response.topExercises ?? []).map(transformExerciseRow),
      };
    },
    store: (db, serverConfigId, value) =>
      putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.suggestedExercises, [
        { key: String(limit), payload: value },
      ]),
    read: async (db, serverConfigId) => {
      const row = await getCacheRow(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.suggestedExercises,
        String(limit)
      );
      if (row) return row.payload as SuggestedExercisesResponse;
      // Never opened online: no suggestions, but the saved library can
      // still be searched, so answer empty rather than failing.
      const saved = await cacheCount(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.exercise
      );
      return saved > 0 ? { recentExercises: [], topExercises: [] } : null;
    },
  });
};

export const searchExercises = async (
  searchTerm: string
): Promise<Exercise[]> => {
  return withOfflineFallback<Exercise[]>({
    fetch: async () => {
      const response = await apiFetch<Record<string, unknown>[]>({
        endpoint: `/api/exercises/search?searchTerm=${encodeURIComponent(searchTerm)}`,
        serviceName: 'Exercise API',
        operation: 'search exercises',
      });
      return (response ?? []).map(transformExerciseRow);
    },
    read: async (db, serverConfigId) => {
      const saved = await cacheCount(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.exercise
      );
      if (saved === 0) return null;
      const { rows } = await searchCacheRowsPage(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.exercise,
        searchTerm,
        50,
        0
      );
      return rows.map((row) => row.payload as Exercise);
    },
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
  return withOfflineFallback<PaginatedExercisesPage>({
    fetch: async () => {
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
    },
    store: (db, serverConfigId, value) =>
      putCacheRows(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.exercise,
        value.exercises.map((exercise) => ({
          key: exercise.id,
          name: exercise.name,
          payload: exercise,
        }))
      ),
    read: async (db, serverConfigId) => {
      // The library kept on the phone, filtered by name. The server's ranked
      // search is not reproduced: this is a plain "name contains" match.
      const saved = await cacheCount(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.exercise
      );
      if (saved === 0) return null;
      const offset = (page - 1) * pageSize;
      const { rows, total } = searchTerm.trim()
        ? await searchCacheRowsPage(
            db,
            serverConfigId,
            CACHE_COLLECTIONS.exercise,
            searchTerm,
            pageSize,
            offset
          )
        : await listCacheRowsPage(
            db,
            serverConfigId,
            CACHE_COLLECTIONS.exercise,
            pageSize,
            offset
          );
      return {
        exercises: rows.map((row) => row.payload as Exercise),
        pagination: {
          page,
          pageSize,
          totalCount: total,
          hasMore: offset + rows.length < total,
        },
      };
    },
  });
};

export const fetchExercisesCount = async (): Promise<number> => {
  const response = await apiFetch<{
    exercises: Exercise[];
    totalCount: number;
  }>({
    endpoint: `/api/exercises/?currentPage=1&itemsPerPage=1`,
    serviceName: 'Exercise API',
    operation: 'fetch exercises count',
  });
  return response.totalCount;
};

export interface CreateExercisePayload {
  name: string;
  category: string;
  /** Silently dropped by pre-modality servers (they derive from category). */
  modality?: ExerciseModality;
  /** Health activity type key (#1750); omitted is Automatic. Older servers drop it. */
  health_activity_type?: string;
  /** Omit when blank — server defaults missing/falsy values to 0. */
  calories_per_hour?: number;
  description: string | null;
  equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  level?: string;
  force?: string;
  mechanic?: string;
  /** Image references carried over when duplicating an exercise. */
  images?: string[];
}

export interface UpdateExercisePayload {
  name?: string;
  category?: string;
  /** Sent only when the user changes it; omitted preserves (server COALESCEs). */
  modality?: ExerciseModality;
  /** A key sets the override, 'automatic' clears it, omitted preserves it. */
  health_activity_type?: string;
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
  shared_with_public?: boolean;
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

export const transformExerciseRow = (
  row: Record<string, unknown>
): Exercise => ({
  id: String(row.id),
  name: String(row.name),
  category: (row.category as string | null) ?? null,
  // Guarded: server rows are untyped, and pre-modality servers omit the field.
  modality: isExerciseModality(row.modality) ? row.modality : null,
  health_activity_type:
    typeof row.health_activity_type === 'string'
      ? row.health_activity_type
      : null,
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
  sharedWithPublic:
    typeof row.shared_with_public === 'boolean'
      ? row.shared_with_public
      : Boolean(row.shared_with_public),
});

/**
 * Fetch a single exercise's full catalog record by id. Used to hydrate the
 * Exercise Detail screen when it was opened from a workout/preset row that only
 * carried a sparse snapshot (name/category/images).
 */
export const fetchExerciseById = async (id: string): Promise<Exercise> =>
  withOfflineFallback<Exercise>({
    fetch: async () => {
      const response = await apiFetch<Record<string, unknown>>({
        endpoint: `/api/exercises/${encodeURIComponent(id)}`,
        serviceName: 'Exercise API',
        operation: 'fetch exercise by id',
      });
      return transformExerciseRow(response);
    },
    read: async (db, serverConfigId) => {
      const row = await getCacheRow(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.exercise,
        id
      );
      return row ? (row.payload as Exercise) : null;
    },
  });

/**
 * Creates a custom exercise. The server endpoint is multipart-only, so this
 * bypasses {@link apiFetch} (which always JSON-stringifies) and uses raw
 * fetch with FormData, mirroring the auth/proxy header injection pattern in
 * {@link healthDataApi}.
 */
export async function createExercise(
  payload: CreateExercisePayload
): Promise<Exercise> {
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

  const response = await fetchWithTimeout(
    `${baseUrl}/api/exercises/`,
    {
      method: 'POST',
      headers: {
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
        // Do NOT set Content-Type — fetch will add the multipart boundary.
      },
      body: form,
    },
    UPLOAD_TIMEOUT_MS
  );

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog('[Exercise API] Failed to create exercise', 'ERROR', [text]);
    throw new ApiError(
      `Server error: ${response.status} - ${text}`,
      response.status,
      text
    );
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
  options?: {
    /** Gives up sooner than the default; used where an offline fallback waits. */
    timeoutMs?: number;
  }
): Promise<PresetSessionResponse> => {
  return apiFetch<PresetSessionResponse>({
    endpoint: '/api/exercise-preset-entries/',
    serviceName: 'Exercise API',
    operation: 'create workout',
    method: 'POST',
    body: payload,
    ...(options?.timeoutMs != null ? { timeoutMs: options.timeoutMs } : {}),
  });
};

export interface CreateExerciseEntryPayload {
  exercise_id: string;
  exercise_name?: string | null;
  duration_minutes: number;
  /** Omit to let the server estimate from the exercise and duration. */
  calories_burned?: number;
  /** Counted in the daily total instead of `calories_burned`; null clears it. */
  calories_applied?: number | null;
  entry_date: string;
  /** Local start time, `HH:MM` (24h). */
  entry_time?: string;
  /** The IANA zone `entry_time` was read in (the phone's), when it may not be the profile's. */
  record_timezone?: string | null;
  distance?: number | null;
  avg_heart_rate?: number | null;
  /** Steps per minute. */
  avg_cadence?: number | null;
  stride_length_cm?: number | null;
  notes?: string | null;
  sets?: {
    id?: number;
    set_number: number;
    set_type?: string | null;
    weight: number | null;
    reps: number | null;
    duration?: number | null;
    /** Km; only meaningful on duration_distance sets. */
    distance?: number | null;
    rest_time?: number | null;
    notes?: string | null;
    rpe?: number | null;
    completed_at?: string | null;
  }[];
}

export const createExerciseEntry = async (
  payload: CreateExerciseEntryPayload
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
  payload: CreateExerciseEntryPayload
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
 * Synced workouts that may be the same session as a workout logged in the app.
 * `entryId` can be the entry or any entry of a strength session.
 */
export const fetchCalorieLinkSuggestions = async (
  entryId: string
): Promise<CalorieLinkSuggestionsResponse> => {
  return apiFetch<CalorieLinkSuggestionsResponse>({
    endpoint: `/api/exercise-entries/${encodeURIComponent(entryId)}/calorie-link/suggestions`,
    serviceName: 'Exercise API',
    operation: 'fetch calorie link suggestions',
    method: 'GET',
  });
};

/** Links a workout to a synced one so the session's calories count once. */
export const setCalorieLink = async (
  entryId: string,
  body: SetCalorieLinkRequest
): Promise<SetCalorieLinkResponse> => {
  return apiFetch<SetCalorieLinkResponse>({
    endpoint: `/api/exercise-entries/${encodeURIComponent(entryId)}/calorie-link`,
    serviceName: 'Exercise API',
    operation: 'link synced workout',
    method: 'PUT',
    body,
  });
};

/** Removes the link; each side counts its own calories again. */
export const clearCalorieLink = async (entryId: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${encodeURIComponent(entryId)}/calorie-link`,
    serviceName: 'Exercise API',
    operation: 'unlink synced workout',
    method: 'DELETE',
  });
};

/**
 * Sets the distance of an entry that has no GPS track (a treadmill run) to the
 * figure read off the machine. The server keeps everything else and scales any
 * laps to match; it answers 409 for an entry that has a route.
 */
export const setExerciseEntryDistance = async (
  id: string,
  distanceKm: number
): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${encodeURIComponent(id)}/distance`,
    serviceName: 'Exercise API',
    operation: 'set exercise entry distance',
    method: 'POST',
    body: { distance_km: distanceKm },
  });
};

/**
 * Sets the stride length of an entry alone, through the telemetry-only
 * endpoint so the entry's duration and the rest of its fields are untouched.
 * This is how a corrected treadmill distance brings the stride along; null
 * clears a stride the new distance no longer supports.
 */
export const setExerciseEntryStrideLength = async (
  id: string,
  strideLengthCm: number | null
): Promise<void> => {
  return attachExerciseEntryWatchTelemetry(id, { strideLengthCm });
};

/**
 * Sets the cadence and stride of an entry alone, through the telemetry-only
 * endpoint. For a watch run filed before its steps had reached Apple Health,
 * whose form is measured afterwards.
 */
export const setExerciseEntryForm = async (
  id: string,
  form: { avgCadence: number; strideLengthCm: number | null }
): Promise<void> => {
  return attachExerciseEntryWatchTelemetry(id, {
    avgCadence: form.avgCadence,
    ...(form.strideLengthCm != null && { strideLengthCm: form.strideLengthCm }),
  });
};

export const getWorkout = async (
  id: string
): Promise<PresetSessionResponse> => {
  return apiFetch<PresetSessionResponse>({
    endpoint: `/api/exercise-preset-entries/${id}`,
    serviceName: 'Exercise API',
    operation: 'get workout',
  });
};

export const updateWorkout = async (
  id: string,
  payload: UpdatePresetSessionRequest
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

/** One heart-rate reading, as captured on a paired Apple Watch. */
export interface HeartRateSamplePayload {
  /** ISO 8601 instant. */
  t: string;
  bpm: number;
}

/**
 * Fills in what a paired Apple Watch measured during a live workout on an
 * exercise entry that already exists: avg/max heart rate, the HR-zone
 * breakdown, and active energy. See `useWatchWorkoutBridge`.
 *
 * `activeEnergyKcal` replaces the server's duration-and-sets calorie
 * estimate for that entry. Both fields are optional individually, but the
 * server rejects a body carrying neither.
 */
export const attachExerciseEntryWatchTelemetry = async (
  exerciseEntryId: string,
  telemetry: {
    hrSamples?: HeartRateSamplePayload[];
    activeEnergyKcal?: number;
    /** Minutes the watch spent on this exercise. Replaces a zero duration. */
    durationMinutes?: number;
    /**
     * Apple's time-in-zone for the whole workout. Stored instead of
     * bucketing the series. Sent on one exercise of the session.
     */
    appleZones?: {
      index?: number;
      minimumBpm?: number | null;
      maximumBpm?: number | null;
      seconds: number;
    }[];
    /** Stride length in cm; null clears it. */
    strideLengthCm?: number | null;
    /** Average cadence in steps per minute; null clears it. */
    avgCadence?: number | null;
  }
): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${exerciseEntryId}/watch-telemetry`,
    serviceName: 'Exercise API',
    operation: 'attach exercise entry watch telemetry',
    method: 'POST',
    body: telemetry,
  });
};

/**
 * Stores how hard the person rated a workout, 1 (easy) to 10 (maximal). For an
 * entry of a strength session the server applies it to the whole session, so
 * any one entry id is enough. Sending it again replaces it.
 */
export const setExerciseEntryEffort = async (
  exerciseEntryId: string,
  rating: number,
  /** Pins a write that starts later to the server the entry belongs to. */
  serverConfig?: ServerConfig
): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${exerciseEntryId}/effort`,
    serviceName: 'Exercise API',
    operation: 'set exercise entry effort',
    method: 'POST',
    body: { rating },
    serverConfig,
  });
};

/**
 * Stores a GPS track recorded on the phone (and its per-km or per-mile
 * splits) against an exercise entry that already exists. The server derives
 * lap stats and the speed/elevation summary from the points; sending the same
 * track twice replaces it, so a retry is safe.
 */
export const attachExerciseEntryGpsTrack = async (
  exerciseEntryId: string,
  track: AttachExerciseEntryGpsTrackRequest
): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${exerciseEntryId}/gps-track`,
    serviceName: 'Exercise API',
    operation: 'attach exercise entry GPS track',
    method: 'POST',
    body: track,
  });
};

/**
 * Laps for an entry that has no GPS track (an indoor run from the watch). With
 * a track the laps go with it in {@link attachExerciseEntryGpsTrack}. Sending
 * the same laps twice replaces them, so a retry is safe.
 */
export const attachExerciseEntryLaps = async (
  exerciseEntryId: string,
  laps: AttachExerciseEntryLapsRequest['laps']
): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${exerciseEntryId}/laps`,
    serviceName: 'Exercise API',
    operation: 'attach exercise entry laps',
    method: 'POST',
    body: { laps },
  });
};

/**
 * Stores the distance against active time of a session with no route (an
 * indoor run from the watch) so its pace can be charted. Posting again
 * replaces it, so a retry is safe.
 */
export const attachExerciseEntryDistanceSeries = async (
  exerciseEntryId: string,
  points: number[][]
): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/exercise-entries/${exerciseEntryId}/distance-series`,
    serviceName: 'Exercise API',
    operation: 'attach exercise entry distance series',
    method: 'POST',
    body: { points },
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
  payload: UpdateExercisePayload
): Promise<Exercise> {
  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');
  const baseUrl = normalizeUrl(config.url);

  const form = new FormData();
  form.append('exerciseData', JSON.stringify(payload));

  const response = await fetchWithTimeout(
    `${baseUrl}/api/exercises/${id}`,
    {
      method: 'PUT',
      headers: {
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
      body: form,
    },
    UPLOAD_TIMEOUT_MS
  );

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const text = await response.text();
    addLog('[Exercise API] Failed to update exercise', 'ERROR', [text]);
    throw new ApiError(
      `Server error: ${response.status} - ${text}`,
      response.status,
      text
    );
  }

  const raw = await response.json();
  addLog('[Exercise API] Updated exercise', 'INFO', [String(id)]);
  return transformExerciseRow(raw);
}

/**
 * What a delete should do to everything pointing at the exercise.
 *
 * - `hide` stops it appearing in search and changes nothing else.
 * - `delete` removes it from the library and from presets/plans, keeping diary
 *   history (entries carry their own snapshot).
 * - `delete_with_history` also removes this user's own diary entries.
 *
 * Another user's diary is never affected; if anyone else still references the
 * exercise the server hides it instead and reports `status: 'hidden'`.
 */
export type ExerciseDeleteMode = 'hide' | 'delete' | 'delete_with_history';

export interface ExerciseDeletionImpact {
  exerciseEntriesCount: number;
  workoutPlansCount: number;
  workoutPresetsCount: number;
  totalReferences: number;
  otherUserReferences: number;
}

export const getExerciseDeletionImpact = async (
  id: string
): Promise<ExerciseDeletionImpact> => {
  const raw = await apiFetch<Partial<ExerciseDeletionImpact>>({
    endpoint: `/api/exercises/${id}/deletion-impact`,
    serviceName: 'Exercise API',
    operation: 'get exercise deletion impact',
  });
  return {
    exerciseEntriesCount: raw.exerciseEntriesCount ?? 0,
    workoutPlansCount: raw.workoutPlansCount ?? 0,
    workoutPresetsCount: raw.workoutPresetsCount ?? 0,
    totalReferences: raw.totalReferences ?? 0,
    otherUserReferences: raw.otherUserReferences ?? 0,
  };
};

export const deleteExerciseFromLibrary = async (
  id: string,
  mode: ExerciseDeleteMode = 'delete'
): Promise<{ message?: string; status?: string }> => {
  return apiFetch<{ message?: string; status?: string }>({
    endpoint: `/api/exercises/${id}?mode=${mode}`,
    serviceName: 'Exercise API',
    operation: 'delete exercise',
    method: 'DELETE',
  });
};
