import { useQuery } from '@tanstack/react-query';
import { fetchFitnessFatigue } from '../services/api/reportsApi';
import { getTodayDate } from '../utils/dateUtils';
import { fitnessFatigueQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * The 90-day fitness, fatigue and form curve and today's readiness score,
 * worked out on the server. A fixed window ending today, so it does not follow
 * the screen's range control. Refreshed on focus because a workout or a night's
 * sleep saved elsewhere changes it.
 */
export function useFitnessFatigue(enabled = true) {
  const query = useQuery({
    queryKey: fitnessFatigueQueryKey(getTodayDate()),
    queryFn: fetchFitnessFatigue,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
