import type { Exercise } from '../types/exercise';
import {
  attachExerciseEntryGpsTrack,
  attachExerciseEntryWatchTelemetry,
  createExercise,
  createExerciseEntry,
  searchExercises,
} from './api/exerciseApi';
import {
  elapsedSeconds,
  getHeartRateSamples,
  markRecordingSaved,
  type RecordingSession,
} from './gpsRecordingService';
import { addLog } from './LogService';
import {
  learnFromIndoorEntry,
  learnFromOutdoorRecording,
  type IndoorDistanceEstimate,
} from './stepDistance';
import { assignShoeToExerciseEntry, fetchShoes } from './api/shoesApi';
import { findShoeThatReachedLimit } from './shoeWear';
import type { ShoeResponse } from '@workspace/shared';
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
  type RecordedPoint,
  type RecordingActivity,
} from '../utils/gpsRecording';

/** Library names the three activities are logged under. */
const EXERCISE_NAMES: Record<RecordingActivity, string> = {
  walk: 'Walking',
  run: 'Running',
  ride: 'Cycling',
};

// Only used when the library has no exercise of that name, so the entry still
// gets a calorie estimate. Rough figures for an average adult.
const FALLBACK_CALORIES_PER_HOUR: Record<RecordingActivity, number> = {
  walk: 250,
  run: 600,
  ride: 450,
};

/**
 * Finds the library exercise a recording is logged against, creating a cardio
 * one when the library has none of that name.
 */
export async function resolveRecordingExercise(
  activity: RecordingActivity
): Promise<Exercise> {
  const name = EXERCISE_NAMES[activity];
  const matches = (await searchExercises(name)).filter(
    (exercise) => exercise.name.trim().toLowerCase() === name.toLowerCase()
  );
  const best =
    matches.find((exercise) => exercise.modality === 'duration_distance') ??
    matches[0];
  if (best) return best;
  return createExercise({
    name,
    category: 'cardio',
    modality: 'duration_distance',
    calories_per_hour: FALLBACK_CALORIES_PER_HOUR[activity],
    description: null,
  });
}

/**
 * Names an indoor entry is logged under. They avoid "Treadmill Walk": sport
 * detection reads "treadmill" as running, so a walk would match two sports and
 * fall back to "other". "Indoor" is a modifier, not a sport.
 */
const INDOOR_ENTRY_NAMES: Record<RecordingActivity, string> = {
  walk: 'Indoor Walking',
  run: 'Indoor Running',
  ride: 'Indoor Cycling',
};

const pad = (value: number) => String(value).padStart(2, '0');

export interface SavedRecording {
  entryId: string;
  entryDate: string;
  /** Set when this run took the default pair to its retire-at distance. */
  wornOutShoe?: ShoeResponse;
}

/**
 * Saves a finished recording to the diary: the activity entry first, then its
 * route and splits. If the second step fails the entry id is kept on the
 * session, so retrying only re-sends the track (the server replaces it) and
 * never logs the activity twice.
 *
 * An indoor session has no route: its distance is whatever the person read off
 * the machine (`indoorDistanceKm`, null to leave it out), and there is no
 * track to send. `indoorEstimate` is the step-based distance it was prefilled
 * with: a distance the person changed teaches the app their stride.
 * `acceptedIndoorEstimate` means they left that prefilled distance as shown.
 * Learning then uses the raw estimate, not the value rounded for the field,
 * which can sit more than 1% away on a short session.
 */
export async function saveRecordedActivity(
  session: RecordingSession,
  points: readonly RecordedPoint[],
  distanceUnit: 'km' | 'miles',
  indoorDistanceKm: number | null = null,
  indoorEstimate: IndoorDistanceEstimate | null = null,
  acceptedIndoorEstimate = false
): Promise<SavedRecording> {
  const indoor = session.indoor === true;
  const started = new Date(session.startedAt);
  const entryDate = toLocalDateString(started);
  const durationSeconds = Math.max(1, Math.round(elapsedSeconds(session)));
  const distanceKm: number | null = indoor
    ? indoorDistanceKm != null && indoorDistanceKm > 0
      ? Math.round(indoorDistanceKm * 1000) / 1000
      : null
    : Math.round(summarizeRecording(points).distanceMeters) / METERS_PER_KM;

  let entryId = session.savedEntryId;
  let wornOutShoe: ShoeResponse | null = null;
  if (!entryId) {
    const exercise = await resolveRecordingExercise(session.activity);
    const created = await createExerciseEntry({
      exercise_id: exercise.id,
      exercise_name: indoor
        ? INDOOR_ENTRY_NAMES[session.activity]
        : exercise.name,
      duration_minutes: Math.round((durationSeconds / 60) * 100) / 100,
      entry_date: entryDate,
      entry_time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
      distance: distanceKm,
      sets: buildActivitySetsPayload([], new Map(), 'kg', 'duration_distance', {
        durationSec: durationSeconds,
        distanceKm,
      }),
    });
    entryId = created.id;
    await markRecordingSaved(entryId);
    // Once, with the entry: a retry of a failed track upload must not teach
    // the same session twice. Best effort, never part of the save failing.
    try {
      if (indoor) {
        await learnFromIndoorEntry(
          session.activity,
          indoorEstimate,
          acceptedIndoorEstimate && indoorEstimate
            ? indoorEstimate.distanceKm
            : indoorDistanceKm
        );
      } else if (session.finishedAt != null) {
        await learnFromOutdoorRecording(
          {
            activity: session.activity,
            startedAt: session.startedAt,
            finishedAt: session.finishedAt,
            activeSeconds: durationSeconds,
            ...(session.stepCounterAtStart != null && {
              stepCounterAtStart: session.stepCounterAtStart,
            }),
            ...(session.hadPause === true && { paused: true }),
          },
          (distanceKm ?? 0) * METERS_PER_KM
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[GPS Recording] Could not learn stride: ${message}`, 'WARNING');
    }
    if (session.activity === 'run') {
      wornOutShoe = await assignDefaultShoe(entryId);
    }
  }

  if (!indoor) {
    const unitMeters =
      distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
    await attachExerciseEntryGpsTrack(entryId, {
      points: toWorkoutGpsPoints(points),
      // Laps the person marked replace the automatic splits: they are the
      // intervals they meant to compare.
      laps: splitsToLapWindows(
        session.laps && session.laps.length > 0
          ? computeLaps(points, session.laps, session.finishedAt ?? undefined)
          : computeSplits(points, unitMeters)
      ),
    });
  }
  await attachWatchHeartRate(entryId);
  return { entryId, entryDate, ...(wornOutShoe && { wornOutShoe }) };
}

/**
 * Links a freshly saved run to the person's default pair of shoes. Best
 * effort: the run is already in the diary, so a failure is logged and never
 * blocks the save. Runs only when the entry is first created, so retrying the
 * route upload does not undo a shoe the person changed in between.
 */
async function assignDefaultShoe(
  entryId: string
): Promise<ShoeResponse | null> {
  try {
    const shoes = await fetchShoes('active');
    const defaultShoe = shoes.find((shoe) => shoe.is_default);
    if (!defaultShoe) return null;
    await assignShoeToExerciseEntry(entryId, defaultShoe.id);
    // Only the lookup of whether the pair is now worn out is optional: the
    // run is already linked, so a failure there is not worth reporting.
    return await findShoeThatReachedLimit(
      defaultShoe.id,
      defaultShoe.is_worn_out
    ).catch(() => null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[GPS Recording] Could not assign default shoe: ${message}`,
      'WARNING'
    );
    return null;
  }
}

/**
 * Fills in heart rate from the watch (avg/max and zones) on the saved entry.
 * Best effort: the activity and its route are already stored, so a failure
 * here is logged and never blocks the save.
 */
async function attachWatchHeartRate(entryId: string): Promise<void> {
  try {
    const samples = await getHeartRateSamples();
    // The server needs two readings to measure any time in a zone.
    if (samples.length < 2) return;
    await attachExerciseEntryWatchTelemetry(entryId, {
      hrSamples: samples.map((sample) => ({
        t: new Date(sample.t).toISOString(),
        bpm: sample.bpm,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[GPS Recording] Could not attach watch heart rate: ${message}`,
      'WARNING'
    );
  }
}
