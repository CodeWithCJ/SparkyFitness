import { getMetabolicStage, type MetabolicStage } from '../constants/fasting';
import {
  formatMobileDuration,
  formatMobileNumber,
  mobileT,
} from '../localization';
import { toLocalDateString, formatDateLabel } from './dateUtils';
import type { FastingLog, FastingStats } from '../types/fasting';

const MS_PER_HOUR = 1000 * 60 * 60;

/** Formats an elapsed duration as HH:MM:SS (hours are not capped at 24). */
export function formatElapsedClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) =>
    formatMobileNumber(n, {
      maximumFractionDigits: 0,
      minimumIntegerDigits: 2,
      useGrouping: false,
    });
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Formats a duration with natural Saudi Arabic hour/minute plurals. */
export function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  return formatMobileDuration(totalMinutes);
}

/**
 * Derived timer values for a fast. Goal hours and progress derive solely from
 * `targetEndTime − startTime`. When `targetEndTime` is null the fast is
 * elapsed-only (no goal, no progress bar, no remaining label).
 */
export interface FastTimerValues {
  elapsedMs: number;
  elapsedHours: number;
  remainingMs: number | null;
  /** 0..1, clamped. `0` when there is no goal. */
  progress: number;
  hasGoal: boolean;
  goalHours: number | null;
  stage: MetabolicStage;
  hhmmss: string;
  /** "Xh Ym" elapsed. */
  elapsedLabel: string;
  /** "Xh Ym" remaining, or null when there is no goal. */
  remainingLabel: string | null;
}

export function computeFastTimerValues(
  startTime: string,
  targetEndTime: string | null | undefined,
  now: number,
): FastTimerValues {
  const startMs = new Date(startTime).getTime();
  const safeStart = Number.isNaN(startMs) ? now : startMs;
  const elapsedMs = Math.max(0, now - safeStart);
  const elapsedHours = elapsedMs / MS_PER_HOUR;

  const targetMs = targetEndTime ? new Date(targetEndTime).getTime() : NaN;
  const hasGoal = Number.isFinite(targetMs) && targetMs > safeStart;

  let remainingMs: number | null = null;
  let progress = 0;
  let goalHours: number | null = null;
  let remainingLabel: string | null = null;

  if (hasGoal) {
    const totalMs = Math.max(1, targetMs - safeStart);
    remainingMs = Math.max(0, targetMs - now);
    progress = Math.min(1, Math.max(0, elapsedMs / totalMs));
    goalHours = totalMs / MS_PER_HOUR;
    remainingLabel = formatHoursMinutes(remainingMs);
  }

  return {
    elapsedMs,
    elapsedHours,
    remainingMs,
    progress,
    hasGoal,
    goalHours,
    stage: getMetabolicStage(elapsedHours),
    hhmmss: formatElapsedClock(elapsedMs),
    elapsedLabel: formatHoursMinutes(elapsedMs),
    remainingLabel,
  };
}

/** Returns the shared Gregorian Saudi Arabic date label. */
export function relativeDayLabel(dateString: string): string {
  return formatDateLabel(dateString);
}

/**
 * "Last fast 16h 4m · yesterday" line for the idle card, built from the newest
 * history row. Returns null when there is no usable completed fast (e.g. a row
 * with `duration_minutes = null`), so the caller can omit the line entirely.
 */
export function formatLastFast(
  log: FastingLog | null | undefined,
): string | null {
  if (!log || log.duration_minutes == null) return null;
  const duration = formatHoursMinutes(log.duration_minutes * 60000);
  const refDate = log.end_time ?? log.start_time;
  if (!refDate) return mobileT('fasting.lastFast', { duration });
  return mobileT('fasting.lastFastWithDate', {
    duration,
    date: relativeDayLabel(toLocalDateString(refDate)),
  });
}

export interface FastingStatsDisplay {
  /** Average fast length, e.g. "15.8"; "—" when there are no completed fasts. */
  avgFastValue: string;
  avgFastUnit: string;
  /** Completed fast count, e.g. "47"; "0" when none. */
  fastsCount: string;
  /** Total hours fasted, e.g. "742"; "—" when none. */
  totalValue: string;
  totalUnit: string;
}

function toFiniteNumber(
  value: string | number | null | undefined,
): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Null-safe formatting for `/api/fasting/stats`. The SUM/AVG come back `null`
 * with no completed fasts and the count comes back as a string ("0"), so every
 * value coalesces.
 */
export function formatFastingStats(
  stats: FastingStats | null | undefined,
): FastingStatsDisplay {
  const avgMin = toFiniteNumber(stats?.average_duration_minutes);
  const totalMin = toFiniteNumber(stats?.total_minutes_fasted);
  const count = toFiniteNumber(stats?.total_completed_fasts);

  return {
    avgFastValue:
      avgMin != null
        ? formatMobileNumber(avgMin / 60, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })
        : '—',
    avgFastUnit: avgMin != null ? 'ساعة' : '',
    fastsCount:
      count != null
        ? formatMobileNumber(Math.round(count), { maximumFractionDigits: 0 })
        : formatMobileNumber(0),
    totalValue:
      totalMin != null
        ? formatMobileNumber(Math.round(totalMin / 60), {
            maximumFractionDigits: 0,
          })
        : '—',
    totalUnit: totalMin != null ? 'ساعة' : '',
  };
}
