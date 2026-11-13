import type {
  HeartRateZonesResponse,
  UpdateHeartRateZonesBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Heart Rate Zones API';

/** The person's zone settings and the five zones they produce. */
export const fetchHeartRateZones = (): Promise<HeartRateZonesResponse> =>
  apiFetch<HeartRateZonesResponse>({
    endpoint: '/api/v2/heart-rate-zones',
    serviceName: SERVICE,
    operation: 'fetch heart rate zones',
  });

/** Saves a change to the settings, or `{ reset: true }` to restore the defaults. */
export const saveHeartRateZones = (
  body: UpdateHeartRateZonesBody
): Promise<HeartRateZonesResponse> =>
  apiFetch<HeartRateZonesResponse>({
    endpoint: '/api/v2/heart-rate-zones',
    serviceName: SERVICE,
    operation: 'save heart rate zones',
    method: 'PUT',
    body,
  });
