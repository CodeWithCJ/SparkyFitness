import { getClient } from '../db/poolManager.js';

export interface RecentExerciseRow {
  id: string;
  exercise_name: string | null;
  category: string | null;
  notes: string | null;
  /** `YYYY-MM-DD` */
  entry_date: string;
  /** `HH:MM:SS` or null */
  entry_time: string | null;
  record_timezone: string | null;
  duration_minutes: number;
  avg_heart_rate: number | null;
  workout_effort: number | null;
  provider_name: string | null;
  detail_data: unknown;
  exercise_source_id: string | null;
  exercise_preset_entry_id?: string | null;
  distance?: number | null;
  created_at?: Date;
}

/** Exercise entries from `sinceDay` on, newest first, for the coach signals. */
async function getRecentExerciseSessions(
  userId: string,
  sinceDay: string
): Promise<RecentExerciseRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.id, ee.exercise_name, ee.category, ee.notes,
              ee.entry_date::text AS entry_date, ee.entry_time, ee.record_timezone,
              ee.duration_minutes, ee.avg_heart_rate, ee.workout_effort,
              detail.provider_name, detail.detail_data,
              e.source_id AS exercise_source_id
       FROM exercise_entries ee
       LEFT JOIN LATERAL (
         SELECT provider_name, detail_data FROM exercise_entry_activity_details
         WHERE exercise_entry_id = ee.id LIMIT 1
       ) detail ON true
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.user_id = $1 AND ee.entry_date >= $2
       ORDER BY ee.entry_date DESC, ee.entry_time DESC NULLS LAST`,
      [userId, sinceDay]
    );
    return result.rows as RecentExerciseRow[];
  } finally {
    client.release();
  }
}

/** Workouts added after `since` (a sync or a logged session), newest first. */
async function getEntriesCreatedSince(
  userId: string,
  since: Date
): Promise<RecentExerciseRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ee.id, ee.exercise_name, ee.category, ee.notes,
              ee.entry_date::text AS entry_date, ee.entry_time, ee.record_timezone,
              ee.duration_minutes, ee.avg_heart_rate, ee.workout_effort,
              ee.exercise_preset_entry_id, ee.distance, ee.created_at,
              detail.provider_name, detail.detail_data,
              e.source_id AS exercise_source_id
       FROM exercise_entries ee
       LEFT JOIN LATERAL (
         SELECT provider_name, detail_data FROM exercise_entry_activity_details
         WHERE exercise_entry_id = ee.id LIMIT 1
       ) detail ON true
       LEFT JOIN exercises e ON e.id = ee.exercise_id
       WHERE ee.user_id = $1 AND ee.created_at > $2
       ORDER BY ee.created_at DESC
       LIMIT 200`,
      [userId, since]
    );
    return result.rows as RecentExerciseRow[];
  } finally {
    client.release();
  }
}

export default { getRecentExerciseSessions, getEntriesCreatedSince };
