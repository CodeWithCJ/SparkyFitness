import { getClient } from '../db/poolManager.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
import {
  ExerciseEntryLaps,
  ExerciseEntryLapsInitializer,
  ExerciseEntryGpsPoints,
  ExerciseEntryGpsPointsInitializer,
  ExerciseEntryHrZones,
  ExerciseEntryHrZonesInitializer,
} from '@workspace/shared';

/**
 * Repository for workout lap splits, second-by-second GPS trackpoints, and
 * heart-rate time-in-zone splits.
 *
 * All writers are single multi-row `INSERT ... VALUES %L ON CONFLICT DO UPDATE`
 * statements rather than per-row loops: a one-hour GPS-tracked activity can carry
 * thousands of points, and one round-trip per row makes sync appear to hang.
 * The `ON CONFLICT` upsert (against the unique constraints added in
 * 20260731000000_complete_workout_telemetry.sql) is what makes re-syncing the same
 * activity idempotent instead of appending duplicate laps/points on every sync run.
 */

// 1. Workout Laps
export async function bulkInsertExerciseEntryLaps(
  userId: string,
  actingUserId: string,
  laps: ExerciseEntryLapsInitializer[]
): Promise<ExerciseEntryLaps[]> {
  if (!laps || laps.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const values = laps.map((lap) => [
      userId,
      lap.exercise_entry_id,
      lap.entry_date,
      lap.lap_index,
      lap.start_time,
      lap.end_time,
      lap.duration_seconds,
      lap.distance_meters ?? null,
      lap.calories ?? null,
      lap.avg_heart_rate ?? null,
      lap.max_heart_rate ?? null,
      lap.avg_respiration_brpm ?? null,
      lap.max_respiration_brpm ?? null,
      lap.avg_speed_mps ?? null,
      lap.max_speed_mps ?? null,
      lap.avg_cadence ?? null,
      lap.avg_power_watts ?? null,
      lap.elevation_gain_meters ?? null,
      lap.elevation_loss_meters ?? null,
    ]);
    const query = format(
      `INSERT INTO exercise_entry_laps
        (user_id, exercise_entry_id, entry_date, lap_index, start_time, end_time, duration_seconds, distance_meters, calories, avg_heart_rate, max_heart_rate, avg_respiration_brpm, max_respiration_brpm, avg_speed_mps, max_speed_mps, avg_cadence, avg_power_watts, elevation_gain_meters, elevation_loss_meters)
       VALUES %L
       ON CONFLICT (exercise_entry_id, lap_index) DO UPDATE SET
         entry_date = EXCLUDED.entry_date,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         duration_seconds = EXCLUDED.duration_seconds,
         distance_meters = EXCLUDED.distance_meters,
         calories = EXCLUDED.calories,
         avg_heart_rate = EXCLUDED.avg_heart_rate,
         max_heart_rate = EXCLUDED.max_heart_rate,
         avg_respiration_brpm = EXCLUDED.avg_respiration_brpm,
         max_respiration_brpm = EXCLUDED.max_respiration_brpm,
         avg_speed_mps = EXCLUDED.avg_speed_mps,
         max_speed_mps = EXCLUDED.max_speed_mps,
         avg_cadence = EXCLUDED.avg_cadence,
         avg_power_watts = EXCLUDED.avg_power_watts,
         elevation_gain_meters = EXCLUDED.elevation_gain_meters,
         elevation_loss_meters = EXCLUDED.elevation_loss_meters
       RETURNING *`,
      values
    );
    const res = (await client.query(query)) as { rows: ExerciseEntryLaps[] };
    return res.rows;
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function getLapsForExerciseEntry(
  exerciseEntryId: string,
  actingUserId: string
): Promise<ExerciseEntryLaps[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM exercise_entry_laps
       WHERE exercise_entry_id = $1
       ORDER BY lap_index ASC`,
      [exerciseEntryId]
    )) as { rows: ExerciseEntryLaps[] };
    return res.rows;
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

// 2. Workout GPS Points
export async function bulkInsertExerciseEntryGpsPoints(
  userId: string,
  actingUserId: string,
  points: ExerciseEntryGpsPointsInitializer[]
): Promise<ExerciseEntryGpsPoints[]> {
  if (!points || points.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const values = points.map((pt) => [
      userId,
      pt.exercise_entry_id,
      pt.entry_date,
      pt.timestamp,
      pt.latitude,
      pt.longitude,
      pt.altitude_meters ?? null,
      pt.speed_mps ?? null,
      pt.heart_rate_bpm ?? null,
      pt.respiration_rate_brpm ?? null,
      pt.cadence ?? null,
      pt.power_watts ?? null,
      pt.ground_contact_time_ms ?? null,
      pt.vertical_oscillation_mm ?? null,
      pt.stride_length_cm ?? null,
      pt.temperature_celsius ?? null,
      pt.distance_meters ?? null,
      pt.horizontal_accuracy_meters ?? null,
      pt.vertical_accuracy_meters ?? null,
      pt.course_degrees ?? null,
    ]);
    const query = format(
      `INSERT INTO exercise_entry_gps_points
        (user_id, exercise_entry_id, entry_date, timestamp, latitude, longitude, altitude_meters, speed_mps, heart_rate_bpm, respiration_rate_brpm, cadence, power_watts, ground_contact_time_ms, vertical_oscillation_mm, stride_length_cm, temperature_celsius, distance_meters, horizontal_accuracy_meters, vertical_accuracy_meters, course_degrees)
       VALUES %L
       ON CONFLICT (exercise_entry_id, timestamp) DO UPDATE SET
         entry_date = EXCLUDED.entry_date,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         altitude_meters = EXCLUDED.altitude_meters,
         speed_mps = EXCLUDED.speed_mps,
         heart_rate_bpm = EXCLUDED.heart_rate_bpm,
         respiration_rate_brpm = EXCLUDED.respiration_rate_brpm,
         cadence = EXCLUDED.cadence,
         power_watts = EXCLUDED.power_watts,
         ground_contact_time_ms = EXCLUDED.ground_contact_time_ms,
         vertical_oscillation_mm = EXCLUDED.vertical_oscillation_mm,
         stride_length_cm = EXCLUDED.stride_length_cm,
         temperature_celsius = EXCLUDED.temperature_celsius,
         distance_meters = EXCLUDED.distance_meters,
         horizontal_accuracy_meters = EXCLUDED.horizontal_accuracy_meters,
         vertical_accuracy_meters = EXCLUDED.vertical_accuracy_meters,
         course_degrees = EXCLUDED.course_degrees
       RETURNING *`,
      values
    );
    const res = (await client.query(query)) as {
      rows: ExerciseEntryGpsPoints[];
    };
    return res.rows;
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function getGpsPointsForExerciseEntry(
  exerciseEntryId: string,
  actingUserId: string
): Promise<ExerciseEntryGpsPoints[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM exercise_entry_gps_points
       WHERE exercise_entry_id = $1
       ORDER BY timestamp ASC`,
      [exerciseEntryId]
    )) as { rows: ExerciseEntryGpsPoints[] };
    return res.rows;
  } finally {
    client.release();
  }
}

// 3. Heart Rate Zone splits (time-in-zone)
export async function bulkInsertExerciseEntryHrZones(
  userId: string,
  actingUserId: string,
  zones: ExerciseEntryHrZonesInitializer[]
): Promise<ExerciseEntryHrZones[]> {
  if (!zones || zones.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const values = zones.map((zone) => [
      userId,
      zone.exercise_entry_id,
      zone.entry_date,
      zone.zone_index,
      zone.zone_lower_bpm ?? null,
      zone.zone_upper_bpm ?? null,
      zone.seconds_in_zone,
    ]);
    const query = format(
      `INSERT INTO exercise_entry_hr_zones
        (user_id, exercise_entry_id, entry_date, zone_index, zone_lower_bpm, zone_upper_bpm, seconds_in_zone)
       VALUES %L
       ON CONFLICT (exercise_entry_id, zone_index) DO UPDATE SET
         entry_date = EXCLUDED.entry_date,
         zone_lower_bpm = EXCLUDED.zone_lower_bpm,
         zone_upper_bpm = EXCLUDED.zone_upper_bpm,
         seconds_in_zone = EXCLUDED.seconds_in_zone
       RETURNING *`,
      values
    );
    const res = (await client.query(query)) as { rows: ExerciseEntryHrZones[] };
    return res.rows;
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function getHrZonesForExerciseEntry(
  exerciseEntryId: string,
  actingUserId: string
): Promise<ExerciseEntryHrZones[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM exercise_entry_hr_zones
       WHERE exercise_entry_id = $1
       ORDER BY zone_index ASC`,
      [exerciseEntryId]
    )) as { rows: ExerciseEntryHrZones[] };
    return res.rows;
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}
