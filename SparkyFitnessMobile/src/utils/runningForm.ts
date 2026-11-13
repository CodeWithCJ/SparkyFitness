import { classifyActivitySport } from '@workspace/shared';
import type { ExerciseActivityQueryItem } from '@workspace/shared';

/** One run's form, in the order the runs happened. */
export interface RunFormPoint {
  day: string;
  /** Steps per minute. */
  cadence: number | null;
  /** Centimetres per step. */
  strideLengthCm: number | null;
}

export interface RunFormTrend {
  points: RunFormPoint[];
  cadence: FormSeriesSummary | null;
  stride: FormSeriesSummary | null;
}

/** The newest reading, the average of the range, and how the newest compares. */
export interface FormSeriesSummary {
  latest: number;
  average: number;
  /** Latest minus the average of the runs before it; null with one run. */
  change: number | null;
  /** The readings, oldest first, for the bars. */
  values: number[];
}

const positive = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;

function summarize(values: number[]): FormSeriesSummary | null {
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const earlier = values.slice(0, -1);
  const mean = (list: number[]) =>
    list.reduce((sum, v) => sum + v, 0) / list.length;
  return {
    latest,
    average: mean(values),
    change: earlier.length > 0 ? latest - mean(earlier) : null,
    values,
  };
}

/**
 * Cadence and stride across the runs in a list, treadmill and outdoor alike.
 * Walks, rides and strength sessions are left out, and a run the phone could
 * not measure (no cadence and no stride) adds nothing. Oldest first.
 */
export function runFormTrend(
  sessions: readonly ExerciseActivityQueryItem[]
): RunFormTrend {
  const points = sessions
    .filter(
      (session) =>
        classifyActivitySport({
          exerciseName: session.exerciseName,
          category: session.category,
        }).sport === 'running'
    )
    .map((session) => ({
      day: session.entryDate,
      time: session.entryTime ?? '',
      cadence: positive(session.avgCadence),
      strideLengthCm: positive(session.strideLengthCm),
    }))
    .filter((p) => p.cadence != null || p.strideLengthCm != null)
    .sort((a, b) =>
      a.day === b.day
        ? a.time.localeCompare(b.time)
        : a.day.localeCompare(b.day)
    )
    .map(({ day, cadence, strideLengthCm }) => ({
      day,
      cadence,
      strideLengthCm,
    }));
  const series = (pick: (p: RunFormPoint) => number | null) =>
    summarize(points.map(pick).filter((v): v is number => v != null));
  return {
    points,
    cadence: series((p) => p.cadence),
    stride: series((p) => p.strideLengthCm),
  };
}
