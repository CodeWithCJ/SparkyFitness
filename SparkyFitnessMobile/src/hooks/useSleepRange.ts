import { useQuery } from '@tanstack/react-query';
import { isValidTimeZone, todayInZone } from '@workspace/shared';
import { ApiError } from '../services/api/errors';
import { fetchSleepEntries } from '../services/api/sleepApi';
import { RANGE_DAYS, type HealthTrendDateRange } from '../types/healthTrends';
import {
  laneForStageType,
  type SleepEntry,
  type SleepStageEvent,
  type SleepTimelineDay,
  type SleepTimelineSegment,
  type SleepTimelineSummary,
} from '../types/sleep';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { resolveSleepZone } from '../utils/sleepDay';
import { selectMainSleep } from '../utils/sleepSessions';
import { sleepRangeQueryKey } from './queryKeys';
import { usePreferences } from './usePreferences';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * Two same-stage events no further apart than this are drawn as one block.
 *
 * Sources emit a fresh stage event per sampling interval, so an unbroken stretch of light
 * sleep arrives as dozens of back-to-back events; collapsing them is what keeps a 90-day
 * window renderable. The tolerance is not zero because sources round their boundaries to
 * the second — but it is small enough that a genuine gap in the night survives as a gap,
 * rather than being painted over with sleep that did not happen.
 */
const SEGMENT_MERGE_TOLERANCE_MS = 60_000;

const EMPTY_SUMMARY: SleepTimelineSummary = {
  days: [],
  averageTimeInBedSeconds: null,
  averageTimeAsleepSeconds: null,
  nightsWithData: 0,
};

const isForbiddenError = (error: unknown): boolean =>
  error instanceof ApiError && error.statusCode === 403;

interface UseSleepRangeOptions {
  range: HealthTrendDateRange;
  enabled?: boolean;
}

const toSegment = (stage: SleepStageEvent): SleepTimelineSegment | null => {
  const startMs = new Date(stage.start_time).getTime();
  const endMs = new Date(stage.end_time).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  return { stage: laneForStageType(stage.stage_type), startMs, endMs };
};

const mergeAdjacentSegments = (
  segments: SleepTimelineSegment[]
): SleepTimelineSegment[] => {
  const merged: SleepTimelineSegment[] = [];

  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    const isContinuation =
      previous !== undefined &&
      previous.stage === segment.stage &&
      segment.startMs - previous.endMs <= SEGMENT_MERGE_TOLERANCE_MS;

    if (!isContinuation) {
      merged.push(segment);
      continue;
    }

    merged[merged.length - 1] = {
      ...previous,
      endMs: Math.max(previous.endMs, segment.endMs),
    };
  }

  return merged;
};

/**
 * The stage blocks for one session.
 *
 * A source reporting no usable stages still has to draw something, so its whole
 * bedtime-to-wake span collapses to a single `other` block. Those sources are common, and
 * dropping their nights would show an empty chart to someone who definitely slept.
 */
const buildSessionSegments = (entry: SleepEntry): SleepTimelineSegment[] => {
  const stageSegments = entry.stage_events
    .map(toSegment)
    .filter((segment): segment is SleepTimelineSegment => segment !== null)
    .sort((first, second) => first.startMs - second.startMs);

  if (stageSegments.length > 0) return mergeAdjacentSegments(stageSegments);

  const startMs = new Date(entry.bedtime).getTime();
  const endMs = new Date(entry.wake_time).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return [];

  return [{ stage: 'other', startMs, endMs }];
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const groupEntriesByDay = (
  entries: SleepEntry[]
): Map<string, SleepEntry[]> => {
  const entriesByDay = new Map<string, SleepEntry[]>();

  for (const entry of entries) {
    const entriesForDay = entriesByDay.get(entry.entry_date);
    if (entriesForDay) {
      entriesForDay.push(entry);
      continue;
    }

    entriesByDay.set(entry.entry_date, [entry]);
  }

  return entriesByDay;
};

/**
 * Maps the window's sleep onto one plotted column per day.
 *
 * Only each day's **main sleep** is plotted; naps are dropped. A nap sits hours away from
 * the night on the clock axis, so including it would stretch the shared axis far enough to
 * squash every real night in the window — one afternoon nap would degrade the whole chart.
 * "Main sleep" is `selectMainSleep`'s rule, shared with the Diary so the two surfaces can
 * never disagree about which session was the night.
 *
 * Sessions keep the server's `entry_date` bucketing — the day the user woke up — so a
 * night sits under the morning that ended it and its blocks start before that day's
 * midnight. That is intentional: the clock axis places the blocks, and re-bucketing on
 * bedtime would put the trend chart out of step with the Diary and Sleep Details.
 */
export const buildSleepTimelineSummary = (
  entries: SleepEntry[],
  endDay: string,
  days: number,
  profileTimezone?: string | null
): SleepTimelineSummary => {
  const entriesByDay = groupEntriesByDay(entries);

  const timelineDays: SleepTimelineDay[] = [];
  const nightsWithSleep: SleepTimelineDay[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = addDays(endDay, -(days - 1 - dayOffset));
    const mainSleep = selectMainSleep(entriesByDay.get(day) ?? []);

    if (!mainSleep) {
      timelineDays.push({
        day,
        timeInBedSeconds: 0,
        timeAsleepSeconds: null,
        segments: [],
        zone: null,
      });
      continue;
    }

    const timelineDay: SleepTimelineDay = {
      day,
      timeInBedSeconds: mainSleep.duration_in_seconds,
      // Null rather than zero when the source did not report it, so "nobody told us" stays
      // distinguishable from "slept no time at all".
      timeAsleepSeconds: mainSleep.time_asleep_in_seconds,
      segments: buildSessionSegments(mainSleep),
      // The night is plotted on the clock it was slept on, not the one the phone is
      // currently set to, so a trip does not shift a fortnight of nights up the axis.
      zone: resolveSleepZone(mainSleep, profileTimezone),
    };

    timelineDays.push(timelineDay);
    nightsWithSleep.push(timelineDay);
  }

  const reportedAsleepSeconds = nightsWithSleep
    .map((night) => night.timeAsleepSeconds)
    .filter((seconds): seconds is number => seconds !== null);

  return {
    days: timelineDays,
    averageTimeInBedSeconds: average(
      nightsWithSleep.map((night) => night.timeInBedSeconds)
    ),
    averageTimeAsleepSeconds: average(reportedAsleepSeconds),
    nightsWithData: nightsWithSleep.length,
  };
};

/**
 * Today as the account sees it, not as the phone does.
 *
 * The server buckets sleep by `entry_date` in the profile timezone, so a device sitting in
 * a different zone asks for — and labels the chart's last column with — a day the account
 * has not reached (or has already left). Falls back to device-local while preferences are
 * still loading or hold a timezone this runtime cannot resolve.
 */
const resolveToday = (timezone: string | null | undefined): string =>
  timezone && isValidTimeZone(timezone)
    ? todayInZone(timezone)
    : getTodayDate();

export function useSleepRange({ range, enabled = true }: UseSleepRangeOptions) {
  const { preferences } = usePreferences({ enabled });
  const profileTimezone = preferences?.timezone;
  const today = resolveToday(profileTimezone);
  const days = RANGE_DAYS[range];
  const startDate = addDays(today, -(days - 1));

  const query = useQuery({
    queryKey: sleepRangeQueryKey(startDate, today),
    queryFn: () => fetchSleepEntries(startDate, today),
    enabled,
    select: (entries) =>
      buildSleepTimelineSummary(entries, today, days, profileTimezone),
  });

  useRefetchOnFocus(query.refetch, enabled);

  // A delegate holding `checkin` but not `reports` is refused only this request. The
  // trends pager should drop the sleep page rather than show the whole dashboard an
  // error state, so a 403 reads as "no data" instead of a failure.
  const isForbidden = isForbiddenError(query.error);

  return {
    sleep: query.data ?? EMPTY_SUMMARY,
    isLoading: query.isLoading,
    isError: query.isError && !isForbidden,
    refetch: query.refetch,
  };
}
