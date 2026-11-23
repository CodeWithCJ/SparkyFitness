import { useQuery } from '@tanstack/react-query';
import { fetchDailySleepNeed } from '../services/api/sleepApi';
import { sleepNeedQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Tonight's sleep need breakdown. Refetched on focus because a workout logged
 * elsewhere in the app changes its strain part.
 */
export function useSleepNeed() {
  const query = useQuery({
    queryKey: sleepNeedQueryKey,
    queryFn: fetchDailySleepNeed,
  });

  useRefetchOnFocus(query.refetch);

  return query;
}
