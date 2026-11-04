import type {
  HealthMetricSamplesWriteBody,
  HealthMetricSamplesWriteResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

/**
 * Stores passive readings (all-day heart rate) the server has no integration
 * for. A `merge` write replaces only this source's samples inside `window`, so
 * sending the same window again never duplicates.
 */
export const postHealthMetricSamples = (
  body: HealthMetricSamplesWriteBody
): Promise<HealthMetricSamplesWriteResponse> =>
  apiFetch<HealthMetricSamplesWriteResponse>({
    endpoint: '/api/generic-health/samples',
    serviceName: 'Health Samples API',
    operation: 'upload heart rate samples',
    method: 'POST',
    body,
  });
