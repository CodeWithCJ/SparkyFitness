import { getClient } from '../db/poolManager.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
/**
 * Minimal shape of a pg client, so the _WithClient variants below can join a
 * caller's open transaction (see fitImportService.persistFitEntry) instead of
 * each acquiring their own connection and committing independently.
 */
export interface TelemetryDbClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
}

import {
  ExerciseEntryLaps,
  ExerciseEntryLapsInitializer,
  ExerciseEntryGpsPoints,
  ExerciseEntryHrZones,
  ExerciseEntryHrZonesInitializer,
  GpsTrackPoint,
} from '@workspace/shared';

/**
 * One flat trackpoint row as every current caller (garminActivityProcessor.ts,
 * fitImportService.ts, the backfill script) already builds it — same shape as the
 * pre-20260730000000 per-row table. bulkInsertExerciseEntryGpsPoints groups these
 * by exercise_entry_id and writes one JSONB row per workout; callers do not need
 * to change.
 */
export interface FlatGpsPointRow {
  user_id: string;
  exercise_entry_id: string;
  entry_date: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  altitude_meters?: number | null;
  speed_mps?: number | null;
  heart_rate_bpm?: number | null;
  respiration_rate_brpm?: number | null;
  cadence?: number | null;
  power_watts?: number | null;
  ground_contact_time_ms?: number | null;
  vertical_oscillation_mm?: number | null;
  stride_length_cm?: number | null;
  temperature_celsius?: number | null;
  distance_meters?: number | null;
  horizontal_accuracy_meters?: number | null;
  vertical_accuracy_meters?: number | null;
  course_degrees?: number | null;
}

const has = <T>(v: T | null | undefined): v is T =>
  v !== null && v !== undefined;

function flatRowToTrackPoint(pt: FlatGpsPointRow): GpsTrackPoint {
  const point: GpsTrackPoint = {
    t: pt.timestamp.toISOString(),
    lat: pt.latitude,
    lon: pt.longitude,
  };
  if (has(pt.altitude_meters)) point.alt = pt.altitude_meters;
  if (has(pt.speed_mps)) point.speed = pt.speed_mps;
  if (has(pt.heart_rate_bpm)) point.hr = pt.heart_rate_bpm;
  if (has(pt.respiration_rate_brpm)) point.resp = pt.respiration_rate_brpm;
  if (has(pt.cadence)) point.cad = pt.cadence;
  if (has(pt.power_watts)) point.power = pt.power_watts;
  if (has(pt.ground_contact_time_ms)) point.gct = pt.ground_contact_time_ms;
  if (has(pt.vertical_oscillation_mm)) point.vo = pt.vertical_oscillation_mm;
  if (has(pt.stride_length_cm)) point.stride = pt.stride_length_cm;
  if (has(pt.temperature_celsius)) point.temp = pt.temperature_celsius;
  if (has(pt.distance_meters)) point.dist = pt.distance_meters;
  if (has(pt.horizontal_accuracy_meters))
    point.hacc = pt.horizontal_accuracy_meters;
  if (has(pt.vertical_accuracy_meters))
    point.vacc = pt.vertical_accuracy_meters;
  if (has(pt.course_degrees)) point.course = pt.course_degrees;
  return point;
}

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
  const client = await getClient(userId, actingUserId);
  try {
    return await _bulkInsertExerciseEntryLapsWithClient(
      client as unknown as TelemetryDbClient,
      userId,
      laps
    );
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function _bulkInsertExerciseEntryLapsWithClient(
  client: TelemetryDbClient,
  userId: string,
  laps: ExerciseEntryLapsInitializer[]
): Promise<ExerciseEntryLaps[]> {
  if (!laps || laps.length === 0) return [];
  {
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

// 2. Workout GPS Points — one row per exercise_entry_id (per workout), holding
// the whole track as a JSONB array. A 45-minute run at 1Hz is ~2,700 rows under
// the old per-point design; this is 1. See
// PLAN/telemetry_redesign_phase_1_database.md for the full rationale.
export async function bulkInsertExerciseEntryGpsPoints(
  userId: string,
  actingUserId: string,
  points: FlatGpsPointRow[]
): Promise<ExerciseEntryGpsPoints[]> {
  if (!points || points.length === 0) return [];
  const client = await getClient(userId, actingUserId);
  try {
    return await _bulkInsertExerciseEntryGpsPointsWithClient(
      client as unknown as TelemetryDbClient,
      userId,
      points
    );
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function _bulkInsertExerciseEntryGpsPointsWithClient(
  client: TelemetryDbClient,
  userId: string,
  points: FlatGpsPointRow[]
): Promise<ExerciseEntryGpsPoints[]> {
  if (!points || points.length === 0) return [];

  const byEntry = new Map<
    string,
    { entry_date: string; points: GpsTrackPoint[] }
  >();
  for (const pt of points) {
    const group = byEntry.get(pt.exercise_entry_id);
    const trackPoint = flatRowToTrackPoint(pt);
    if (group) {
      group.points.push(trackPoint);
    } else {
      byEntry.set(pt.exercise_entry_id, {
        entry_date: pt.entry_date,
        points: [trackPoint],
      });
    }
  }
  for (const group of byEntry.values()) {
    group.points.sort((a, b) => a.t.localeCompare(b.t));
  }

  {
    const rows: ExerciseEntryGpsPoints[] = [];
    for (const [exerciseEntryId, group] of byEntry) {
      const res = (await client.query(
        `INSERT INTO exercise_entry_gps_points
          (user_id, exercise_entry_id, entry_date, points)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (exercise_entry_id) DO UPDATE SET
           entry_date = EXCLUDED.entry_date,
           points = EXCLUDED.points
         RETURNING *`,
        [
          userId,
          exerciseEntryId,
          group.entry_date,
          JSON.stringify(group.points),
        ]
      )) as { rows: ExerciseEntryGpsPoints[] };
      if (res.rows[0]) rows.push(res.rows[0]);
    }
    return rows;
  }
}

export async function getGpsPointsForExerciseEntry(
  exerciseEntryId: string,
  actingUserId: string
): Promise<ExerciseEntryGpsPoints | null> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      'SELECT * FROM exercise_entry_gps_points WHERE exercise_entry_id = $1',
      [exerciseEntryId]
    )) as { rows: ExerciseEntryGpsPoints[] };
    return res.rows[0] ?? null;
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
  const client = await getClient(userId, actingUserId);
  try {
    return await _bulkInsertExerciseEntryHrZonesWithClient(
      client as unknown as TelemetryDbClient,
      userId,
      zones
    );
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function _bulkInsertExerciseEntryHrZonesWithClient(
  client: TelemetryDbClient,
  userId: string,
  zones: ExerciseEntryHrZonesInitializer[]
): Promise<ExerciseEntryHrZones[]> {
  if (!zones || zones.length === 0) return [];
  {
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
