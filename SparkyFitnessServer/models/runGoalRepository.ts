import { getClient } from '../db/poolManager.js';
import type {
  RunGoalEntry,
  RunGoals,
  UpsertRunGoalsBody,
} from '@workspace/shared';

/** The dates as YYYY-MM-DD text: the driver would turn a DATE into a JS Date. */
const COLUMNS = `weekly_distance_km, race_name, race_distance_km, updated_at,
  to_char(race_date, 'YYYY-MM-DD') AS race_day`;

/** Thrown when a race name or distance would be left without a race day. */
export class InvalidRunGoalsError extends Error {}

const RACE_CHECK = 'chk_run_goals_race_has_date';

function mapRow(row: Record<string, unknown>): RunGoals {
  return {
    weekly_distance_km:
      row.weekly_distance_km === null ? null : Number(row.weekly_distance_km),
    race_name: row.race_name ? String(row.race_name) : null,
    race_date: row.race_day ? String(row.race_day) : null,
    race_distance_km:
      row.race_distance_km === null ? null : Number(row.race_distance_km),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getRunGoals(
  userId: string,
  authenticatedUserId?: string
): Promise<RunGoals | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM run_goals WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Creates the person's goals or changes the fields sent; null clears one. */
export async function upsertRunGoals(
  userId: string,
  body: UpsertRunGoalsBody,
  authenticatedUserId?: string
): Promise<RunGoals> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `INSERT INTO run_goals
         (user_id, weekly_distance_km, race_name, race_date, race_distance_km)
       VALUES ($1, $3, $5,
         CASE WHEN $6::boolean THEN $7::date
              ELSE (SELECT race_date FROM run_goals WHERE user_id = $1) END,
         $9)
       ON CONFLICT ON CONSTRAINT uq_run_goals_user DO UPDATE SET
         weekly_distance_km = CASE WHEN $2::boolean THEN $3
                                   ELSE run_goals.weekly_distance_km END,
         race_name = CASE WHEN $4::boolean THEN $5
                          ELSE run_goals.race_name END,
         race_date = CASE WHEN $6::boolean THEN $7::date
                          ELSE run_goals.race_date END,
         race_distance_km = CASE WHEN $8::boolean THEN $9
                                 ELSE run_goals.race_distance_km END,
         updated_at = NOW()
       RETURNING ${COLUMNS}`,
      [
        userId,
        body.weekly_distance_km !== undefined,
        body.weekly_distance_km ?? null,
        body.race_name !== undefined,
        body.race_name ?? null,
        body.race_date !== undefined,
        body.race_date ?? null,
        body.race_distance_km !== undefined,
        body.race_distance_km ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  } catch (error) {
    const { code, constraint } = error as {
      code?: string;
      constraint?: string;
    };
    if (code === '23514' && constraint === RACE_CHECK) {
      throw new InvalidRunGoalsError(
        'A race name or distance needs a race day.'
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Logged entries with a distance between two days, newest first. Sport is not
 * stored on an entry, so the caller classifies each one from its name.
 */
export async function getEntriesWithDistance(
  userId: string,
  startDay: string,
  endDay: string,
  authenticatedUserId?: string
): Promise<RunGoalEntry[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT to_char(entry_date, 'YYYY-MM-DD') AS day, exercise_name,
              category, notes, distance
         FROM exercise_entries
        WHERE user_id = $1
          AND entry_date BETWEEN $2 AND $3
          AND distance > 0
          AND exercise_name IS DISTINCT FROM 'Active Calories'
        ORDER BY entry_date DESC`,
      [userId, startDay, endDay]
    );
    return result.rows.map(
      (row: {
        day: string;
        exercise_name: string | null;
        category: string | null;
        notes: string | null;
        distance: string | number;
      }) => ({
        day: row.day,
        exerciseName: row.exercise_name,
        category: row.category,
        notes: row.notes,
        distanceKm: Number(row.distance),
      })
    );
  } finally {
    client.release();
  }
}
