import { useQuery } from '@tanstack/react-query';
import { fetchBloodAlcohol } from '../services/api/bloodAlcoholApi';
import { bloodAlcoholQueryKey } from './queryKeys';
import { useKineticsClock } from './useKineticsClock';

/** Estimated blood alcohol for a day, plus a clock that advances on its own. */
export function useBloodAlcohol(date: string, enabled: boolean = true) {
  const query = useQuery({
    queryKey: bloodAlcoholQueryKey(date),
    queryFn: () => fetchBloodAlcohol(date),
    enabled: Boolean(date) && enabled,
    staleTime: 1000 * 60 * 5,
  });
  const nowMs = useKineticsClock(enabled);

  return {
    estimate: query.data,
    nowMs,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
