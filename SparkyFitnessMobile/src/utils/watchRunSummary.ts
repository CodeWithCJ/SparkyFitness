import {
  indoorLapWindows,
  watchRunPoints,
  type WatchRunPayload,
} from './watchRun';
import { buildRunSummary, type RunSummaryParams } from './runSummary';
import { toLocalDateString } from './dateUtils';
import type { RecordedSplit } from './gpsRecording';

const mean = (values: readonly number[]): number | null =>
  values.length > 0
    ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
    : null;

/**
 * The summary screen's data for a run the watch recorded on its own, built from
 * what it sent. Outdoors the route gives the splits, elevation and the laps the
 * wearer marked; indoors there is no route, so the laps come from the watch's
 * own marks and distances. The distance and time are the watch's figures.
 */
export function watchRunSummary(
  payload: WatchRunPayload,
  distanceUnit: 'km' | 'miles',
  program: RunSummaryParams['program'],
  entryId?: string | null
): RunSummaryParams {
  const avgHeartRate = mean(payload.heartRate.map(([, bpm]) => bpm));
  const points = watchRunPoints(payload);
  const base = buildRunSummary({
    activity: payload.kind,
    entryDate: toLocalDateString(new Date(payload.startedAt)),
    distanceUnit,
    points,
    lapMarks: payload.laps,
    avgHeartRate,
    program,
    entryId,
  });
  const laps: RecordedSplit[] =
    points.length >= 2
      ? base.laps
      : indoorLapWindows(payload).map((lap) => {
          const startT = Date.parse(lap.start_time);
          const endT = Date.parse(lap.end_time);
          return {
            index: lap.lap_index,
            distanceMeters: lap.distance_meters ?? 0,
            durationSeconds: Math.round((endT - startT) / 1000),
            startT,
            endT,
            partial: false,
          };
        });
  return {
    ...base,
    // A treadmill has no route, so the person can correct the distance to what
    // the machine showed.
    editableDistance: payload.place === 'indoor' && Boolean(entryId),
    ...(payload.place === 'indoor'
      ? {
          watchIndoor: {
            scale: payload.distanceScale ?? 1,
            estimatedMeters:
              payload.estimatedDistanceMeters ?? payload.distanceMeters,
          },
        }
      : {}),
    // The watch's own figures, not re-derived from a thinned route.
    distanceMeters:
      payload.distanceMeters > 0 ? payload.distanceMeters : base.distanceMeters,
    activeSeconds:
      payload.activeSeconds > 0 ? payload.activeSeconds : base.activeSeconds,
    laps,
    ...(payload.place === 'indoor' && payload.distanceSeries.length >= 2
      ? { distanceSeries: payload.distanceSeries }
      : {}),
  };
}
