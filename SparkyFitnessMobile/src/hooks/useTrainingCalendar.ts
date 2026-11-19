import { useQuery } from '@tanstack/react-query';
import { fetchTrainingCalendar } from '../services/api/reportsApi';
import { trainingCalendarQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Planned and completed training for a range of days, with load per sport,
 * worked out on the server. Refreshed on focus because a workout logged or a
 * plan changed elsewhere moves both sides.
 */
export function useTrainingCalendar(
  start: string,
  end: string,
  enabled = true
) {
  const query = useQuery({
    queryKey: trainingCalendarQueryKey(start, end),
    queryFn: () => fetchTrainingCalendar(start, end),
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
