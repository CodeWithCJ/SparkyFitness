import type { CaffeineActiveResponse } from '@workspace/shared';
import { apiFetch } from './apiClient';

/**
 * Active-caffeine kinetics for a day. The server resolves the 3-day dose
 * window and the user's timezone; the doses come back so the client can
 * redraw the curve as time passes without refetching.
 */
export const fetchActiveCaffeine = (
  date: string
): Promise<CaffeineActiveResponse> =>
  apiFetch<CaffeineActiveResponse>({
    endpoint: `/api/v2/nutrition/caffeine/active?date=${encodeURIComponent(date)}`,
    serviceName: 'Caffeine API',
    operation: 'fetch active caffeine',
  });
