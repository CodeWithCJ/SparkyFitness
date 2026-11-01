import { log } from '../config/logging.js';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository, {
  type WatchTelemetryFields,
  type WatchTelemetryZoneSpec,
} from '../models/exerciseEntry.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { parseISO, isValid } from 'date-fns';
import {
  instantToDay,
  setsDurationMinutes,
  type AttachExerciseEntryGpsTrackRequest,
  type AttachExerciseEntryLapsRequest,
  type AttachExerciseEntryDistanceSeriesRequest,
  type HeartRateSampleRequest,
  type SetExerciseEntryDistanceRequest,
  type SetExerciseEntryEffortRequest,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { describeError } from '../utils/errors.js';
import { attachWeatherToExerciseEntry } from './weatherService.js';
import { upsertSamplesByDay } from './healthMetricSampleWriter.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import {
  deriveLaps,
  deriveWorkoutTelemetry,
  type LapWindow,
  type TelemetryGpsPoint,
} from './workoutTelemetryDerivation.js';
import {
  computeTimeInZones,
  bucketsFromAppleWorkoutZones,
  appleWorkoutZonesFromWire,
  observedMaxBpm,
  type HrSample,
} from '@workspace/shared';
import heartRateZoneService from './heartRateZoneService.js';
async function importExerciseEntriesFromCsv(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: any
) {
  let createdCount = 0;
  const updatedCount = 0;
  let failedCount = 0;
  const failedEntries = [];
  for (const entryGroup of entries) {
    try {
      // 1. Validate and use the already formatted date
      const entryDate = entryGroup.entry_date;
      // Ensure the date string is valid by attempting to parse it as ISO.
      // The frontend now sends yyyy-MM-dd, which is a valid ISO subset.
      if (!isValid(parseISO(entryDate))) {
        throw new Error(
          `Invalid date: ${entryDate}. Expected yyyy-MM-dd format.`
        );
      }
      // 2. Lookup or Create Exercise
      let exercise = await exerciseRepository.findExerciseByNameAndUserId(
        entryGroup.exercise_name,
        authenticatedUserId
      );
      if (!exercise) {
        log(
          'debug',
          `Creating new exercise from CSV for user ${authenticatedUserId}. entryGroup:`,
          entryGroup
        );
        const newExerciseData = {
          user_id: authenticatedUserId,
          name: entryGroup.exercise_name,
          is_custom: true,
          shared_with_public: false,
          source: entryGroup.exercise_source || 'CSV_Import', // Use provided source or default
          category: entryGroup.exercise_category,
          calories_per_hour: entryGroup.calories_per_hour
            ? parseFloat(entryGroup.calories_per_hour)
            : undefined,
          description: entryGroup.exercise_description,
          force: entryGroup.exercise_force,
          level: entryGroup.exercise_level,
          mechanic: entryGroup.exercise_mechanic,
          equipment:
            entryGroup.exercise_equipment &&
            entryGroup.exercise_equipment.length > 0
              ? entryGroup.exercise_equipment
              : undefined,
          primary_muscles:
            entryGroup.primary_muscles && entryGroup.primary_muscles.length > 0
              ? entryGroup.primary_muscles
              : undefined,
          secondary_muscles:
            entryGroup.secondary_muscles &&
            entryGroup.secondary_muscles.length > 0
              ? entryGroup.secondary_muscles
              : undefined,
          instructions:
            entryGroup.instructions && entryGroup.instructions.length > 0
              ? entryGroup.instructions
              : undefined,
          // Images are not typically imported via CSV for exercise definitions
        };
        log(
          'debug',
          'Calling createExercise with newExerciseData:',
          newExerciseData
        );
        exercise = await exerciseRepository.createExercise(newExerciseData);
      }
      // 3. Lookup or Create Workout Preset (if preset_name is provided)
      // 3. Convert Distance and Weight based on user preferences and process sets
      const preferences =
        await preferenceRepository.getUserPreferences(authenticatedUserId);
      const distanceUnit = preferences?.default_distance_unit || 'km'; // Default to km
      const weightUnit = preferences?.default_weight_unit || 'kg'; // Default to kg
      let distanceInKm = entryGroup.distance;
      if (distanceInKm !== undefined && distanceInKm !== null) {
        if (distanceUnit === 'miles') {
          distanceInKm = parseFloat(distanceInKm) * 1.60934; // Convert miles to km
        } else {
          distanceInKm = parseFloat(distanceInKm);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setsWithConvertedWeight = entryGroup.sets.map((set: any) => {
        let weightInKg = set.weight;
        if (weightInKg !== undefined && weightInKg !== null) {
          if (weightUnit === 'lbs') {
            weightInKg = parseFloat(weightInKg) * 0.453592; // Convert lbs to kg
          } else {
            weightInKg = parseFloat(weightInKg);
          }
        }
        return {
          ...set,
          weight: weightInKg,
          // CSV duration_min is minutes; stored per-set duration is integer seconds.
          duration:
            set.duration_min !== null && set.duration_min !== undefined
              ? Math.round(Number(set.duration_min) * 60)
              : null,
          rest_time: set.rest_time_sec, // Map frontend rest_time_sec to backend rest_time
        };
      });
      const totalDurationMinutes = setsDurationMinutes(setsWithConvertedWeight);
      // 4. Lookup or Create Workout Preset (if preset_name is provided)
      let workoutPresetId = null; // Initialize workoutPresetId once
      if (entryGroup.preset_name) {
        let workoutPreset =
          await workoutPresetRepository.getWorkoutPresetByName(
            authenticatedUserId,
            entryGroup.preset_name
          );
        if (!workoutPreset) {
          log(
            'debug',
            `Creating new workout preset from CSV for user ${authenticatedUserId}. preset_name: ${entryGroup.preset_name}`
          );
          // Create new workout preset and its exercises/sets from current entryGroup
          workoutPreset = await workoutPresetRepository.createWorkoutPreset({
            user_id: authenticatedUserId,
            name: entryGroup.preset_name,
            description: 'Auto-created from CSV import',
            is_public: false,
            exercises: [
              {
                exercise_id: exercise.id,
                image_url: null, // CSV doesn't provide exercise image for preset def
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                sets: setsWithConvertedWeight.map((set: any) => ({
                  // Use the processed sets
                  set_number: set.set_number,

                  set_type: set.set_type,
                  reps: set.reps,
                  weight: set.weight,
                  duration: set.duration,
                  rest_time: set.rest_time,
                  notes: set.notes,
                })),
              },
            ],
          });
        } else {
          log(
            'debug',
            `Linking to existing workout preset from CSV for user ${authenticatedUserId}. preset_name: ${entryGroup.preset_name}`
          );
        }
        workoutPresetId = workoutPreset.id;
      }
      // 5. Create Exercise Entry
      const newEntry = await exerciseEntryRepository.createExerciseEntry(
        authenticatedUserId,
        {
          exercise_id: exercise.id,
          duration_minutes: totalDurationMinutes || 0, // Sum of set durations
          calories_burned: entryGroup.calories_burned || 0, // Default to 0 if not provided
          entry_date: entryDate,
          notes: entryGroup.entry_notes,
          sets: setsWithConvertedWeight,
          distance: distanceInKm,
          avg_heart_rate: entryGroup.avg_heart_rate,
          exercise_preset_entry_id: workoutPresetId, // Link to preset if created/found
        },
        actingUserId,
        'CSV_Import'
      ); // Add source and actingUserId
      // 6. Create Activity Details
      if (
        entryGroup.activity_details &&
        entryGroup.activity_details.length > 0
      ) {
        for (const detail of entryGroup.activity_details) {
          await activityDetailsRepository.createActivityDetail(
            authenticatedUserId,
            {
              exercise_entry_id: newEntry.id,
              provider_name: 'CSV_Import_Custom',
              detail_type: detail.field_name,
              detail_data: detail.value,
              created_by_user_id: actingUserId,
              updated_by_user_id: actingUserId,
            }
          );
        }
      }
      createdCount++;
    } catch (error) {
      log(
        'error',
        `Error processing imported exercise entry for user ${authenticatedUserId}: ${entryGroup.exercise_name} on ${entryGroup.entry_date}`,
        error
      );
      failedCount++;
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      failedEntries.push({ entry: entryGroup, reason: error.message });
    }
  }
  if (failedEntries.length > 0) {
    const error = new Error('Some entries failed to import.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 409; // Conflict or Partial Content
    // @ts-expect-error TS(2339): Property 'details' does not exist on type 'Error'.
    error.details = { createdCount, updatedCount, failedCount, failedEntries };
    throw error;
  }
  return {
    message: 'Historical exercise entries imported successfully.',
    created: createdCount,
    updated: updatedCount,
    failed: failedCount,
  };
}
/**
 * Attaches what a paired Apple Watch measured during a live workout to an
 * exercise entry that already exists — created by the live-workout
 * start/reconcile flow before any of this was known. Unlike the
 * HealthKit/Health Connect/Garmin sync path (healthDataHandlers.ts's
 * persistWorkoutTelemetry), this never creates the entry itself, so it
 * recomputes the zone breakdown directly with the same hrZoneCalculator
 * rather than routing through that entry-creating function. Apple's own
 * zone group, when the watch sends one, is stored instead: those seconds
 * already include time below the first boundary, which the calculator drops.
 *
 * `activeEnergyKcal` overwrites `calories_burned`, which the server otherwise
 * derives from duration and sets. A watch on the wearer's wrist measured it;
 * the derivation is a formula, so the measurement wins.
 *
 * `seriesSource` names the provider the stored heart rate series is kept
 * under; the Google Health sync passes its own name when it attaches a
 * tracker's readings to a workout logged in SparkyFitness.
 */
async function attachWatchTelemetryToExerciseEntry(
  userId: string,
  actingUserId: string,
  exerciseEntryId: string,
  hrSamples: HeartRateSampleRequest[] | undefined,
  activeEnergyKcal?: number,
  durationMinutes?: number,
  appleZones?: unknown,
  strideLengthCm?: number | null,
  seriesSource = 'SparkyFitness Watch'
): Promise<void> {
  // Fail closed: family/delegate diary *read* can SELECT another user's
  // entry via RLS, but this route must not 204 after an UPDATE that
  // matches zero rows, or write HR zones under the caller's user_id onto
  // someone else's workout. Same owner check as getExerciseEntryById.
  const ownerId = await exerciseEntryRepository.getExerciseEntryOwnerId(
    exerciseEntryId,
    userId
  );
  if (!ownerId || ownerId !== userId) {
    const error = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 404;
    throw error;
  }

  // Only the fields supplied are written — the model does a partial UPDATE,
  // so a post carrying just calories must not blank out heart rate that an
  // earlier post already attached.
  const fields: WatchTelemetryFields = {};
  if (hrSamples && hrSamples.length > 0) {
    const bpmValues = hrSamples.map((s) => s.bpm);
    fields.avg_heart_rate = Math.round(
      bpmValues.reduce((sum, bpm) => sum + bpm, 0) / bpmValues.length
    );
    fields.max_heart_rate = Math.round(
      bpmValues.reduce((max, bpm) => (bpm > max ? bpm : max), -Infinity)
    );
    const observedMs = hrSamples
      .map((sample) => Date.parse(sample.t))
      .filter((ms) => Number.isFinite(ms))
      .reduce((max, ms) => (ms > max ? ms : max), -Infinity);
    if (Number.isFinite(observedMs)) {
      fields.watch_telemetry_observed_at = new Date(observedMs).toISOString();
    }
  }
  if (activeEnergyKcal !== undefined) {
    const measured = Math.round(activeEnergyKcal);
    // Written to both columns on purpose. `calories_burned` is what the diary
    // adds up; `active_calories` is a telemetry column the ordinary entry
    // update preserves, so it survives a later edit and is how that edit
    // knows these calories were measured rather than derived.
    fields.calories_burned = measured;
    fields.active_calories = measured;
  }
  if (typeof durationMinutes === 'number' && durationMinutes > 0) {
    fields.duration_minutes = Math.round(durationMinutes * 100) / 100;
  }
  if (strideLengthCm !== undefined) {
    fields.stride_length_cm = strideLengthCm;
  }

  // Apple's finished-workout zones win over a fresh bucketing of the series.
  // They are the whole session, so the write also clears the other exercises
  // of that session; otherwise the workout chart would add them on top.
  let zones: WatchTelemetryZoneSpec[] | null = null;
  let sessionZones = false;
  const deviceZones = bucketsFromAppleWorkoutZones(
    appleWorkoutZonesFromWire(appleZones)
  );
  if (deviceZones) {
    sessionZones = true;
    zones = deviceZones.map((zone) => ({
      ...zone,
      zone_method: 'device' as const,
    }));
  } else if (hrSamples && hrSamples.length > 0) {
    const samples: HrSample[] = hrSamples;
    // The same resolution the sync path uses (healthDataHandlers.ts's
    // persistWorkoutTelemetry): the person's own max heart rate or their date
    // of birth. Without it this path fell back to the observed sample max, so
    // one user's zones depended on where the workout came from: a 55-year-old
    // got a 190 ceiling from the wrist and 176 from a synced copy of the same
    // session, shifting every zone floor between them.
    const resolved = await heartRateZoneService.resolveZonesForUser(
      userId,
      observedMaxBpm(samples)
    );
    zones = computeTimeInZones(samples, resolved.floors).map((zone) => ({
      ...zone,
      zone_method: resolved.effectiveMethod,
    }));
  }

  if (hrSamples && hrSamples.length > 0) {
    const accepted = hrSamples;
    await exerciseEntryRepository.applyWatchTelemetryAtomically(
      exerciseEntryId,
      userId,
      actingUserId,
      fields,
      zones,
      () =>
        storeHeartRateSeries(
          userId,
          actingUserId,
          exerciseEntryId,
          accepted,
          seriesSource
        ),
      sessionZones
    );
  } else {
    await exerciseEntryRepository.applyWatchTelemetryAtomically(
      exerciseEntryId,
      userId,
      actingUserId,
      fields,
      zones,
      undefined,
      sessionZones
    );
  }
}

/**
 * Keeps the beat-by-beat series, tagged with the entry, so the workout's heart
 * rate chart works without waiting for (or depending on) a later Health sync.
 * Only the span the workout covers is replaced, and only samples tagged with
 * this entry: another workout overlapping that span keeps its own readings.
 * Best effort: a failure is logged and the telemetry post still succeeds. A
 * snapshot the row lock rejected never reaches here.
 */
async function storeHeartRateSeries(
  userId: string,
  actingUserId: string,
  exerciseEntryId: string,
  hrSamples: HeartRateSampleRequest[],
  source: string
): Promise<void> {
  try {
    const tz = await loadUserTimezone(userId);
    const valid = hrSamples.filter((s) => Number.isFinite(Date.parse(s.t)));
    if (valid.length === 0) return;
    const times = valid.map((s) => Date.parse(s.t));
    await upsertSamplesByDay(
      userId,
      actingUserId,
      'heart_rate',
      source,
      valid.map((s) => ({
        entry_date: instantToDay(s.t, tz),
        timestamp: new Date(s.t),
        ex: exerciseEntryId,
        bpm: Math.round(s.bpm),
      })),
      {
        mode: 'merge',
        window: {
          startMs: times.reduce((a, b) => (b < a ? b : a)),
          endMs: times.reduce((a, b) => (b > a ? b : a)),
        },
        ex: exerciseEntryId,
      }
    );
  } catch (error) {
    log(
      'warn',
      `Could not store the heart rate series for exercise entry ${exerciseEntryId}: ${describeError(error)}`
    );
  }
}

/**
 * Attaches a GPS track recorded on the phone to an exercise entry that already
 * exists: the route, per-lap splits, and the summary fields the track implies
 * (speed, elevation gain and loss, moving time).
 *
 * Re-posting the same track is safe. Points upsert against the per-entry
 * unique constraint, so a client retrying after a dropped response replaces
 * those rows instead of duplicating them. Laps are deleted and inserted
 * again in the same transaction: the lap upsert does not remove a higher
 * index that this post no longer sends. Summary fields the entry already
 * carries are left alone: the person's own distance and calories stay as
 * they logged them.
 */
async function attachGpsTrackToExerciseEntry(
  userId: string,
  actingUserId: string,
  exerciseEntryId: string,
  track: AttachExerciseEntryGpsTrackRequest
): Promise<void> {
  const ownerId = await exerciseEntryRepository.getExerciseEntryOwnerId(
    exerciseEntryId,
    userId
  );
  if (!ownerId || ownerId !== userId) {
    const error = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 404;
    throw error;
  }
  const entry = await exerciseEntryRepository.getExerciseEntryById(
    exerciseEntryId,
    userId
  );
  const entryDate: string | undefined = entry?.entry_date;
  if (!entryDate) {
    const error = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 404;
    throw error;
  }

  const hasInvalidTime =
    track.points.some((p) => !Number.isFinite(Date.parse(p.t))) ||
    (track.laps ?? []).some(
      (l) =>
        !Number.isFinite(Date.parse(l.start_time)) ||
        !Number.isFinite(Date.parse(l.end_time))
    );
  if (hasInvalidTime) {
    const error = new Error('GPS track has an invalid timestamp.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 400;
    throw error;
  }

  const points: TelemetryGpsPoint[] = [...track.points].sort(
    (a, b) => Date.parse(a.t) - Date.parse(b.t)
  );
  if (points.length < 2) {
    const error = new Error('GPS track needs at least two timestamped points.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 400;
    throw error;
  }
  const lapWindows: LapWindow[] = [...(track.laps ?? [])]
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
    .map((lap, index) => ({ ...lap, lap_index: index + 1 }));
  const laps = deriveLaps(lapWindows, points);
  const derived = deriveWorkoutTelemetry(points);

  const client = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');
    await workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient(
      client,
      userId,
      points.map((p) => ({
        user_id: userId,
        exercise_entry_id: exerciseEntryId,
        entry_date: entryDate,
        timestamp: new Date(p.t),
        latitude: p.lat,
        longitude: p.lon,
        altitude_meters: p.alt ?? null,
        speed_mps: p.speed ?? null,
        heart_rate_bpm: p.hr ?? null,
        cadence: p.cad ?? null,
        power_watts: p.power ?? null,
        distance_meters: p.dist ?? null,
        horizontal_accuracy_meters: p.hacc ?? null,
        vertical_accuracy_meters: p.vacc ?? null,
        course_degrees: p.course ?? null,
      }))
    );
    await client.query(
      'DELETE FROM exercise_entry_laps WHERE exercise_entry_id = $1',
      [exerciseEntryId]
    );
    await workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient(
      client,
      userId,
      laps.map((lap) => ({
        user_id: userId,
        exercise_entry_id: exerciseEntryId,
        entry_date: entryDate,
        lap_index: lap.lap_index,
        start_time: new Date(lap.start_time),
        end_time: new Date(lap.end_time),
        duration_seconds: lap.duration_seconds,
        distance_meters: lap.distance_meters,
        calories: lap.calories,
        avg_heart_rate: lap.avg_heart_rate,
        max_heart_rate: lap.max_heart_rate,
        avg_speed_mps: lap.avg_speed_mps,
        max_speed_mps: lap.max_speed_mps,
        avg_cadence: lap.avg_cadence,
        avg_power_watts: lap.avg_power_watts,
        elevation_gain_meters: lap.elevation_gain_meters,
        elevation_loss_meters: lap.elevation_loss_meters,
        moving_time_seconds: lap.moving_time_seconds,
        avg_moving_speed_mps: lap.avg_moving_speed_mps,
      }))
    );
    await exerciseEntryRepository._updateExerciseEntryTelemetryOnlyWithClient(
      client,
      exerciseEntryId,
      userId,
      derived
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // After the response's own work is done and without waiting on it: a slow
  // weather service must not hold up saving a run. It never throws.
  const first = points[0]!;
  void attachWeatherToExerciseEntry(userId, exerciseEntryId, {
    lat: first.lat,
    lon: first.lon,
    t: first.t,
  });
}

/**
 * Stores laps for an entry that has no GPS track (a treadmill run recorded on
 * the watch): the marked windows with the estimated distance of each. Sending
 * the same laps again replaces them by lap index.
 */
async function attachLapsToExerciseEntry(
  userId: string,
  actingUserId: string,
  exerciseEntryId: string,
  body: AttachExerciseEntryLapsRequest
): Promise<void> {
  const ownerId = await exerciseEntryRepository.getExerciseEntryOwnerId(
    exerciseEntryId,
    userId
  );
  const entry =
    ownerId === userId
      ? await exerciseEntryRepository.getExerciseEntryById(
          exerciseEntryId,
          userId
        )
      : null;
  const entryDate: string | undefined = entry?.entry_date;
  if (!entryDate) {
    const error = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 404;
    throw error;
  }
  const laps = body.laps.map((lap) => {
    const seconds = Math.round(
      (Date.parse(lap.end_time) - Date.parse(lap.start_time)) / 1000
    );
    return {
      user_id: userId,
      exercise_entry_id: exerciseEntryId,
      entry_date: entryDate,
      lap_index: lap.lap_index,
      start_time: new Date(lap.start_time),
      end_time: new Date(lap.end_time),
      duration_seconds: seconds,
      distance_meters: lap.distance_meters,
      avg_heart_rate: lap.avg_heart_rate,
      avg_speed_mps:
        lap.distance_meters && seconds > 0
          ? lap.distance_meters / seconds
          : undefined,
    };
  });

  const client = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');
    // An entry with a GPS track gets its laps from that track; mixing the two
    // sources would leave a lap list that matches neither.
    const track = (await client.query(
      'SELECT 1 FROM exercise_entry_gps_points WHERE exercise_entry_id = $1 LIMIT 1',
      [exerciseEntryId]
    )) as { rows: unknown[] };
    if (track.rows.length > 0) {
      const error = new Error(
        'This entry has a GPS track; post its laps with the track instead.'
      );
      // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
      error.status = 409;
      throw error;
    }
    // The posted laps are the whole list: a corrected re-post replaces it.
    await client.query(
      'DELETE FROM exercise_entry_laps WHERE exercise_entry_id = $1',
      [exerciseEntryId]
    );
    await workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient(
      client,
      userId,
      laps
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Stores the distance-against-time series of an entry with no route. The
 * posted series is the whole thing: re-posting replaces it.
 */
async function attachDistanceSeriesToExerciseEntry(
  userId: string,
  actingUserId: string,
  exerciseEntryId: string,
  body: AttachExerciseEntryDistanceSeriesRequest
): Promise<void> {
  const ownerId = await exerciseEntryRepository.getExerciseEntryOwnerId(
    exerciseEntryId,
    userId
  );
  const entry =
    ownerId === userId
      ? await exerciseEntryRepository.getExerciseEntryById(
          exerciseEntryId,
          userId
        )
      : null;
  const entryDate: string | undefined = entry?.entry_date;
  if (!entryDate) {
    const error = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 404;
    throw error;
  }
  const points = [...body.points].sort((a, b) => a[0] - b[0]);
  const client = await getClient(userId, actingUserId);
  try {
    await client.query(
      `INSERT INTO exercise_entry_distance_series
         (user_id, exercise_entry_id, entry_date, points)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (exercise_entry_id) DO UPDATE SET
         entry_date = EXCLUDED.entry_date,
         points = EXCLUDED.points,
         updated_at = NOW()`,
      [userId, exerciseEntryId, entryDate, JSON.stringify(points)]
    );
  } finally {
    client.release();
  }
}

/** The stored series for an entry, or null when it has none. */
async function getExerciseEntryDistanceSeries(
  actingUserId: string,
  exerciseEntryId: string
): Promise<[number, number][] | null> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      'SELECT points FROM exercise_entry_distance_series WHERE exercise_entry_id = $1',
      [exerciseEntryId]
    )) as { rows: { points: [number, number][] }[] };
    return res.rows[0]?.points ?? null;
  } finally {
    client.release();
  }
}

/**
 * Sets the distance of an entry that has no GPS track (a treadmill run) to
 * what the person read off the machine. Nothing else about the entry changes,
 * so the measured heart rate and energy stay. Its set distance follows, and
 * any laps are scaled by the same factor so they still add up to the entry.
 */
async function setExerciseEntryDistance(
  userId: string,
  actingUserId: string,
  exerciseEntryId: string,
  body: SetExerciseEntryDistanceRequest
): Promise<void> {
  const ownerId = await exerciseEntryRepository.getExerciseEntryOwnerId(
    exerciseEntryId,
    userId
  );
  const entry =
    ownerId === userId
      ? await exerciseEntryRepository.getExerciseEntryById(
          exerciseEntryId,
          userId
        )
      : null;
  if (!entry) {
    const error = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 404;
    throw error;
  }
  const client = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');
    // The laps and pace chart are scaled from the distance being replaced,
    // so read it under the row lock: another correction or edit that commits
    // in between would otherwise be scaled from a value it already changed.
    const locked = (await client.query(
      'SELECT distance FROM exercise_entries WHERE id = $1 FOR NO KEY UPDATE',
      [exerciseEntryId]
    )) as { rows: { distance: string | null }[] };
    if (locked.rows.length === 0) {
      const error = new Error('Exercise entry not found.');
      // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
      error.status = 404;
      throw error;
    }
    // A route gives the distance; overriding it would leave the track, the
    // splits and the entry disagreeing.
    const track = (await client.query(
      'SELECT 1 FROM exercise_entry_gps_points WHERE exercise_entry_id = $1 LIMIT 1',
      [exerciseEntryId]
    )) as { rows: unknown[] };
    if (track.rows.length > 0) {
      const error = new Error(
        'This entry has a GPS track, which provides its distance.'
      );
      // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
      error.status = 409;
      throw error;
    }
    const previousKm = Number(locked.rows[0]!.distance) || 0;
    await client.query(
      'UPDATE exercise_entries SET distance = $2, updated_at = NOW() WHERE id = $1',
      [exerciseEntryId, body.distance_km]
    );
    await client.query(
      'UPDATE exercise_entry_sets SET distance = $2 WHERE exercise_entry_id = $1 AND distance IS NOT NULL',
      [exerciseEntryId, body.distance_km]
    );
    if (previousKm > 0) {
      await client.query(
        `UPDATE exercise_entry_laps SET
           distance_meters = ROUND(distance_meters * $2::numeric, 2),
           avg_speed_mps = CASE WHEN duration_seconds > 0
             THEN ROUND(distance_meters * $2::numeric / duration_seconds, 2) END
         WHERE exercise_entry_id = $1 AND distance_meters IS NOT NULL`,
        [exerciseEntryId, body.distance_km / previousKm]
      );
    }
    if (previousKm > 0) {
      // The pace chart moves with the corrected distance, as the laps do.
      await client.query(
        `UPDATE exercise_entry_distance_series SET
           points = COALESCE((
             SELECT jsonb_agg(
               jsonb_build_array(p->0, ROUND(((p->>1)::numeric) * $2::numeric, 2))
               ORDER BY ord)
             FROM jsonb_array_elements(points) WITH ORDINALITY AS t(p, ord)
           ), '[]'::jsonb),
           updated_at = NOW()
         WHERE exercise_entry_id = $1`,
        [exerciseEntryId, body.distance_km / previousKm]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records how hard the person rated a workout. An entry that belongs to a
 * preset session (a strength workout) carries it for every entry of that
 * session, so the rating reads the same from whichever exercise is opened.
 */
async function setExerciseEntryEffort(
  userId: string,
  actingUserId: string,
  exerciseEntryId: string,
  body: SetExerciseEntryEffortRequest
): Promise<void> {
  const ownerId = await exerciseEntryRepository.getExerciseEntryOwnerId(
    exerciseEntryId,
    userId
  );
  if (!ownerId || ownerId !== userId) {
    const error = new Error('Exercise entry not found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 404;
    throw error;
  }
  const client = await getClient(userId, actingUserId);
  try {
    await client.query(
      `UPDATE exercise_entries SET workout_effort = $2, updated_at = NOW()
       WHERE user_id = $3
         AND (id = $1
           OR (exercise_preset_entry_id IS NOT NULL
             AND exercise_preset_entry_id = (
               SELECT exercise_preset_entry_id FROM exercise_entries
               WHERE id = $1 AND user_id = $3)))`,
      [exerciseEntryId, body.rating, userId]
    );
  } finally {
    client.release();
  }
}

export {
  importExerciseEntriesFromCsv,
  attachWatchTelemetryToExerciseEntry,
  attachGpsTrackToExerciseEntry,
  attachLapsToExerciseEntry,
  attachDistanceSeriesToExerciseEntry,
  getExerciseEntryDistanceSeries,
  setExerciseEntryDistance,
  setExerciseEntryEffort,
};
export default {
  importExerciseEntriesFromCsv,
  attachWatchTelemetryToExerciseEntry,
  attachGpsTrackToExerciseEntry,
  attachLapsToExerciseEntry,
  attachDistanceSeriesToExerciseEntry,
  getExerciseEntryDistanceSeries,
  setExerciseEntryDistance,
  setExerciseEntryEffort,
};
