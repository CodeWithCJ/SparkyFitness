import { useQuery } from '@tanstack/react-query';

import { fetchSleepEntries } from '../services/api/sleepApi';
import type { SleepEntry, SleepStageEvent } from '../types/sleep';
import { addDays } from '../utils/dateUtils';
import { selectMainSleep } from '../utils/sleepSessions';
import { sleepDayQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

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
    select: (entries: SleepEntry[]) => {
      const entry = entries.find((e) => e.id === entryId) ?? null;
      // Whether this session is its day's night rather than a nap, by the same
      // rule as the Diary and the trend charts.
      const isMainSleep =
        entry != null &&
        selectMainSleep(
          entries.filter((e) => e.entry_date === entry.entry_date)
        )?.id === entry.id;
      return { entry, isMainSleep };
    },
  });

  useRefetchOnFocus(entryQuery.refetch);

  const entry = entryQuery.data?.entry ?? null;

  return {
    entry,
    isMainSleep: entryQuery.data?.isMainSleep ?? false,
    stages: entry?.stage_events ?? NO_STAGES,
    isLoading: entryQuery.isLoading,
    isError: entryQuery.isError,
    refetch: entryQuery.refetch,
  };
}
