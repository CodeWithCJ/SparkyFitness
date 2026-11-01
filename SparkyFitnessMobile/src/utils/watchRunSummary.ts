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
  entryId?: string | null,
  form?: RunSummaryParams['form']
): RunSummaryParams {
  const avgHeartRate = mean(payload.heartRate.map(([, bpm]) => bpm));
  const points = watchRunPoints(payload);
  // A jump rope covers no distance, so none of the distance-shaped parts of
  // the summary apply to it.
  const noDistance = payload.kind === 'jumpRope';
  const base = buildRunSummary({
    activity: payload.kind,
    entryDate: toLocalDateString(new Date(payload.startedAt)),
    distanceUnit,
    points,
    lapMarks: payload.laps,
    avgHeartRate,
    heartRateSamples: payload.heartRate.map(([t, bpm]) => ({ t, bpm })),
    program,
    entryId,
    form,
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
    // A jump rope covers no distance, so there is nothing to correct and no
    // stride to learn from one.
    editableDistance:
      !noDistance && payload.place === 'indoor' && Boolean(entryId),
    ...(payload.place === 'indoor' && !noDistance
      ? {
          watchIndoor: {
            scale: payload.distanceScale ?? 1,
            estimatedMeters:
              payload.estimatedDistanceMeters ?? payload.distanceMeters,
          },
        }
      : {}),
    activeEnergyKcal:
      payload.activeEnergyKcal > 0 ? payload.activeEnergyKcal : null,
    // The watch's own figures, not re-derived from a thinned route.
    distanceMeters:
      payload.distanceMeters > 0 ? payload.distanceMeters : base.distanceMeters,
    activeSeconds:
      payload.activeSeconds > 0 ? payload.activeSeconds : base.activeSeconds,
    laps: noDistance ? [] : laps,
    ...(payload.place === 'indoor' &&
    !noDistance &&
    payload.distanceSeries.length >= 2
      ? { distanceSeries: payload.distanceSeries }
      : {}),
  };
}
