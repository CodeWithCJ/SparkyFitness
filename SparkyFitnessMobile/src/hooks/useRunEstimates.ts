import { useQuery } from '@tanstack/react-query';
import { fetchRunEstimates } from '../services/api/reportsApi';
import { getTodayDate } from '../utils/dateUtils';
import { runEstimatesQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Estimated VO2 max and running power from the last weeks of runs, worked out
 * on the server. A fixed window ending today, refreshed on focus because a run
 * saved elsewhere changes it.
 */
export function useRunEstimates(enabled = true) {
  const query = useQuery({
    queryKey: runEstimatesQueryKey(getTodayDate()),
    queryFn: fetchRunEstimates,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
