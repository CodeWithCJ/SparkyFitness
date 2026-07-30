import { getClient } from '../db/poolManager.js';
import {
  ExerciseEntryLaps,
  ExerciseEntryLapsInitializer,
  ExerciseEntryGpsPoints,
  ExerciseEntryGpsPointsInitializer,
} from '@workspace/shared';

/**
 * Repository for workout lap splits and second-by-second GPS trackpoints.
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
    const results: ExerciseEntryLaps[] = [];

    for (const lap of laps) {
      const res = (await client.query(
        `INSERT INTO exercise_entry_laps 
          (user_id, exercise_entry_id, entry_date, lap_index, start_time, end_time, duration_seconds, distance_meters, calories, avg_heart_rate, max_heart_rate, avg_respiration_brpm, max_respiration_brpm, avg_speed_mps, max_speed_mps, avg_cadence, avg_power_watts, elevation_gain_meters, elevation_loss_meters)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [
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
        ]
      )) as { rows: ExerciseEntryLaps[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
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
    const results: ExerciseEntryGpsPoints[] = [];

    for (const pt of points) {
      const res = (await client.query(
        `INSERT INTO exercise_entry_gps_points 
          (user_id, exercise_entry_id, entry_date, timestamp, latitude, longitude, altitude_meters, speed_mps, heart_rate_bpm, respiration_rate_brpm, cadence, power_watts, ground_contact_time_ms, vertical_oscillation_mm, stride_length_cm, temperature_celsius, distance_meters, horizontal_accuracy_meters, vertical_accuracy_meters, course_degrees)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING *`,
        [
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
        ]
      )) as { rows: ExerciseEntryGpsPoints[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
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
