import { useQuery } from '@tanstack/react-query';
import { fetchFoodEntriesRange } from '../services/api/foodEntriesApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { foodEntriesRangeQueryKey } from './queryKeys';

interface UseFoodEntriesRangeOptions {
  startDate: string;
  endDate: string;
  enabled?: boolean;
}

/** Every food entry in an inclusive day range, refreshed when the screen regains focus. */
export function useFoodEntriesRange({
  startDate,
  endDate,
  enabled = true,
}: UseFoodEntriesRangeOptions) {
  const query = useQuery({
    queryKey: foodEntriesRangeQueryKey(startDate, endDate),
    queryFn: () => fetchFoodEntriesRange(startDate, endDate),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
