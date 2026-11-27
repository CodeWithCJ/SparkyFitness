import { getClient } from '../db/poolManager.js';
import { dayRangeToUtcRange } from '@workspace/shared';
import type { PoolClient } from 'pg';

const FASTING_LOG_CLIENT_ID_INDEX = 'idx_fasting_logs_user_client_id';

export interface FastingLogRow {
  id: string;
  user_id: string;
  start_time: Date | string;
  end_time: Date | string | null;
  target_end_time: Date | string | null;
  duration_minutes: number | null;
  fasting_type: string | null;
  status: string | null;
  client_id: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

async function createFastingLog(
  userId: string,
  startTime: string | Date,
  targetEndTime: string | Date | null,
  fastingType: string | null,
  clientId: string | null = null
): Promise<FastingLogRow> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO fasting_logs (user_id, start_time, target_end_time, fasting_type, status, client_id)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
       RETURNING id, user_id, start_time, end_time, target_end_time, duration_minutes, fasting_type, status, client_id, created_at, updated_at`,
      [userId, startTime, targetEndTime, fastingType, clientId]
    );
    return result.rows[0] as FastingLogRow;
  } finally {
    client.release();
  }
}

async function findFastingLogByClientId(
  userId: string,
  clientId: string,
  dbClient?: PoolClient
): Promise<FastingLogRow | null> {
  const client = dbClient ?? (await getClient(userId));
  try {
    const result = await client.query(
      `SELECT id, user_id, start_time, end_time, target_end_time, duration_minutes, fasting_type, status, client_id, created_at, updated_at
       FROM fasting_logs
       WHERE user_id = $1 AND client_id = $2
       LIMIT 1`,
      [userId, clientId]
    );
    return (result.rows[0] as FastingLogRow | undefined) ?? null;
  } finally {
    if (!dbClient) {
      client.release();
    }
  }
}

async function createCompletedFast(
  userId: string,
  startTime: string | Date,
  endTime: string | Date,
  targetEndTime: string | Date | null,
  durationMinutes: number,
  fastingType: string,
  dbClient?: PoolClient
): Promise<Record<string, unknown> | null> {
  const client = dbClient ?? (await getClient(userId));
  try {
    const result = await client.query(
      `INSERT INTO fasting_logs (user_id, start_time, end_time, target_end_time, duration_minutes, fasting_type, status)
       SELECT $1, $2::timestamptz, $3::timestamptz, $4::timestamptz, $5, $6, 'COMPLETED'
       WHERE NOT EXISTS (
         SELECT 1 FROM fasting_logs
         WHERE user_id = $1
           AND start_time >= ($2::timestamptz - interval '60 minutes')
           AND start_time <= ($2::timestamptz + interval '60 minutes')
       )
       RETURNING id, user_id, start_time, end_time, target_end_time, duration_minutes, fasting_type, status, created_at, updated_at`,
      [userId, startTime, endTime, targetEndTime, durationMinutes, fastingType]
    );
    return (result.rows[0] as Record<string, unknown>) ?? null;
  } finally {
    if (!dbClient) {
      client.release();
    }
  }
}

async function findFastNearStartTime(
  userId: string,
  startTime: string | Date,
  toleranceMinutes = 60,
  dbClient?: PoolClient
): Promise<{
  id: string;
  status: string;
  start_time: string;
  end_time: string | null;
} | null> {
  const client = dbClient ?? (await getClient(userId));
  try {
    const result = await client.query(
      `SELECT id, status, start_time, end_time FROM fasting_logs
       WHERE user_id = $1
         AND start_time >= ($2::timestamptz - ($3 || ' minutes')::interval)
         AND start_time <= ($2::timestamptz + ($3 || ' minutes')::interval)
       ORDER BY ABS(EXTRACT(EPOCH FROM (start_time - $2::timestamptz))) ASC
       LIMIT 1`,
      [userId, startTime, toleranceMinutes]
    );
    return (
      (result.rows[0] as {
        id: string;
        status: string;
        start_time: string;
        end_time: string | null;
      }) || null
    );
  } finally {
    if (!dbClient) {
      client.release();
    }
  }
}

async function endFast(
  id: string,
  userId: string,
  endTime: string | Date,
  durationMinutes: number,
  startTime?: string | Date | null,
  dbClient?: PoolClient
) {
  const client = dbClient ?? (await getClient(userId));
  try {
    // Build dynamic SET clause so we can optionally update start_time
    const setParts = [];
    const values = [];
    let idx = 1;
    setParts.push(`end_time = $${idx++}`);
    values.push(endTime);
    setParts.push(`duration_minutes = $${idx++}`);
    values.push(durationMinutes);
    // Note: mood_entry_id and weight_at_end removed from fasting_logs by design
    if (startTime !== undefined && startTime !== null) {
      setParts.push(`start_time = $${idx++}`);
      values.push(startTime);
    }
    setParts.push("status = 'COMPLETED'");
    setParts.push('updated_at = NOW()');
    const whereIdPos = idx++;
    const whereUserPos = idx++;
    const query = `UPDATE fasting_logs SET ${setParts.join(', ')} WHERE id = $${whereIdPos} AND user_id = $${whereUserPos} RETURNING *`;
    values.push(id, userId);
    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    if (!dbClient) {
      client.release();
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFastingById(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT * FROM fasting_logs WHERE id = $1 AND user_id = $2 LIMIT 1',
      [id, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCurrentFast(userId: any, dbClient?: PoolClient) {
  const client = dbClient ?? (await getClient(userId));
  try {
    console.log(`[Repo] getCurrentFast checking for userId: ${userId}`);
    const result = await client.query(
      `SELECT * FROM fasting_logs
       WHERE user_id = $1 AND status = 'ACTIVE'
       ORDER BY start_time DESC
       LIMIT 1`,
      [userId]
    );
    console.log(`[Repo] getCurrentFast result count: ${result.rowCount}`);
    if (result.rowCount > 0) {
      console.log(`[Repo] Found active fast: ${result.rows[0].id}`);
    }
    return result.rows[0];
  } finally {
    if (!dbClient) {
      client.release();
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFastingHistory(userId: any, limit = 50, offset = 0) {
  const client = await getClient(userId);
  try {
    console.log(`[Repo] getFastingHistory checking for userId: ${userId}`);
    const result = await client.query(
      `SELECT fl.*
       FROM fasting_logs fl
       WHERE fl.user_id = $1
       ORDER BY fl.start_time DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    console.log(`[Repo] getFastingHistory result count: ${result.rowCount}`);
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateFast(id: any, userId: any, updates: any) {
  const client = await getClient(userId);
  try {
    const {
      start_time,
      target_end_time,
      end_time,
      duration_minutes,
      status,
      fasting_type,
    } = updates;
    //Build dynamic update query
    let query = 'UPDATE fasting_logs SET updated_at = NOW()';
    const values = [];
    let paramIndex = 1;
    if (start_time !== undefined) {
      query += `, start_time = $${paramIndex++}`;
      values.push(start_time);
    }
    if (target_end_time !== undefined) {
      query += `, target_end_time = $${paramIndex++}`;
      values.push(target_end_time);
    }
    if (end_time !== undefined) {
      query += `, end_time = $${paramIndex++}`;
      values.push(end_time);
    }
    if (duration_minutes !== undefined) {
      query += `, duration_minutes = $${paramIndex++}`;
      values.push(duration_minutes);
    }
    if (status !== undefined) {
      query += `, status = $${paramIndex++}`;
      values.push(status);
    }
    if (fasting_type !== undefined) {
      query += `, fasting_type = $${paramIndex++}`;
      values.push(fasting_type);
    }
    query += ` WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} RETURNING *`;
    values.push(id, userId);
    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFastingStats(userId: any) {
  const client = await getClient(userId);
  try {
    // Example stats: Total completed fasts, total hours fasted, current streak (simplified)
    const result = await client.query(
      `
            SELECT
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as total_completed_fasts,
                SUM(duration_minutes) FILTER (WHERE status = 'COMPLETED') as total_minutes_fasted,
                AVG(duration_minutes) FILTER (WHERE status = 'COMPLETED') as average_duration_minutes
            FROM fasting_logs
            WHERE user_id = $1
        `,
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// Get fasting logs within a date range (inclusive). Returns completed fasts only.
async function getFastingLogsByDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  timezone = 'UTC'
) {
  const client = await getClient(userId);
  try {
    // Convert day-string range to UTC timestamp range in the user's timezone,
    // then use a standard overlap check instead of ::date casts.
    const { start, end } = dayRangeToUtcRange(startDate, endDate, timezone);
    const result = await client.query(
      `SELECT * FROM fasting_logs
             WHERE user_id = $1
               AND status = 'COMPLETED'
               AND start_time < $3 AND end_time >= $2
             ORDER BY start_time DESC`,
      [userId, start, end]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// Fasting logs whose window overlaps the given calendar day in the user's
// timezone, including active fasts with no end_time. Backs the chatbot
// check-in diary (ai/tools/checkinTools.ts).
async function getFastingLogsOverlappingDay(
  userId: string,
  date: string,
  timezone: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, start_time, end_time, status, fasting_type
       FROM fasting_logs
       WHERE user_id = $1
         AND (start_time AT TIME ZONE $3)::date <= $2::date
         AND (end_time IS NULL OR (end_time AT TIME ZONE $3)::date >= $2::date)
       ORDER BY start_time ASC`,
      [userId, date, timezone]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteFastingLog(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM fasting_logs WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
export { createFastingLog };
export { FASTING_LOG_CLIENT_ID_INDEX };
export { findFastingLogByClientId };
export { createCompletedFast };
export { findFastNearStartTime };
export { endFast };
export { getFastingById };
export { getCurrentFast };
export { getFastingHistory };
export { updateFast };
export { getFastingStats };
export { getFastingLogsByDateRange };
export { getFastingLogsOverlappingDay };
export { deleteFastingLog };
export default {
  FASTING_LOG_CLIENT_ID_INDEX,
  createFastingLog,
  findFastingLogByClientId,
  createCompletedFast,
  findFastNearStartTime,
  endFast,
  getFastingById,
  getCurrentFast,
  getFastingHistory,
  updateFast,
  getFastingStats,
  getFastingLogsByDateRange,
  getFastingLogsOverlappingDay,
  deleteFastingLog,
};
