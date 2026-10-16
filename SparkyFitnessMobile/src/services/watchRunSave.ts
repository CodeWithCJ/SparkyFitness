import {
  attachExerciseEntryDistanceSeries,
  attachExerciseEntryGpsTrack,
  attachExerciseEntryLaps,
  attachExerciseEntryWatchTelemetry,
  createExerciseEntry,
} from './api/exerciseApi';
import { resolveRecordingExercise } from './gpsRecordingSave';
import { addLog } from './LogService';
import { buildActivitySetsPayload } from '../utils/workoutSession';
import { toLocalDateString } from '../utils/dateUtils';
import {
  computeLaps,
  computeSplits,
  METERS_PER_KM,
  METERS_PER_MILE,
  splitsToLapWindows,
  summarizeRecording,
  toWorkoutGpsPoints,
} from '../utils/gpsRecording';
import {
  indoorLapWindows,
  watchRunActivity,
  watchRunPoints,
  type WatchRunPayload,
} from '../utils/watchRun';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Files a walk or run the watch recorded alone as a normal diary activity:
 * the entry first, then its route and splits (outdoors), then heart rate and
 * measured energy. `existingEntryId` lets a retry skip creating the entry
 * again; `onEntryCreated` is called as soon as the id exists so the caller can
 * keep it across a failure in a later step.
 */
export async function saveWatchRun(
  payload: WatchRunPayload,
  distanceUnit: 'km' | 'miles',
  existingEntryId: string | undefined,
  onEntryCreated: (entryId: string) => Promise<void>
): Promise<string> {
  const points = watchRunPoints(payload);
  const routeMeters =
    points.length >= 2 ? summarizeRecording(points).distanceMeters : 0;
  // The workout builder's figure is the one the watch itself showed; the
  // route's is the fallback when it recorded none.
  const distanceMeters =
    payload.distanceMeters > 0 ? payload.distanceMeters : routeMeters;
  const distanceKm = Math.round(distanceMeters) / METERS_PER_KM;
  const durationSeconds = Math.max(
    1,
    Math.round(
      payload.activeSeconds > 0
        ? payload.activeSeconds
        : (payload.endedAt - payload.startedAt) / 1000
    )
  );

  let entryId = existingEntryId;
  if (!entryId) {
    const started = new Date(payload.startedAt);
    const exercise = await resolveRecordingExercise(watchRunActivity(payload));
    const created = await createExerciseEntry({
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      duration_minutes: Math.round((durationSeconds / 60) * 100) / 100,
      entry_date: toLocalDateString(started),
      entry_time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
      distance: distanceKm,
      sets: buildActivitySetsPayload([], new Map(), 'kg', 'duration_distance', {
        durationSec: durationSeconds,
        distanceKm,
      }),
    });
    entryId = created.id;
    await onEntryCreated(entryId);
  }

  if (points.length >= 2) {
    const unitMeters =
      distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
    await attachExerciseEntryGpsTrack(entryId, {
      points: toWorkoutGpsPoints(points),
      // Laps the wearer marked cut the route; otherwise each km or mile does.
      laps: splitsToLapWindows(
        payload.laps.length > 0
          ? computeLaps(points, payload.laps)
          : computeSplits(points, unitMeters)
      ),
    });
  } else {
    // No route (indoors): the laps the wearer marked, from the watch's own
    // figures. Best effort, like the telemetry: the run is already filed.
    const windows = indoorLapWindows(payload);
    if (windows.length > 0) {
      try {
        await attachExerciseEntryLaps(entryId, windows);
      } catch (error) {
        addLog(
          `[Watch Run] Could not attach laps: ${String(error)}`,
          'WARNING'
        );
      }
    }
    // The pace chart's data, so the diary's session screen can draw it too.
    if (payload.distanceSeries.length >= 2) {
      try {
        await attachExerciseEntryDistanceSeries(
          entryId,
          payload.distanceSeries
        );
      } catch (error) {
        addLog(
          `[Watch Run] Could not attach distance series: ${String(error)}`,
          'WARNING'
        );
      }
    }
  }
  await attachTelemetry(entryId, payload);
  return entryId;
}

/**
 * Heart rate and measured energy. Best effort: the activity is already in the
 * diary, so a failure is logged and never fails the save.
 */
async function attachTelemetry(
  entryId: string,
  payload: WatchRunPayload
): Promise<void> {
  const hrSamples =
    payload.heartRate.length >= 2
      ? payload.heartRate.map(([t, bpm]) => ({
          t: new Date(t).toISOString(),
          bpm,
        }))
      : undefined;
  const activeEnergyKcal =
    payload.activeEnergyKcal > 0 ? payload.activeEnergyKcal : undefined;
  if (!hrSamples && activeEnergyKcal === undefined) return;
  try {
    await attachExerciseEntryWatchTelemetry(entryId, {
      ...(hrSamples ? { hrSamples } : {}),
      ...(activeEnergyKcal !== undefined ? { activeEnergyKcal } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[Watch Run] Could not attach heart rate and energy: ${message}`,
      'WARNING'
    );
  }
}
