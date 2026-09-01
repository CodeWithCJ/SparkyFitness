import { instantHourMinuteInZone, type RecordZone } from '@workspace/shared';

import type {
  SleepStageLane,
  SleepTimelineDay,
  SleepTimelineSegment,
} from '../../types/sleep';

/**
 * The clock-axis arithmetic behind the Dashboard sleep timeline.
 *
 * Split out from the chart for the same reason `buildHypnogramSegments` is: Skia draws
 * nothing assertable under jsdom, so every number the chart needs is computed here where
 * it can be tested, and the component is left to measure, pick colours, and draw.
 */

export const MINUTES_PER_DAY = 1440;

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_MINUTE = 60_000;

/**
 * Where the axis starts when the data suggests nothing better — 6 PM, late enough to put
 * a conventional night in the upper half of the plot.
 */
export const DEFAULT_SLEEP_CLOCK_ANCHOR_HOUR = 18;

/** Skia refuses a zero-height rect, and a stage that occurred must be visible. */
const MIN_BLOCK_HEIGHT = 1;

const MIN_COLUMN_WIDTH = 1;

/** Stops a single 20-minute nap from being drawn as a full-height column. */
const MIN_DOMAIN_SPAN_MINUTES = 360;

const TARGET_TICK_COUNT = 6;
const TICK_STEP_CHOICES_MINUTES = [60, 120, 180, 240, 360, 480];

export interface SleepTimelineBlock {
  y: number;
  height: number;
  stage: SleepStageLane;
}

export interface SleepTimelineColumn {
  dayIndex: number;
  x: number;
  width: number;
  blocks: SleepTimelineBlock[];
}

export interface SleepTimelineTick {
  /** Minutes past the anchor, for the caller to turn back into a clock label. */
  minutes: number;
  y: number;
}

export interface SleepTimelineDomain {
  startMinutes: number;
  endMinutes: number;
}

export interface SleepTimelineLayout {
  columns: SleepTimelineColumn[];
  domain: SleepTimelineDomain;
  ticks: SleepTimelineTick[];
}

export interface SleepTimelineLayoutOptions {
  width: number;
  height: number;
  anchorMinutes: number;
  /** Fraction of each day's slot left as the gap between columns. */
  innerPadding: number;
}

/**
 * The wall-clock minute an instant fell on, in the zone the night was recorded in.
 *
 * A null zone means nothing recorded where the user was, so the device's own clock is the
 * only reading available.
 */
const minutesOfDayInZone = (ms: number, zone: RecordZone | null): number => {
  if (zone) {
    const { hour, minute } = instantHourMinuteInZone(ms, zone);
    return hour * MINUTES_PER_HOUR + minute;
  }

  const instant = new Date(ms);
  return instant.getHours() * MINUTES_PER_HOUR + instant.getMinutes();
};

/**
 * Where an instant sits on the axis, as minutes past the anchor.
 *
 * Wall-clock time, never UTC: the axis is a clock face, so a 23:00 bedtime belongs at
 * 23:00 — and specifically at the 23:00 the user went to bed at, which is why the zone
 * travels with the night rather than being read off the device. Mapping through the anchor
 * is what keeps a night monotonic: with a 21:00 anchor, 23:00 lands at 120 and the 01:00
 * that follows lands at 240, so the night reads straight down the column instead of
 * wrapping at midnight.
 */
export const toClockOffsetMinutes = (
  ms: number,
  anchorMinutes: number,
  zone: RecordZone | null = null
): number =>
  (minutesOfDayInZone(ms, zone) - anchorMinutes + MINUTES_PER_DAY) %
  MINUTES_PER_DAY;

const durationMinutes = (segment: SleepTimelineSegment): number =>
  Math.max(0, (segment.endMs - segment.startMs) / MS_PER_MINUTE);

/**
 * How far around the clock face a segment travels, in wall-clock minutes.
 *
 * Not its elapsed duration. On a DST night the clock skips or repeats an hour, so a
 * 23:00–07:00 sleep is seven or nine real hours but is eight hours of clock face either
 * way — and the axis is a clock, so the block has to end where the sleeper's clock said
 * they woke. Adding elapsed minutes to the bedtime instead draws the night an hour short
 * in spring and an hour long in autumn.
 *
 * Two wall-clock readings cannot say how many whole revolutions passed between them, so
 * the elapsed duration picks the revolution count. An offset shift is only ever an hour
 * or two, which leaves the nearest whole day the only plausible answer.
 */
const clockSpanMinutes = (
  segment: SleepTimelineSegment,
  zone: RecordZone | null
): number => {
  const elapsedMinutes = durationMinutes(segment);
  if (elapsedMinutes <= 0) return 0;

  const startMinutes = minutesOfDayInZone(segment.startMs, zone);
  const endMinutes = minutesOfDayInZone(segment.endMs, zone);
  const withinDay =
    (endMinutes - startMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const wholeDays = Math.max(
    0,
    Math.round((elapsedMinutes - withinDay) / MINUTES_PER_DAY)
  );

  return withinDay + wholeDays * MINUTES_PER_DAY;
};

const markCoveredHours = (
  segment: SleepTimelineSegment,
  covered: boolean[],
  zone: RecordZone | null
): void => {
  const spanMinutes = clockSpanMinutes(segment, zone);
  if (spanMinutes >= MINUTES_PER_DAY) {
    covered.fill(true);
    return;
  }

  const startMinutes = minutesOfDayInZone(segment.startMs, zone);
  const firstHour = Math.floor(startMinutes / MINUTES_PER_HOUR);
  const lastHour = Math.floor((startMinutes + spanMinutes) / MINUTES_PER_HOUR);

  for (let hour = firstHour; hour <= lastHour; hour++) {
    covered[hour % HOURS_PER_DAY] = true;
  }
};

/**
 * The first hour of the day's sleep, found as the hour following the longest stretch the
 * user was reliably awake.
 *
 * Returns null when the search cannot say anything — no sleep at all, or sleep in every
 * hour of the clock.
 */
const findFirstCoveredHour = (covered: boolean[]): number | null => {
  const coveredHourCount = covered.filter(Boolean).length;
  if (coveredHourCount === 0 || coveredHourCount === HOURS_PER_DAY) return null;

  let longestRunLength = 0;
  let hourAfterLongestRun = 0;

  for (let startHour = 0; startHour < HOURS_PER_DAY; startHour++) {
    const previousHour = (startHour - 1 + HOURS_PER_DAY) % HOURS_PER_DAY;
    const isRunStart = !covered[startHour] && covered[previousHour];
    if (!isRunStart) continue;

    let runLength = 0;
    while (
      runLength < HOURS_PER_DAY &&
      !covered[(startHour + runLength) % HOURS_PER_DAY]
    ) {
      runLength++;
    }

    // Strictly greater, so the earliest of two equal-length runs wins and the anchor is
    // deterministic for a given window.
    if (runLength > longestRunLength) {
      longestRunLength = runLength;
      hourAfterLongestRun = (startHour + runLength) % HOURS_PER_DAY;
    }
  }

  return hourAfterLongestRun;
};

/**
 * Picks where the clock axis starts, so the plotted band never wraps around it.
 *
 * A fixed evening anchor would break for anyone who sleeps through it — a shift worker
 * asleep from 09:00 would have their column split across the top and bottom of the plot.
 * Searching the window for its quietest stretch instead means the axis adapts: a
 * conventional sleeper gets roughly 9 PM, close to the Apple Health look, and an unusual
 * one still gets a readable chart.
 */
export const chooseSleepClockAnchorMinutes = (
  days: SleepTimelineDay[]
): number => {
  const covered = new Array<boolean>(HOURS_PER_DAY).fill(false);
  for (const day of days) {
    for (const segment of day.segments) {
      markCoveredHours(segment, covered, day.zone);
    }
  }

  const firstCoveredHour = findFirstCoveredHour(covered);
  if (firstCoveredHour === null) {
    return DEFAULT_SLEEP_CLOCK_ANCHOR_HOUR * MINUTES_PER_HOUR;
  }

  // An hour of headroom above the earliest bedtime, so the first block is not drawn
  // flush against the top of the plot.
  const anchorHour = (firstCoveredHour - 1 + HOURS_PER_DAY) % HOURS_PER_DAY;
  return anchorHour * MINUTES_PER_HOUR;
};

interface OffsetRange {
  startMinutes: number;
  endMinutes: number;
  stage: SleepStageLane;
}

/**
 * A segment's position on the axis, as one range — or two, when it runs past the anchor.
 *
 * The split should be unreachable with a data-derived anchor, but a stage crossing the
 * anchor would otherwise map to an end offset below its start and draw as a
 * negative-height rect, which is not an acceptable way to fail.
 */
const toOffsetRanges = (
  segment: SleepTimelineSegment,
  anchorMinutes: number,
  zone: RecordZone | null
): OffsetRange[] => {
  const { stage } = segment;
  const spanMinutes = clockSpanMinutes(segment, zone);

  if (spanMinutes >= MINUTES_PER_DAY) {
    return [{ startMinutes: 0, endMinutes: MINUTES_PER_DAY, stage }];
  }

  const startMinutes = toClockOffsetMinutes(
    segment.startMs,
    anchorMinutes,
    zone
  );
  const endMinutes = startMinutes + spanMinutes;

  if (endMinutes <= MINUTES_PER_DAY) {
    return [{ startMinutes, endMinutes, stage }];
  }

  return [
    { startMinutes, endMinutes: MINUTES_PER_DAY, stage },
    { startMinutes: 0, endMinutes: endMinutes - MINUTES_PER_DAY, stage },
  ];
};

const buildDomain = (ranges: OffsetRange[]): SleepTimelineDomain => {
  if (ranges.length === 0) {
    return { startMinutes: 0, endMinutes: MIN_DOMAIN_SPAN_MINUTES };
  }

  const earliest = Math.min(...ranges.map((range) => range.startMinutes));
  const latest = Math.max(...ranges.map((range) => range.endMinutes));

  const startMinutes =
    Math.floor(earliest / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
  const paddedEndMinutes =
    Math.ceil(latest / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;

  return {
    startMinutes,
    endMinutes: Math.max(
      paddedEndMinutes,
      startMinutes + MIN_DOMAIN_SPAN_MINUTES
    ),
  };
};

const buildTicks = (
  domain: SleepTimelineDomain,
  height: number
): SleepTimelineTick[] => {
  const spanMinutes = domain.endMinutes - domain.startMinutes;
  const stepMinutes =
    TICK_STEP_CHOICES_MINUTES.find(
      (step) => spanMinutes / step <= TARGET_TICK_COUNT
    ) ?? TICK_STEP_CHOICES_MINUTES[TICK_STEP_CHOICES_MINUTES.length - 1];

  const ticks: SleepTimelineTick[] = [];
  const firstTickMinutes =
    Math.ceil(domain.startMinutes / stepMinutes) * stepMinutes;

  for (
    let minutes = firstTickMinutes;
    minutes <= domain.endMinutes;
    minutes += stepMinutes
  ) {
    ticks.push({
      minutes,
      y: ((minutes - domain.startMinutes) / spanMinutes) * height,
    });
  }

  return ticks;
};

/**
 * Lays the window's nights out as columns on a shared clock axis.
 *
 * Every day gets a column, including days with no sleep, so the x-axis labels stay
 * aligned with the nights that were actually drawn.
 */
export const buildSleepTimelineLayout = (
  days: SleepTimelineDay[],
  { width, height, anchorMinutes, innerPadding }: SleepTimelineLayoutOptions
): SleepTimelineLayout => {
  const rangesByDay = days.map((day) =>
    day.segments.flatMap((segment) =>
      toOffsetRanges(segment, anchorMinutes, day.zone)
    )
  );
  const domain = buildDomain(rangesByDay.flat());

  // The card renders once at zero size before `onLayout` reports, so this is the normal
  // first frame rather than a bad caller — return empty geometry instead of NaN.
  if (width <= 0 || height <= 0 || days.length === 0) {
    return { columns: [], domain, ticks: [] };
  }

  const spanMinutes = domain.endMinutes - domain.startMinutes;
  const slotWidth = width / days.length;
  const columnWidth = Math.max(
    MIN_COLUMN_WIDTH,
    slotWidth * (1 - innerPadding)
  );
  const columnInset = (slotWidth - columnWidth) / 2;

  const toY = (minutes: number): number =>
    ((minutes - domain.startMinutes) / spanMinutes) * height;

  const columns = rangesByDay.map((ranges, dayIndex) => ({
    dayIndex,
    x: dayIndex * slotWidth + columnInset,
    width: columnWidth,
    blocks: ranges.map((range) => {
      const blockHeight = Math.max(
        MIN_BLOCK_HEIGHT,
        toY(range.endMinutes) - toY(range.startMinutes)
      );

      return {
        // Clamped so a block sitting on the axis floor, widened to the minimum height,
        // still ends inside the plot.
        y: Math.max(0, Math.min(toY(range.startMinutes), height - blockHeight)),
        height: blockHeight,
        stage: range.stage,
      };
    }),
  }));

  return { columns, domain, ticks: buildTicks(domain, height) };
};
