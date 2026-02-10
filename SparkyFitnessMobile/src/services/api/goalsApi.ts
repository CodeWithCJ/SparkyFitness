import { apiFetch } from './apiClient';
import type { DailyGoals } from '../../types/goals';

/**
 * Fetches daily goals for a given date.
 */
export const fetchDailyGoals = async (date: string): Promise<DailyGoals> => {
  return apiFetch<DailyGoals>({
    endpoint: `/api/goals/for-date?date=${date}`,
    serviceName: 'Goals API',
    operation: 'fetch goals',
  });
};
