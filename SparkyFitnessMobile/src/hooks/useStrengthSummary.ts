import { useQuery } from '@tanstack/react-query';
import { fetchStrengthSummary } from '../services/api/exerciseStatsApi';
import { strengthSummaryQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Lifetime strength totals and best lifts. Not retried: an older server has
 * no such endpoint, and the card simply stays hidden.
 */
export function useStrengthSummary(enabled = true) {
  const query = useQuery({
    queryKey: strengthSummaryQueryKey(),
    queryFn: fetchStrengthSummary,
    retry: false,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled && !query.isError);
  return { data: query.data };
}
