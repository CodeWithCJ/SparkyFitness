import { getClient } from '../db/poolManager.js';
import {
  ORAL_CARE_DEFAULT_SETTINGS,
  ORAL_CARE_TYPES,
  type OralCareSettings,
  type OralCareType,
  type UpdateOralCareSessionBody,
} from '@workspace/shared';

/** A stored session, before the read-time `covered_by_sync` flag is added. */
export interface OralCareSessionRow {
  id: string;
  user_id: string;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number | null;
  care_type: OralCareType;
  custom_label: string | null;
  provider: string;
  external_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OralCareSessionInsert {
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number | null;
  care_type: OralCareType;
  custom_label: string | null;
  provider: string;
  external_id: string | null;
  notes: string | null;
}

interface RawRow {
  id: string;
  user_id: string;
  entry_date: string;
  start_time: Date | string | null;
  end_time: Date | string | null;
  duration_seconds: number | null;
  care_type: string;
  custom_label: string | null;
  provider: string;
  external_id: string | null;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const toIso = (value: Date | string): string => new Date(value).toISOString();

function mapRow(row: RawRow): OralCareSessionRow {
  const careType = (ORAL_CARE_TYPES as readonly string[]).includes(
    row.care_type
  )
    ? (row.care_type as OralCareType)
    : 'other';
  return {
    id: row.id,
    user_id: row.user_id,
    // DATE columns are returned as YYYY-MM-DD strings (db/poolManager.ts).
    entry_date: row.entry_date,
    start_time: row.start_time ? toIso(row.start_time) : null,
    end_time: row.end_time ? toIso(row.end_time) : null,
    duration_seconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
    care_type: careType,
    custom_label: row.custom_label,
    provider: row.provider,
    external_id: row.external_id,
    notes: row.notes,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

/**
 * Inserts a session. A session with an `external_id` (a health-store sample)
 * upserts on (user, provider, external_id), so re-syncing it updates the row.
 */
export async function upsertOralCareSession(
  userId: string,
  data: OralCareSessionInsert,
  authenticatedUserId: string = userId
): Promise<OralCareSessionRow> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `INSERT INTO oral_care_sessions (
         user_id, entry_date, start_time, end_time, duration_seconds,
         care_type, custom_label, provider, external_id, notes,
         created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       ON CONFLICT (user_id, provider, external_id)
         WHERE external_id IS NOT NULL
       DO UPDATE SET
         entry_date = EXCLUDED.entry_date,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         duration_seconds = EXCLUDED.duration_seconds,
         care_type = EXCLUDED.care_type,
         custom_label = EXCLUDED.custom_label,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        data.entry_date,
        data.start_time,
        data.end_time,
        data.duration_seconds,
        data.care_type,
        data.custom_label,
        data.provider,
        data.external_id,
        data.notes,
        authenticatedUserId,
      ]
    )) as { rows: RawRow[] };
    return mapRow(result.rows[0]!);
  } finally {
    client.release();
  }
}

export async function getOralCareSessionsRange(
  userId: string,
  startDate: string,
  endDate: string,
  authenticatedUserId: string = userId
): Promise<OralCareSessionRow[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT * FROM oral_care_sessions
       WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3
       ORDER BY entry_date DESC, COALESCE(start_time, created_at) DESC`,
      [userId, startDate, endDate]
    )) as { rows: RawRow[] };
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

export async function getOralCareSessionById(
  userId: string,
  sessionId: string,
  authenticatedUserId: string = userId
): Promise<OralCareSessionRow | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      'SELECT * FROM oral_care_sessions WHERE user_id = $1 AND id = $2',
      [userId, sessionId]
    )) as { rows: RawRow[] };
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

const UPDATABLE_COLUMNS = [
  'entry_date',
  'start_time',
  'end_time',
  'duration_seconds',
  'care_type',
  'custom_label',
  'notes',
] as const satisfies readonly (keyof UpdateOralCareSessionBody)[];

/**
 * Updates only the fields sent; `null` clears an optional field. The table's
 * checks still guard the type/label pair and the time order as a whole.
 */
export async function updateOralCareSession(
  userId: string,
  sessionId: string,
  data: UpdateOralCareSessionBody,
  authenticatedUserId: string = userId
): Promise<OralCareSessionRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [userId, sessionId, authenticatedUserId];
  for (const column of UPDATABLE_COLUMNS) {
    if (data[column] === undefined) continue;
    values.push(data[column]);
    sets.push(`${column} = $${values.length}`);
  }
  // Moving away from "other" drops the label the table no longer allows.
  if (
    data.care_type !== undefined &&
    data.care_type !== 'other' &&
    data.custom_label === undefined
  ) {
    sets.push('custom_label = NULL');
  }
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `UPDATE oral_care_sessions SET
         ${[...sets, 'updated_by_user_id = $3', 'updated_at = NOW()'].join(',\n         ')}
       WHERE user_id = $1 AND id = $2
       RETURNING *`,
      values
    )) as { rows: RawRow[] };
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteOralCareSession(
  userId: string,
  sessionId: string,
  authenticatedUserId: string = userId
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM oral_care_sessions WHERE user_id = $1 AND id = $2',
      [userId, sessionId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/** Custom "other" names used before, newest first. */
export async function getRecentOralCareLabels(
  userId: string,
  authenticatedUserId: string = userId,
  limit = 10
): Promise<string[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT custom_label
       FROM oral_care_sessions
       WHERE user_id = $1 AND care_type = 'other' AND custom_label IS NOT NULL
       GROUP BY custom_label
       ORDER BY MAX(created_at) DESC
       LIMIT $2`,
      [userId, limit]
    )) as { rows: { custom_label: string }[] };
    return result.rows.map((row) => row.custom_label);
  } finally {
    client.release();
  }
}

/** The person's brushing goal, or the defaults when no preferences row exists. */
export async function getOralCareSettings(
  userId: string,
  authenticatedUserId: string = userId
): Promise<OralCareSettings> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT oral_care_daily_target, oral_care_target_seconds
       FROM user_preferences WHERE user_id = $1`,
      [userId]
    )) as {
      rows: {
        oral_care_daily_target: number;
        oral_care_target_seconds: number;
      }[];
    };
    const row = result.rows[0];
    if (!row) return { ...ORAL_CARE_DEFAULT_SETTINGS };
    return {
      daily_target: Number(row.oral_care_daily_target),
      target_seconds: Number(row.oral_care_target_seconds),
    };
  } finally {
    client.release();
  }
}

/** Saves the brushing goal; user_preferences RLS only lets the owner write it. */
export async function saveOralCareSettings(
  userId: string,
  settings: OralCareSettings
): Promise<OralCareSettings> {
  const client = await getClient(userId, userId);
  try {
    const result = (await client.query(
      `INSERT INTO user_preferences (user_id, oral_care_daily_target, oral_care_target_seconds)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         oral_care_daily_target = EXCLUDED.oral_care_daily_target,
         oral_care_target_seconds = EXCLUDED.oral_care_target_seconds,
         updated_at = now()
       RETURNING oral_care_daily_target, oral_care_target_seconds`,
      [userId, settings.daily_target, settings.target_seconds]
    )) as {
      rows: {
        oral_care_daily_target: number;
        oral_care_target_seconds: number;
      }[];
    };
    const row = result.rows[0]!;
    return {
      daily_target: Number(row.oral_care_daily_target),
      target_seconds: Number(row.oral_care_target_seconds),
    };
  } finally {
    client.release();
  }
}
