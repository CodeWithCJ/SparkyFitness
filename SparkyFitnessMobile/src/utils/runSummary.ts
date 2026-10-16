import type { GpsTrackPoint } from '@workspace/shared';
import {
  computeLaps,
  computeSplits,
  METERS_PER_KM,
  METERS_PER_MILE,
  summarizeRecording,
  toWorkoutGpsPoints,
  type RecordedPoint,
  type RecordedSplit,
  type RecordingActivity,
} from './gpsRecording';

/** Route points kept for the summary's map: enough for the shape, small for navigation params. */
const SUMMARY_ROUTE_POINTS = 250;

/**
 * Everything the post-save summary screen shows, as plain data so it can ride
 * in navigation params. The recording itself is cleared once it is saved, so
 * the screen cannot read it back.
 */
export interface RunSummaryParams {
  activity: RecordingActivity;
  /** The diary day the activity was filed on, YYYY-MM-DD. */
  entryDate: string;
  distanceUnit: 'km' | 'miles';
  distanceMeters: number;
  activeSeconds: number;
  elevationGainMeters: number;
  avgHeartRate: number | null;
  /** A thinned route, empty for a recording with no usable track. */
  route: GpsTrackPoint[];
  /** Per km or mile splits. */
  splits: RecordedSplit[];
  /** The laps the person marked, when any. */
  laps: RecordedSplit[];
  /** An indoor session's `[active seconds, metres]` rows, for the pace chart. */
  distanceSeries?: number[][];
  /** The saved diary entry, so the screen can look up the records it set. */
  entryId?: string | null;
  /** True for a treadmill run, whose distance the person can correct. */
  editableDistance?: boolean;
  /**
   * For a watch indoor session: the learned factor the watch applied and the
   * distance it showed before any correction, so a treadmill distance entered
   * here teaches the factor (`learnWatchIndoorScale`).
   */
  watchIndoor?: { scale: number; estimatedMeters: number };
  /** For a program workout: where the person is now and what comes next. */
  program: {
    nextLine: string;
    done: number;
    total: number;
    finished: boolean;
    /** The finished workout the person can rate, when it was ticked off. */
    rate?: { programId: string; index: number } | null;
  } | null;
}

export function buildRunSummary({
  activity,
  entryDate,
  distanceUnit,
  points,
  lapMarks,
  avgHeartRate,
  program,
  entryId,
}: {
  activity: RecordingActivity;
  entryDate: string;
  distanceUnit: 'km' | 'miles';
  points: readonly RecordedPoint[];
  lapMarks: readonly number[] | undefined;
  avgHeartRate: number | null;
  program: RunSummaryParams['program'];
  entryId?: string | null;
}): RunSummaryParams {
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const summary = summarizeRecording(points);
  return {
    activity,
    entryDate,
    distanceUnit,
    distanceMeters: summary.distanceMeters,
    activeSeconds: summary.activeSeconds,
    elevationGainMeters: summary.elevationGainMeters,
    avgHeartRate,
    route:
      points.length > 1
        ? toWorkoutGpsPoints(points, SUMMARY_ROUTE_POINTS).map(
            ({ t, lat, lon }) => ({ t, lat, lon })
          )
        : [],
    splits: computeSplits(points, unitMeters),
    laps: lapMarks && lapMarks.length > 0 ? computeLaps(points, lapMarks) : [],
    program,
    entryId: entryId ?? null,
  };
}

/** The mean of the readings, or null when there are none. */
export function averageHeartRate(
  samples: readonly { bpm: number }[]
): number | null {
  if (samples.length === 0) return null;
  return Math.round(
    samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length
  );
}
