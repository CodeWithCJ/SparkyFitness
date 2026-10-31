import {
  compareDays,
  daysInRange,
  instantToDay,
  isDayString,
} from '../utils/timezone.ts';

/** The fields of a symptom entry that say which days it covers. */
export interface SymptomEntrySpan {
  entry_date: string;
  started_at?: string | null;
  ended_at?: string | null;
}

/** The days to look at, and how to place an episode's start and end on them. */
export interface SymptomDayWindow {
  /** First day to return, YYYY-MM-DD. */
  from: string;
  /** Last day to return, YYYY-MM-DD, inclusive. */
  to: string;
  /** Today in `timezone`. An episode that has not ended runs up to it. */
  today: string;
  /** The user's timezone, the one the server reads `entry_date` in. */
  timezone: string;
}

const laterDay = (a: string, b: string) => (compareDays(a, b) >= 0 ? a : b);
const earlierDay = (a: string, b: string) => (compareDays(a, b) <= 0 ? a : b);

/**
 * The day of an instant in `timezone`, or null when it is not a valid time or
 * falls outside the years 1000 to 9999 that a day string holds. Intl prints
 * other years unpadded, or without their BC era, so both are checked.
 */
function dayOfInstant(iso: string, timezone: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || at.getUTCFullYear() < 1000) return null;
  const day = instantToDay(at, timezone);
  return isDayString(day) ? day : null;
}

/**
 * The days within the window that a symptom entry covers, oldest first.
 *
 * Every entry covers the day it is logged under (`entry_date`). An episode, an
 * entry with `started_at`, also covers each day from the one it started on to
 * the one it ended on, or to today while it is still going, so a migraine from
 * Monday night to Wednesday shows on all three days. The end never comes
 * before the start: an episode still going that starts after today, or one
 * whose end cannot be read, covers its start day only, and one whose start
 * cannot be read covers its logged day only.
 */
export function symptomEntryDays(
  entry: SymptomEntrySpan,
  { from, to, today, timezone }: SymptomDayWindow
): string[] {
  const days = new Set<string>();
  const logged = entry.entry_date.slice(0, 10);
  if (compareDays(logged, from) >= 0 && compareDays(logged, to) <= 0) {
    days.add(logged);
  }

  const start = entry.started_at
    ? dayOfInstant(entry.started_at, timezone)
    : null;
  if (start) {
    const end = entry.ended_at ? dayOfInstant(entry.ended_at, timezone) : today;
    const last = end ? laterDay(end, start) : start;
    for (const day of daysInRange(
      laterDay(start, from),
      earlierDay(last, to)
    )) {
      days.add(day);
    }
  }

  return [...days].sort();
}
