import type { SleepEntry } from '../types/sleep';

/**
 * Ranks two entries so the day's main sleep sorts first.
 *
 * Ranking is on `duration_in_seconds`, never `time_asleep_in_seconds`: the latter is
 * nullable, so ranking on it would push any entry whose source omits it to the bottom and
 * misclassify a full night as a nap.
 *
 * Equal durations tie-break on the earlier `bedtime`. The tie-break exists purely to make
 * the outcome deterministic — without it, two same-length entries would promote whichever
 * the server happened to return first.
 */
export const compareByMainSleepRank = (
  first: SleepEntry,
  second: SleepEntry
): number => {
  const durationDifference =
    second.duration_in_seconds - first.duration_in_seconds;
  if (durationDifference !== 0) return durationDifference;

  return first.bedtime.localeCompare(second.bedtime);
};

/**
 * The main sleep among sessions already filtered to one day, or null when there are none.
 *
 * The longest session wins, with deliberately no minimum-duration floor: any threshold
 * would misclassify shift workers and polyphasic sleepers. The trade-off is that a day
 * holding only two short naps promotes the longer one, which is accepted as the simpler
 * rule.
 *
 * Shared with the Diary's `classifySleepDay` so "which session is the night" has exactly
 * one definition — the trend chart and the Diary cards must never disagree about it.
 */
export const selectMainSleep = (
  entriesForDay: SleepEntry[]
): SleepEntry | null => {
  if (entriesForDay.length === 0) return null;

  return [...entriesForDay].sort(compareByMainSleepRank)[0];
};
