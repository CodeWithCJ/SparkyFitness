import { apiCall } from '@/api/api';
import type { CaffeineActiveResponse } from '@workspace/shared';

export const getActiveCaffeine = async (
  date: string,
  userId?: string,
  doseMg?: number
): Promise<CaffeineActiveResponse> => {
  const params = new URLSearchParams({ date });
  if (userId) params.append('userId', userId);
  if (doseMg != null) params.append('dose_mg', String(doseMg));

  const response = await apiCall(
    `/v2/nutrition/caffeine/active?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response;
};
