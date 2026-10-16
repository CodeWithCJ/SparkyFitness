import type {
  ExerciseActivityQueryResponse,
  ExercisePRMatrixResponse,
  ExerciseEntryGpsPoints,
  ExerciseEntryHrZones,
  ExerciseEntryResponse,
  HealthMetricSamples,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Exercise Stats API';

/**
 * Cardio sessions in a date range, newest first. The server leaves strength
 * sessions out when no category is given.
 */
export const fetchCardioSessionsPage = ({
  startDate,
  endDate,
  page,
  pageSize,
  unitSystem,
}: {
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
  unitSystem: 'metric' | 'imperial';
}): Promise<ExerciseActivityQueryResponse> => {
  const params = new URLSearchParams({
    startDate,
    endDate,
    page: String(page),
    pageSize: String(pageSize),
    unitSystem,
    sortBy: 'entry_date',
    sortOrder: 'desc',
  });
  return apiFetch<ExerciseActivityQueryResponse>({
    endpoint: `/api/exercise-stats/query?${params.toString()}`,
    serviceName: SERVICE,
    operation: 'fetch cardio sessions',
  });
};

export const fetchExerciseEntry = (
  id: string
): Promise<ExerciseEntryResponse> =>
  apiFetch<ExerciseEntryResponse>({
    endpoint: `/api/exercise-entries/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'fetch exercise entry',
  });

/** One row holding every trackpoint, or null when the workout has no route. */
export const fetchWorkoutGpsPoints = async (
  id: string
): Promise<ExerciseEntryGpsPoints | null> => {
  const response = await apiFetch<{ data: ExerciseEntryGpsPoints | null }>({
    endpoint: `/api/generic-health/workout-gps/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'fetch workout route',
  });
  return response?.data ?? null;
};

/** Distance against active time for an entry with no route, or null. */
export const fetchExerciseEntryDistanceSeries = async (
  id: string
): Promise<[number, number][] | null> => {
  const response = await apiFetch<{ points: [number, number][] | null }>({
    endpoint: `/api/exercise-entries/${encodeURIComponent(id)}/distance-series`,
    serviceName: SERVICE,
    operation: 'fetch workout distance series',
  });
  return response?.points ?? null;
};

export const fetchWorkoutHrZones = async (
  id: string
): Promise<ExerciseEntryHrZones[]> => {
  const response = await apiFetch<{ data: ExerciseEntryHrZones[] }>({
    endpoint: `/api/generic-health/workout-hr-zones/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'fetch workout heart-rate zones',
  });
  return response?.data ?? [];
};

export const fetchHeartRateSamples = async (
  startDate: string,
  endDate: string
): Promise<HealthMetricSamples[]> => {
  const params = new URLSearchParams({
    metric: 'heart_rate',
    startDate,
    endDate,
  });
  const response = await apiFetch<{ data: HealthMetricSamples[] }>({
    endpoint: `/api/generic-health/samples?${params.toString()}`,
    serviceName: SERVICE,
    operation: 'fetch heart-rate samples',
  });
  return response?.data ?? [];
};

/** Best efforts per sport and distance (cardio) plus estimated strength maxes. */
export const fetchPersonalRecords = (
  unitSystem: 'metric' | 'imperial'
): Promise<ExercisePRMatrixResponse> =>
  apiFetch<ExercisePRMatrixResponse>({
    endpoint: `/api/exercise-stats/prs?unitSystem=${unitSystem}`,
    serviceName: SERVICE,
    operation: 'fetch personal records',
  });
