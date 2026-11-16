import type { BloodAlcoholResponse } from '@workspace/shared';
import { apiFetch } from './apiClient';

/**
 * Estimated blood alcohol for a day. The server resolves the drinks, the
 * profile inputs and the person's BAC settings; the doses come back so the
 * client can redraw the curve as time passes without refetching.
 */
export const fetchBloodAlcohol = (
  date: string
): Promise<BloodAlcoholResponse> =>
  apiFetch<BloodAlcoholResponse>({
    endpoint: `/api/v2/nutrition/blood-alcohol?date=${encodeURIComponent(date)}`,
    serviceName: 'Blood Alcohol API',
    operation: 'fetch blood alcohol estimate',
  });
