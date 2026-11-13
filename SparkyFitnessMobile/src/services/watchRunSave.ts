import {
  attachExerciseEntryDistanceSeries,
  attachExerciseEntryGpsTrack,
  attachExerciseEntryLaps,
  attachExerciseEntryWatchTelemetry,
  createExerciseEntry,
} from './api/exerciseApi';
import { resolveRecordingExercise } from './gpsRecordingSave';
import { addLog } from './LogService';
import { measureWatchRunForm, type WatchRunForm } from './stepDistance';
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

/** What a filed watch run leaves behind for the caller. */
export interface SavedWatchRun {
  entryId: string;
  /** Cadence and stride put on the entry; null when the phone could not say. */
  form: WatchRunForm | null;
}

/**
 * Best effort and never prompts: no step count from the watch, a phone that
 * was not carried, or a step source that fails, just leaves cadence and
 * stride off the entry.
 */
async function measureForm(
  payload: WatchRunPayload,
  durationSeconds: number,
  distanceKm: number | null
): Promise<WatchRunForm | null> {
  try {
    return await measureWatchRunForm(
      {
        activity: watchRunActivity(payload),
        startedAt: payload.startedAt,
        finishedAt: payload.endedAt,
        activeSeconds: durationSeconds,
      },
      (distanceKm ?? 0) * METERS_PER_KM,
      payload.steps
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Watch Run] Could not measure form: ${message}`, 'WARNING');
    return null;
  }
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Files a walk or run the watch recorded alone as a normal diary activity:
 * the entry first, then its route and splits (outdoors), then heart rate and
 * measured energy. `existingEntryId` lets a retry skip creating the entry
 * again; `onEntryCreated` is called as soon as the id exists so the caller can
 * keep it, and the form measured with it, across a failure in a later step.
 * `existingForm` is what that call stored, handed back on a retry.
 */
export async function saveWatchRun(
  payload: WatchRunPayload,
  distanceUnit: 'km' | 'miles',
  existingEntryId: string | undefined,
  onEntryCreated: (entryId: string, form: WatchRunForm | null) => Promise<void>,
  existingForm: WatchRunForm | null = null
): Promise<SavedWatchRun> {
  const points = watchRunPoints(payload);
  const routeMeters =
    points.length >= 2 ? summarizeRecording(points).distanceMeters : 0;
  // The workout builder's figure is the one the watch itself showed; the
  // route's is the fallback when it recorded none.
  const distanceMeters =
    payload.distanceMeters > 0 ? payload.distanceMeters : routeMeters;
  // Jump rope has no distance: the entry is time and heart rate only.
  const distanceKm =
    payload.kind === 'jumpRope'
      ? null
      : Math.round(distanceMeters) / METERS_PER_KM;
  const durationSeconds = Math.max(
    1,
    Math.round(
      payload.activeSeconds > 0
        ? payload.activeSeconds
        : (payload.endedAt - payload.startedAt) / 1000
    )
  );

  let entryId = existingEntryId;
  let form = existingForm;
  if (!entryId) {
    const started = new Date(payload.startedAt);
    const exercise = await resolveRecordingExercise(watchRunActivity(payload));
    // The stored distance, which for a treadmill run already holds what the
    // wearer entered on the wrist.
    form = await measureForm(payload, durationSeconds, distanceKm);
    const created = await createExerciseEntry({
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      duration_minutes: Math.round((durationSeconds / 60) * 100) / 100,
      entry_date: toLocalDateString(started),
      entry_time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
      distance: distanceKm,
      ...(form && {
        avg_cadence: form.avgCadence,
        ...(form.strideLengthCm != null && {
          stride_length_cm: form.strideLengthCm,
        }),
      }),
      sets: buildActivitySetsPayload([], new Map(), 'kg', 'duration_distance', {
        durationSec: durationSeconds,
        distanceKm,
      }),
    });
    entryId = created.id;
    await onEntryCreated(entryId, form);
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
  } else if (payload.kind !== 'jumpRope') {
    // No route (indoors): the laps the wearer marked, from the watch's own
    // figures. Best effort, like the telemetry: the run is already filed.
    // A jump rope covers no distance, so it keeps neither laps nor a pace
    // chart: its entry is time and heart rate only.
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
  return { entryId, form };
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
  if (!hrSamples && activeEnergyKcal === undefined && !payload.appleZones)
    return;
  try {
    await attachExerciseEntryWatchTelemetry(entryId, {
      ...(hrSamples ? { hrSamples } : {}),
      ...(activeEnergyKcal !== undefined ? { activeEnergyKcal } : {}),
      ...(payload.appleZones ? { appleZones: payload.appleZones } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[Watch Run] Could not attach heart rate and energy: ${message}`,
      'WARNING'
    );
  }
}
