import { useQuery } from '@tanstack/react-query';

import { fetchSleepEntries } from '../services/api/sleepApi';
import type { SleepEntry, SleepStageEvent } from '../types/sleep';
import { addDays } from '../utils/dateUtils';
import { sleepDayQueryKey } from './queryKeys';

const NO_STAGES: SleepStageEvent[] = [];

/**
 * Loads everything the Sleep Details screen renders for one session.
 *
 * The entry itself reuses `sleepDayQueryKey(day)` — the same key and window the Diary
 * cards already populated — so arriving from a card is a cache hit rather than a second
 * request. `/api/sleep` and `/api/sleep/details` return identical payloads, so there is no
 * separate details fetch to make the whole screen.
 */
export function useSleepDetail(entryId: string, day: string) {
  const windowEnd = addDays(day, 1);

  const entryQuery = useQuery({
    queryKey: sleepDayQueryKey(day),
    queryFn: () => fetchSleepEntries(day, windowEnd),
    // A stale id (a deleted entry, a resumed deep link) resolves to null rather than
    // throwing, so the screen shows its not-found empty state instead of an error boundary.
    select: (entries: SleepEntry[]) =>
      entries.find((entry) => entry.id === entryId) ?? null,
  });

  const entry = entryQuery.data ?? null;

  return {
    entry,
    stages: entry?.stage_events ?? NO_STAGES,
    isLoading: entryQuery.isLoading,
    isError: entryQuery.isError,
    refetch: entryQuery.refetch,
  };
}
