import type { HealthMetricSamples } from '../schemas/database/HealthMetricSamples.zod.ts';
import { isValidTimeZone, localDateTimeToUtc } from './timezone.ts';

export interface WorkoutHeartRateEntry {
  /** Calendar day the workout was logged on (`YYYY-MM-DD`). */
  entry_date?: string | null;
  /** Wall-clock start time (`HH:mm` or `HH:mm:ss`) in `record_timezone`. */
  entry_time?: string | null;
  record_timezone?: string | null;
  duration_minutes?: number | null;
}

export interface WorkoutHeartRatePoint {
  /** Epoch milliseconds. */
  timestamp: number;
  bpm: number;
  /** Minutes since the first point in the series. */
  elapsedMinutes: number;
}

export interface WorkoutClockWindow {
  /** Epoch milliseconds. */
  startMs: number;
  /** Epoch milliseconds. */
  endMs: number;
}

/**
 * The wall-clock span a workout covers: `entry_time` on `entry_date` in the
 * zone it was recorded in, for `duration_minutes`. Null without a start time
 * or a duration.
 */
export function workoutClockWindow(
  entry: WorkoutHeartRateEntry | null | undefined,
  fallbackTimezone: string
): WorkoutClockWindow | null {
  const entryDate = entry?.entry_date
    ? String(entry.entry_date).slice(0, 10)
    : '';
  if (!entryDate || !entry?.entry_time) return null;
  // entry_time is wall-clock time in the zone the workout was recorded in.
  // Older and manual entries have no zone, and those were written in the
  // user's timezone, not the device's.
  const recordZone = entry.record_timezone;
  const entryZone =
    recordZone && isValidTimeZone(recordZone) ? recordZone : fallbackTimezone;
  const startMs = localDateTimeToUtc(
    `${entryDate}T${entry.entry_time}`,
    entryZone
  ).getTime();
  if (!Number.isFinite(startMs) || typeof entry.duration_minutes !== 'number') {
    return null;
  }
  return { startMs, endMs: startMs + entry.duration_minutes * 60_000 };
}

/**
 * Heart rate for one workout from the day's stored `heart_rate` samples.
 *
 * Samples tagged with the workout's id win. Without any, untagged samples
 * inside the workout's clock window are used, which is how indoor sessions
 * with no route still get a graph.
 */
export function buildWorkoutHeartRateSeries(
  buckets: readonly HealthMetricSamples[] | null | undefined,
  exerciseEntryId: string,
  entry: WorkoutHeartRateEntry | null | undefined,
  fallbackTimezone: string
): WorkoutHeartRatePoint[] {
  const window = workoutClockWindow(entry, fallbackTimezone);
  const startMs = window?.startMs ?? NaN;
  const endMs = window?.endMs ?? NaN;

  const tagged: WorkoutHeartRatePoint[] = [];
  const during: WorkoutHeartRatePoint[] = [];
  for (const bucket of buckets ?? []) {
    if (bucket.metric !== 'heart_rate') continue;
    for (const sample of bucket.samples) {
      if (typeof sample.bpm !== 'number') continue;
      const timestamp = Date.parse(sample.t);
      if (!Number.isFinite(timestamp)) continue;
      const point = { timestamp, bpm: sample.bpm, elapsedMinutes: 0 };
      if (sample.ex === exerciseEntryId) {
        tagged.push(point);
      } else if (
        !sample.ex &&
        Number.isFinite(endMs) &&
        timestamp >= startMs &&
        timestamp <= endMs
      ) {
        during.push(point);
      }
    }
  }

  const points = tagged.length > 0 ? tagged : during;
  points.sort((a, b) => a.timestamp - b.timestamp);
  const start = points[0]?.timestamp;
  if (start != null) {
    for (const point of points) {
      point.elapsedMinutes = (point.timestamp - start) / 60_000;
    }
  }
  return points;
}
