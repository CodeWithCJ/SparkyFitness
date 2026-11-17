import type {
  HealthMetricSamplesWriteBody,
  HealthMetricSamplesWriteResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import type { ServerConfig } from '../storage';

/**
 * Stores passive readings (all-day heart rate and glucose) the server has no integration
 * for. A `merge` write replaces only this source's samples inside `window`, so
 * sending the same window again never duplicates.
 */
export const postHealthMetricSamples = (
  body: HealthMetricSamplesWriteBody,
  signal?: AbortSignal,
  serverConfig?: ServerConfig
): Promise<HealthMetricSamplesWriteResponse> =>
  apiFetch<HealthMetricSamplesWriteResponse>({
    endpoint: '/api/generic-health/samples',
    serviceName: 'Health Samples API',
    operation: 'upload health samples',
    method: 'POST',
    body,
    signal,
    serverConfig,
    // A failed response can quote the readings; keep them out of the app log.
    logResponseBody: false,
  });

/** Reads stored samples on either platform, regardless of the device that uploaded them. */
export async function fetchGlucoseSamples(startDate: string, endDate: string) {
  const response = await apiFetch<{
    data: import('@workspace/shared').HealthMetricSamples[];
  }>({
    endpoint: `/api/generic-health/samples?${new URLSearchParams({ metric: 'blood_glucose', startDate, endDate })}`,
    serviceName: 'Health Samples API',
    operation: 'fetch glucose samples',
  });
  return response?.data ?? [];
}
