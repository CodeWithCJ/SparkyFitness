import { api } from '@/api/api';
import type { FitnessTestListResponse } from '@workspace/shared';

/** The person's running fitness tests, newest first. Owner-only on the server. */
export const fetchFitnessTests = async (): Promise<FitnessTestListResponse> => {
  return api.get('/v2/fitness-tests');
};
