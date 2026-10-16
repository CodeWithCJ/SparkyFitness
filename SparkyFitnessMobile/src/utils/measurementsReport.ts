import type { CheckInMeasurementRange } from '../types/measurements';
import { addDays } from './dateUtils';
import { average } from './mathUtils';

/** Check-in readings the Measurements report tracks over time (steps are averaged instead). */
export const MEASUREMENT_METRICS = [
  'weight',
  'body_fat_percentage',
  'muscle_mass_kg',
  'waist',
  'hips',
  'neck',
] as const;

export type MeasurementMetric = (typeof MEASUREMENT_METRICS)[number];

export interface MeasurementPoint {
  day: string;
  value: number;
}

export interface MeasurementTrend {
  /** One point per day that has a reading, oldest first. */
  points: MeasurementPoint[];
  first: number | null;
  latest: number | null;
  /** latest - first over the window; null with fewer than two readings. */
  change: number | null;
  min: number | null;
  max: number | null;
}

export interface MeasurementsReport {
  metrics: Record<MeasurementMetric, MeasurementTrend>;
  /** One value per day in the window (0 where nothing was recorded). */
  steps: { day: string; steps: number }[];
  /** Mean steps over days that recorded any; null when none did. */
  averageSteps: number | null;
  stepDays: number;
  /** Days in the window with any check-in reading. */
  checkInDays: number;
}

const trendOf = (points: MeasurementPoint[]): MeasurementTrend => {
  const values = points.map((p) => p.value);
  const first = values[0] ?? null;
  const latest = values[values.length - 1] ?? null;
  return {
    points,
    first,
    latest,
    change:
      first === null || latest === null || points.length < 2
        ? null
        : latest - first,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
};

/**
 * Check-in measurements for a window ending `startDate + days - 1`. Rows are
 * sorted by `updated_at` so the newest edit per day and field counts, whatever
 * order the range endpoint returns. Readings stay in stored units (kg / cm);
 * the screen converts for display.
 */
export function buildMeasurementsReport(
  rows: CheckInMeasurementRange[],
  startDate: string,
  days: number
): MeasurementsReport {
  const seen = new Map<MeasurementMetric, Map<string, number>>(
    MEASUREMENT_METRICS.map((metric) => [metric, new Map()])
  );
  const stepsByDay = new Map<string, number>();
  const daysWithData = new Set<string>();

  const newestFirst = [...rows].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );

  for (const row of newestFirst) {
    for (const metric of MEASUREMENT_METRICS) {
      const value = row[metric];
      const bucket = seen.get(metric);
      if (value != null && Number(value) > 0 && !bucket?.has(row.entry_date)) {
        bucket?.set(row.entry_date, Number(value));
        daysWithData.add(row.entry_date);
      }
    }
    if (row.steps != null && !stepsByDay.has(row.entry_date)) {
      stepsByDay.set(row.entry_date, row.steps);
    }
  }

  const metrics = {} as Record<MeasurementMetric, MeasurementTrend>;
  for (const metric of MEASUREMENT_METRICS) {
    const bucket = seen.get(metric) ?? new Map<string, number>();
    const points: MeasurementPoint[] = [];
    for (let i = 0; i < days; i += 1) {
      const day = addDays(startDate, i);
      const value = bucket.get(day);
      if (value !== undefined) points.push({ day, value });
    }
    metrics[metric] = trendOf(points);
  }

  const steps = Array.from({ length: days }, (_, i) => {
    const day = addDays(startDate, i);
    return { day, steps: stepsByDay.get(day) ?? 0 };
  });
  const stepDays = steps.filter((s) => s.steps > 0);

  return {
    metrics,
    steps,
    averageSteps: average(stepDays.map((s) => s.steps)),
    stepDays: stepDays.length,
    checkInDays: daysWithData.size,
  };
}
