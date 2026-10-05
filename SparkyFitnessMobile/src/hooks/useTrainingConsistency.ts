import { useQuery } from '@tanstack/react-query';
import { fetchTrainingConsistency } from '../services/api/reportsApi';
import { trainingConsistencyQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Training days, weekly streak and this-vs-last-week sets per muscle. A fixed
 * window on the server, so it does not follow the screen's range control.
 * Refreshed on focus because a workout logged elsewhere changes it.
 */
export function useTrainingConsistency() {
  const query = useQuery({
    queryKey: trainingConsistencyQueryKey(),
    queryFn: fetchTrainingConsistency,
  });
  useRefetchOnFocus(query.refetch);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
