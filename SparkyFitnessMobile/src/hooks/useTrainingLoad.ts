import { useQuery } from '@tanstack/react-query';
import { fetchTrainingLoad } from '../services/api/reportsApi';
import { getTodayDate } from '../utils/dateUtils';
import { trainingLoadQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Acute against chronic workout load over the last four weeks, worked out on
 * the server from every logged workout. A fixed window ending today, so it
 * does not follow the screen's range control. Refreshed on focus because a
 * workout saved elsewhere changes it. `enabled` lets a hidden Dashboard card
 * skip the request.
 */
export function useTrainingLoad(enabled = true) {
  const query = useQuery({
    queryKey: trainingLoadQueryKey(getTodayDate()),
    queryFn: fetchTrainingLoad,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);

  return {
    load: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
