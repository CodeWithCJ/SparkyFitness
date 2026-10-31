import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  completenessScore,
  type WorkoutSummary,
} from '../services/workoutDuplicateDetection.js';

/**
 * Marks a source_id as merged into the exercise entry the row hangs off
 * (#2839). Stored in exercise_entry_activity_details so it needs no table of
 * its own and cascades with the kept entry: if that entry is ever removed
 * upstream, the record it absorbed imports normally again.
 */
export const MERGED_DUPLICATE_DETAIL_TYPE = 'merged_duplicate_source';

export interface MergedDuplicateData {
  source_id: string;
  reason: string;
  decided_at: string;
  [key: string]: unknown;
}

interface CandidateRow {
  id: string;
  source: string | null;
  source_id: string | null;
  exercise_name: string | null;
  started_at: Date | string | null;
  duration_minutes: string | number | null;
  distance: string | number | null;
  steps: number | null;
  calories_burned: string | number | null;
  avg_heart_rate: string | number | null;
  max_heart_rate: string | number | null;
  elevation_gain_meters: string | number | null;
  moving_time_seconds: number | null;
  has_gps: boolean;
  has_hr_samples: boolean;
  is_manual: boolean;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function candidateRowToSummary(row: CandidateRow): WorkoutSummary {
  const startMs =
    row.started_at === null ? null : new Date(row.started_at).getTime();
  return {
    id: row.id,
    source: row.source ?? 'manual',
    sourceId: row.source_id,
    activity: row.exercise_name ?? '',
    startMs: Number.isFinite(startMs) ? startMs : null,
    durationMinutes: toNumber(row.duration_minutes) ?? 0,
    distanceKm: toNumber(row.distance),
    steps: toNumber(row.steps),
    avgHeartRate: toNumber(row.avg_heart_rate),
    maxHeartRate: toNumber(row.max_heart_rate),
    completeness: completenessScore({
      ...row,
      hasGps: row.has_gps,
      hasHrSamples: row.has_hr_samples,
    }),
    isManual: row.is_manual,
  };
}

/**
 * Entries of every source on the given days, as dedupe candidates. The start
 * instant is rebuilt from the local wall-clock entry_time in the zone it was
 * recorded in (the profile zone when unknown); entries without a time get a
 * null start and can never match.
 */
export async function findWorkoutDedupeCandidates(
  userId: string,
  startDate: string,
  endDate: string,
  fallbackTimezone: string,
  // Maintenance scripts pass their own (system) client; the query filters by
  // user itself, so it does not rely on RLS for scoping.
  externalClient?: Pick<PoolClient, 'query'>
): Promise<WorkoutSummary[]> {
  const client = externalClient ?? (await getClient(userId));
  try {
    const result = await client.query(
      `SELECT ee.id, ee.source, ee.source_id, ee.exercise_name,
              CASE WHEN ee.entry_time IS NULL THEN NULL
                   ELSE (ee.entry_date + ee.entry_time)
                        AT TIME ZONE COALESCE(ee.record_timezone, $4)
              END AS started_at,
              ee.duration_minutes, ee.distance, ee.steps, ee.calories_burned,
              ee.avg_heart_rate, ee.max_heart_rate, ee.elevation_gain_meters,
              ee.moving_time_seconds,
              EXISTS (SELECT 1 FROM exercise_entry_gps_points g
                      WHERE g.exercise_entry_id = ee.id) AS has_gps,
              -- Zones are only computed from a heart-rate series sent with the workout.
              EXISTS (SELECT 1 FROM exercise_entry_hr_zones z
                      WHERE z.exercise_entry_id = ee.id) AS has_hr_samples,
              (COALESCE(ee.source, 'manual') = 'manual'
               OR ee.exercise_preset_entry_id IS NOT NULL
               OR ee.workout_plan_assignment_id IS NOT NULL) AS is_manual
         FROM exercise_entries ee
        WHERE ee.user_id = $1
          AND ee.entry_date BETWEEN $2 AND $3`,
      [userId, startDate, endDate, fallbackTimezone]
    );
    return (result.rows as CandidateRow[]).map(candidateRowToSummary);
  } finally {
    if (!externalClient) (client as PoolClient).release();
  }
}

/** The entry a source_id was merged into, if that entry still exists. */
export async function findMergedDuplicateOwner(
  userId: string,
  source: string,
  sourceId: string
): Promise<string | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT d.exercise_entry_id
         FROM exercise_entry_activity_details d
         JOIN exercise_entries ee ON ee.id = d.exercise_entry_id
        WHERE ee.user_id = $1
          AND d.detail_type = $2
          AND d.provider_name = $3
          AND d.detail_data->>'source_id' = $4
        LIMIT 1`,
      [userId, MERGED_DUPLICATE_DETAIL_TYPE, source, sourceId]
    );
    return result.rows[0]?.exercise_entry_id ?? null;
  } finally {
    client.release();
  }
}

const INSERT_MERGED_SQL = `
  INSERT INTO exercise_entry_activity_details
    (exercise_entry_id, provider_name, detail_type, detail_data,
     created_by_user_id, updated_by_user_id)
  SELECT $1, $2, $3, $4::jsonb, $5, $5
   WHERE NOT EXISTS (
     SELECT 1 FROM exercise_entry_activity_details
      WHERE exercise_entry_id = $1 AND provider_name = $2
        AND detail_type = $3 AND detail_data->>'source_id' = $6)`;

/** Records that `data.source_id` was merged into keptEntryId. Idempotent. */
export async function recordMergedDuplicate(
  userId: string,
  keptEntryId: string,
  source: string,
  data: MergedDuplicateData,
  actingUserId: string
): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query(INSERT_MERGED_SQL, [
      keptEntryId,
      source,
      MERGED_DUPLICATE_DETAIL_TYPE,
      JSON.stringify(data),
      actingUserId,
      data.source_id,
    ]);
  } finally {
    client.release();
  }
}

/**
 * Swaps a synced entry for the more complete copy just stored, in one
 * transaction: source_ids the old entry had absorbed move to the new one, the
 * old entry's own source_id is recorded on it, and the old entry is deleted
 * (its sets, route, laps and zones cascade). Never call it with a manual entry.
 */
export async function replaceWithMergedDuplicate(
  userId: string,
  replacedEntryId: string,
  keptEntryId: string,
  source: string,
  data: MergedDuplicateData,
  actingUserId: string
): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE exercise_entry_activity_details
          SET exercise_entry_id = $1, updated_by_user_id = $4, updated_at = now()
        WHERE exercise_entry_id = $2 AND detail_type = $3`,
      [keptEntryId, replacedEntryId, MERGED_DUPLICATE_DETAIL_TYPE, actingUserId]
    );
    await client.query(INSERT_MERGED_SQL, [
      keptEntryId,
      source,
      MERGED_DUPLICATE_DETAIL_TYPE,
      JSON.stringify(data),
      actingUserId,
      data.source_id,
    ]);
    await client.query(
      `DELETE FROM exercise_entries
        WHERE id = $1 AND user_id = $2
          AND COALESCE(source, 'manual') <> 'manual'
          AND exercise_preset_entry_id IS NULL
          AND workout_plan_assignment_id IS NULL`,
      [replacedEntryId, userId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default {
  MERGED_DUPLICATE_DETAIL_TYPE,
  candidateRowToSummary,
  findWorkoutDedupeCandidates,
  findMergedDuplicateOwner,
  recordMergedDuplicate,
  replaceWithMergedDuplicate,
};
