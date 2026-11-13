import { useQuery } from '@tanstack/react-query';
import { todayInZone } from '@workspace/shared';
import { fetchMoodCheckinsForDate } from '../services/api/moodApi';
import { getDeviceTimezone } from '../utils/dateUtils';
import { usePreferences } from './usePreferences';
import { moodCheckinsSupportQueryKey } from './queryKeys';

/**
 * Whether the server keeps several mood check-ins per day: true when
 * `GET /api/mood/date/:day` answers with a list, false when it answers with
 * anything else, null while unknown. Unknown once loading is over means the
 * probe failed. Neither form is safe then (the one-entry POST would edit a v2
 * server's latest check-in instead of adding one), so screens offer `retry`.
 */
export function useMoodCheckinsSupport(): {
  supported: boolean | null;
  isLoading: boolean;
  /** Asks the server again, for a probe that failed. */
  retry: () => void;
  retrying: boolean;
} {
  const { preferences } = usePreferences();
  const timezone = preferences?.timezone || getDeviceTimezone();
  const query = useQuery({
    queryKey: moodCheckinsSupportQueryKey,
    // The answer only changes with a server upgrade, so probe once and keep
    // it: opening a mood screen again does not refetch, nor flash the wrong
    // screen. A write re-checks only while the answer is still unknown (see
    // invalidateMoodEntries in useMood); a dashboard refresh or an account
    // switch starts over.
    staleTime: Infinity,
    gcTime: Infinity,
    // A failed probe throws so React Query retries and keeps any earlier answer
    // rather than caching "unknown" over it.
    queryFn: async () =>
      (await fetchMoodCheckinsForDate(todayInZone(timezone))) !== null,
  });

  return {
    supported: query.data ?? null,
    isLoading: query.isLoading,
    retry: () => void query.refetch(),
    retrying: query.isFetching,
  };
}
