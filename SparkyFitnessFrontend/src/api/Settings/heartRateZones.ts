import { apiCall } from '@/api/api';
import type {
  HeartRateZonesResponse,
  UpdateHeartRateZonesBody,
} from '@workspace/shared';

export const getHeartRateZones = async (): Promise<HeartRateZonesResponse> =>
  apiCall('/v2/heart-rate-zones', { method: 'GET' });

export const updateHeartRateZones = async (
  body: UpdateHeartRateZonesBody
): Promise<HeartRateZonesResponse> =>
  apiCall('/v2/heart-rate-zones', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
