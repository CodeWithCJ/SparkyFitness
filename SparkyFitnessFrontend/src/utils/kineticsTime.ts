/**
 * Time helpers for the Diary's modeled-curve cards (active caffeine, estimated
 * blood alcohol). Their charts and labels describe the diary day on screen,
 * which is often not today, so every time is told relative to that day.
 *
 * The diary picks its day in the profile's time zone (todayInZone), so days,
 * midnights and clock labels here use that zone too, never the browser's.
 */
import { format } from 'date-fns';
import {
  dayToUtcRange,
  daysBetween,
  instantHourMinute,
  instantToDay,
  isDayString,
} from '@workspace/shared';
import { getDateLocale } from '@/utils/languageUtils';
import { formatTimeInZone } from '@/utils/timeFormatters';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** How instants are read and written: the profile's zone, time format and language. */
export interface KineticsClock {
  timeZone: string;
  /** Time of day in the user's time format, e.g. "20:00" or "8:00 PM". */
  time: (instant: number) => string;
  /** Short date in the user's language, e.g. "Sep 5". */
  shortDate: (instant: number) => string;
}

export const kineticsClock = (
  timeZone: string,
  timeFormat: string,
  language: string
): KineticsClock => {
  const zone = { kind: 'tz', tz: timeZone } as const;
  const locale = getDateLocale(language);
  return {
    timeZone,
    time: (instant) => formatTimeInZone(instant, zone, timeFormat),
    shortDate: (instant) => {
      if (!Number.isFinite(instant)) return '';
      // The zone's calendar day at local noon, so no DST gap can move it.
      const [y, m, d] = instantToDay(instant, timeZone).split('-').map(Number);
      return format(new Date(y!, m! - 1, d!, 12), 'MMM d', { locale });
    },
  };
};

/**
 * The instants that bound a YYYY-MM-DD day in `timeZone` (midnight to next
 * midnight), or null when the string is not a day.
 */
export const zonedDayBounds = (
  day: string,
  timeZone: string
): { startMs: number; endMs: number } | null => {
  if (!isDayString(day)) return null;
  const { start, end } = dayToUtcRange(day, timeZone);
  return { startMs: start.getTime(), endMs: end.getTime() };
};

/** Whole days from the viewed day to the day `instant` falls on, in the zone. */
const daysFrom = (viewedDay: string, instant: number, timeZone: string) =>
  daysBetween(viewedDay, instantToDay(instant, timeZone));

/**
 * Formats an instant relative to the diary day being viewed (YYYY-MM-DD).
 * - Same day: "HH:MM"
 * - Yesterday: "Yesterday, HH:MM"
 * - Tomorrow: "Tomorrow, HH:MM"
 * - Other days: "MMM D, HH:MM"
 */
export const formatRelativeDateTime = (
  instant: string | number | Date,
  viewedDateStr: string,
  clock: KineticsClock,
  labels?: {
    yesterday?: string;
    tomorrow?: string;
  }
) => {
  const ms = (instant instanceof Date ? instant : new Date(instant)).getTime();
  const time = clock.time(ms);
  if (!Number.isFinite(ms) || !isDayString(viewedDateStr)) return time;

  const diffDays = daysFrom(viewedDateStr, ms, clock.timeZone);
  if (diffDays === 0) {
    return time;
  }
  if (diffDays === -1) {
    const yLabel = labels?.yesterday || 'Yesterday';
    return `${yLabel}, ${time}`;
  }
  if (diffDays === 1) {
    const tLabel = labels?.tomorrow || 'Tomorrow';
    return `${tLabel}, ${time}`;
  }
  return `${clock.shortDate(ms)}, ${time}`;
};

/**
 * An axis tick relative to the viewed day: a bare HH:MM on that day, the date
 * at another day's midnight, otherwise "+1d HH:MM" / "-1d HH:MM".
 */
export const formatDayRelativeTick = (
  instant: number,
  viewedDateStr: string,
  clock: KineticsClock
) => {
  const time = clock.time(instant);
  if (!isDayString(viewedDateStr)) return time;
  const diffDays = daysFrom(viewedDateStr, instant, clock.timeZone);

  if (diffDays === 0) {
    return time;
  }
  const { hour, minute } = instantHourMinute(instant, clock.timeZone);
  if (hour === 0 && minute === 0) {
    return clock.shortDate(instant);
  }
  if (diffDays > 0) {
    return `+${diffDays}d ${time}`;
  }
  return `${diffDays}d ${time}`;
};

/** Ticks on each full hour of `timeZone` from `start` to `end`, both included. */
export const hourlyTicks = (
  start: number,
  end: number,
  timeZone: string
): number[] => {
  const { minute } = instantHourMinute(start, timeZone);
  // Zone offsets are whole minutes, so seconds and milliseconds are the same
  // in every zone.
  const remainderMs =
    minute * MINUTE_MS + (((start % MINUTE_MS) + MINUTE_MS) % MINUTE_MS);
  const first = remainderMs === 0 ? start : start + (HOUR_MS - remainderMs);
  const ticks: number[] = [];
  for (let t = first; t <= end; t += HOUR_MS) ticks.push(t);
  return ticks;
};
