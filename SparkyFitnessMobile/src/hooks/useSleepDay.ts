import { useQuery } from '@tanstack/react-query';

import { ApiError } from '../services/api/errors';
import { fetchSleepEntries } from '../services/api/sleepApi';
import type { SleepDayBuckets, SleepEntry } from '../types/sleep';
import { addDays } from '../utils/dateUtils';
import { compareByMainSleepRank } from '../utils/sleepSessions';
import { sleepDayQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

const EMPTY_BUCKETS: SleepDayBuckets = {
  wakeUp: null,
  naps: [],
  bedTime: null,
};

interface UseSleepDayOptions {
  enabled?: boolean;
}

export interface SleepDayClassification {
  mainSleep: SleepEntry | null;
  naps: SleepEntry[];
}

const compareByBedtime = (first: SleepEntry, second: SleepEntry): number =>
  first.bedtime.localeCompare(second.bedtime);

/**
 * Splits one calendar day's sleep into its main sleep and its naps.
 *
 * The longest entry filed under `day` is the main sleep and everything else is a nap.
 * There is deliberately no minimum-duration floor: any threshold would misclassify shift
 * workers and polyphasic sleepers. The trade-off is that a day holding only two short
 * naps promotes the longer one to "main sleep", which is accepted as the simpler rule.
 *
 * `buildSleepDayBuckets` passes the whole two-day `[D, D+1]` window, so filtering on
 * `entry_date` first is load-bearing — skipping it would leak tomorrow's sleep into
 * today's cards.
 */
export const classifySleepDay = (
  entries: SleepEntry[],
  day: string
): SleepDayClassification => {
  const entriesForDay = entries.filter((entry) => entry.entry_date === day);
  if (entriesForDay.length === 0) return { mainSleep: null, naps: [] };

  const [mainSleep, ...naps] = [...entriesForDay].sort(compareByMainSleepRank);
  return { mainSleep, naps: naps.sort(compareByBedtime) };
};

/**
 * Splits a `[D, D+1]` window into the three Diary cards.
 *
 * Wake Up and Naps come from D. Bed Time comes from D+1's main sleep, because a synced
 * session is filed under the day the user woke up — the sleep begun on D is D+1's record.
 */
const buildSleepDayBuckets = (
  entries: SleepEntry[],
  day: string
): SleepDayBuckets => {
  const { mainSleep, naps } = classifySleepDay(entries, day);
  const { mainSleep: bedTime } = classifySleepDay(entries, addDays(day, 1));
  return { wakeUp: mainSleep, naps, bedTime };
};

/**
 * Loads one Diary day's sleep for the Wake Up, Naps, and Bed Time cards.
 *
 * `/api/sleep` is gated on the `checkin` permission, so a delegate without it gets a 403.
 * That is reported as `isForbidden` rather than a generic error: the Diary hides the cards
 * outright instead of showing "no sleep synced" empty states, which would misrepresent
 * unshared data as missing data.
 */
export function useSleepDay(
  day: string,
  { enabled = true }: UseSleepDayOptions = {}
) {
  const windowEnd = addDays(day, 1);

  const query = useQuery({
    queryKey: sleepDayQueryKey(day),
    queryFn: () => fetchSleepEntries(day, windowEnd),
    enabled,
    select: (entries: SleepEntry[]) => buildSleepDayBuckets(entries, day),
  });

  useRefetchOnFocus(query.refetch, enabled);

  const buckets = query.data ?? EMPTY_BUCKETS;
  const isForbidden =
    query.error instanceof ApiError && query.error.statusCode === 403;

  return {
    wakeUp: buckets.wakeUp,
    naps: buckets.naps,
    bedTime: buckets.bedTime,
    isLoading: query.isLoading,
    isError: query.isError,
    isForbidden,
    refetch: query.refetch,
  };
}
