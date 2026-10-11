import { instantToDay } from '@workspace/shared';
import {
  getMetabolicStageIndex,
  getMetabolicStage,
} from '../constants/fasting';
import type { FastingLog } from '../types/fasting';
import { addDays, toLocalDateString } from './dateUtils';

export type FastingReportRange = 7 | 30 | 90;

export interface FastingReportSummary {
  totalFasts: number;
  totalHours: number;
  avgHours: number;
  longestHours: number;
}

export interface FastingDayTotal {
  /** YYYY-MM-DD calendar day of the fast's start, in the report timezone. */
  date: string;
  hours: number;
}

const minutesOf = (fast: FastingLog) => Math.max(0, fast.duration_minutes ?? 0);

/** Only finished fasts count toward the report; an active fast has no duration yet. */
export function completedFasts(fasts: FastingLog[]): FastingLog[] {
  return fasts.filter(
    (f) => f.status !== 'ACTIVE' && f.duration_minutes != null
  );
}

export function summarizeFasts(fasts: FastingLog[]): FastingReportSummary {
  const done = completedFasts(fasts);
  const totalMinutes = done.reduce((sum, f) => sum + minutesOf(f), 0);
  const longestMinutes = done.reduce(
    (max, f) => Math.max(max, minutesOf(f)),
    0
  );
  return {
    totalFasts: done.length,
    totalHours: totalMinutes / 60,
    avgHours: done.length ? totalMinutes / done.length / 60 : 0,
    longestHours: longestMinutes / 60,
  };
}

/** Inclusive list of YYYY-MM-DD days ending on `endDate`, oldest first. */
export function reportDays(endDate: string, range: FastingReportRange) {
  return Array.from({ length: range }, (_, i) =>
    addDays(endDate, i - (range - 1))
  );
}

/** Fasts whose start day falls inside the report window. */
export function fastsInWindow(
  fasts: FastingLog[],
  endDate: string,
  range: FastingReportRange,
  timezone?: string
): FastingLog[] {
  const days = new Set(reportDays(endDate, range));
  return fasts.filter((f) => days.has(startDay(f.start_time, timezone)));
}

/** One entry per day in the window (zero-filled), summing fasts by start day. */
export function dailyTotals(
  fasts: FastingLog[],
  endDate: string,
  range: FastingReportRange,
  timezone?: string
): FastingDayTotal[] {
  const byDay = new Map<string, number>();
  for (const fast of completedFasts(fasts)) {
    const day = startDay(fast.start_time, timezone);
    byDay.set(day, (byDay.get(day) ?? 0) + minutesOf(fast) / 60);
  }
  return reportDays(endDate, range).map((date) => ({
    date,
    hours: byDay.get(date) ?? 0,
  }));
}

/** Profile timezone when one was passed; otherwise the device's calendar day. */
function startDay(timestamp: string, timezone?: string): string {
  return timezone
    ? instantToDay(timestamp, timezone)
    : toLocalDateString(timestamp);
}

/** Number of fasts whose duration lands in each metabolic stage (same order as `METABOLIC_STAGES`). */
export function zoneCounts(fasts: FastingLog[], stageCount: number): number[] {
  const counts = Array.from({ length: stageCount }, () => 0);
  for (const fast of completedFasts(fasts)) {
    const index = getMetabolicStageIndex(
      getMetabolicStage(minutesOf(fast) / 60)
    );
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

/** Heatmap intensity bucket: 0 = no fast, 1..4 by day total (<12h, <16h, <20h, 20h+). */
export function heatLevel(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (hours <= 0) return 0;
  if (hours < 12) return 1;
  if (hours < 16) return 2;
  if (hours < 20) return 3;
  return 4;
}
