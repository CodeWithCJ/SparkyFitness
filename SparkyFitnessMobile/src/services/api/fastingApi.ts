import { apiFetch } from './apiClient';
import type { FastingLog, FastingStats } from '../../types/fasting';

const SERVICE_NAME = 'Fasting API';

/**
 * Returns the active fast, or `null` when none is active. The server sends a
 * literal `null` body for `/current` which `apiFetch` surfaces as JS `null`; we
 * coalesce to `null` (never `undefined`) so the React Query `queryFn` doesn't
 * throw on a missing return value.
 */
export const fetchCurrentFast = async (): Promise<FastingLog | null> => {
  const result = await apiFetch<FastingLog | null>({
    endpoint: '/api/fasting/current',
    serviceName: SERVICE_NAME,
    operation: 'fetch current fast',
  });
  return result ?? null;
};

interface StartFastParams {
  /** ISO-8601 start time. */
  startTime: string;
  /** ISO-8601 target end time. */
  targetEndTime: string;
  /** Opaque display string (the preset name). */
  fastingType: string;
}

export const startFast = ({
  startTime,
  targetEndTime,
  fastingType,
}: StartFastParams): Promise<FastingLog> =>
  apiFetch<FastingLog>({
    endpoint: '/api/fasting/start',
    serviceName: SERVICE_NAME,
    operation: 'start fast',
    method: 'POST',
    body: {
      start_time: startTime,
      target_end_time: targetEndTime,
      fasting_type: fastingType,
    },
  });

interface EndFastParams {
  id: string;
  /** ISO-8601 start time (overrides the stored one if edited). */
  startTime: string;
  /** ISO-8601 end time. */
  endTime: string;
}

export const endFast = ({ id, startTime, endTime }: EndFastParams): Promise<FastingLog> =>
  apiFetch<FastingLog>({
    endpoint: '/api/fasting/end',
    serviceName: SERVICE_NAME,
    operation: 'end fast',
    method: 'POST',
    body: {
      id,
      start_time: startTime,
      end_time: endTime,
    },
  });

export const fetchFastingStats = (): Promise<FastingStats> =>
  apiFetch<FastingStats>({
    endpoint: '/api/fasting/stats',
    serviceName: SERVICE_NAME,
    operation: 'fetch fasting stats',
  });

interface FetchHistoryParams {
  limit?: number;
  offset?: number;
}

export const fetchFastingHistory = async ({
  limit = 20,
  offset = 0,
}: FetchHistoryParams = {}): Promise<FastingLog[]> => {
  const result = await apiFetch<FastingLog[] | null>({
    endpoint: `/api/fasting/history?limit=${limit}&offset=${offset}`,
    serviceName: SERVICE_NAME,
    operation: 'fetch fasting history',
  });
  return result ?? [];
};
