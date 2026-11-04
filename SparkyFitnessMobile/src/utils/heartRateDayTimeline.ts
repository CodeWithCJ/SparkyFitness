import type {
  ClockParts,
  ExerciseSessionResponse,
  HealthMetricSamples,
  TimelineReading,
  TimelineWorkoutBand,
} from '@workspace/shared';
import { toLocalDateString } from './dateUtils';

/** Wall clock of an instant on this device, null for an unreadable value. */
export function deviceClockParts(instant: string): ClockParts | null {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: toLocalDateString(date),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

/**
 * Every recorded heart rate of `day`, across all of its source rows, placed by
 * the device's wall clock. A day has one row per source, so rows are merged.
 */
export function heartRateReadingsForDay(
  rows: readonly HealthMetricSamples[] | null | undefined,
  day: string
): TimelineReading[] {
  const readings: TimelineReading[] = [];
  for (const row of rows ?? []) {
    if (String(row.entry_date || '').slice(0, 10) !== day) continue;
    if (!Array.isArray(row.samples)) continue;
    for (const sample of row.samples) {
      const { t, bpm } = sample as { t?: unknown; bpm?: unknown };
      if (typeof t !== 'string' || typeof bpm !== 'number') continue;
      const parts = deviceClockParts(t);
      if (parts) {
        readings.push({ minutes: parts.hour * 60 + parts.minute, bpm });
      }
    }
  }
  return readings;
}

const clockMinutes = (time: string | null | undefined): number | null => {
  if (typeof time !== 'string' || !time.includes(':')) return null;
  const [h, m] = time.split(':');
  const hours = Number.parseInt(h ?? '', 10);
  const minutes = Number.parseInt(m ?? '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

/** Workouts of the day that have a start time, as bands for the timeline. */
export function workoutBandsFromSessions(
  sessions: readonly ExerciseSessionResponse[] | null | undefined,
  fallbackName: string
): TimelineWorkoutBand[] {
  const bands: TimelineWorkoutBand[] = [];
  for (const session of sessions ?? []) {
    const startTime =
      session.type === 'preset'
        ? session.exercises[0]?.entry_time
        : session.entry_time;
    const start = clockMinutes(startTime);
    if (start === null) continue;
    const duration = Math.max(
      1,
      Math.round(
        session.type === 'preset'
          ? session.total_duration_minutes
          : session.duration_minutes
      )
    );
    bands.push({
      id: session.id,
      name: session.name || fallbackName,
      startMinutes: start,
      endMinutes: Math.min(1439, start + duration),
    });
  }
  return bands;
}
