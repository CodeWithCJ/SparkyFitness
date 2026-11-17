import { apiCall } from '@/api/api';
import type { BloodAlcoholResponse } from '@workspace/shared';

/** Owner-only on the server, so there is no userId: it never answers for a delegate. */
export const getBloodAlcohol = async (
  date: string
): Promise<BloodAlcoholResponse> => {
  const params = new URLSearchParams({ date });
  return apiCall(`/v2/nutrition/blood-alcohol?${params.toString()}`, {
    method: 'GET',
  });
};
