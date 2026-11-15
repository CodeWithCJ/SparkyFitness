import { getClient, getSystemClient } from '../db/poolManager.js';
import type {
  IntervalsNutritionPushes,
  IntervalsNutritionPushesInitializer,
} from '@workspace/shared';

export type PushRow = Omit<IntervalsNutritionPushes, 'user_id' | 'pushed_at'>;

export async function getPushSetting(userId: string): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT intervals_push_nutrition FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    const row = result.rows[0] as
      { intervals_push_nutrition: boolean } | undefined;
    return row?.intervals_push_nutrition ?? false;
  } finally {
    client.release();
  }
}

export async function setPushSetting(
  userId: string,
  enabled: boolean
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_preferences (
         user_id, intervals_push_nutrition, created_at, updated_at
       ) VALUES ($1, $2, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
         intervals_push_nutrition = EXCLUDED.intervals_push_nutrition,
         updated_at = now()
       RETURNING intervals_push_nutrition`,
      [userId, enabled]
    );
    return (result.rows[0] as { intervals_push_nutrition: boolean })
      .intervals_push_nutrition;
  } finally {
    client.release();
  }
}

/** Logged pushes, optionally limited to a day range, oldest first. */
export async function getPushes(
  userId: string,
  range?: { start: string; end: string }
): Promise<PushRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT entry_date, kcal_consumed, protein, carbohydrates, fat_total
       FROM intervals_nutrition_pushes
       WHERE user_id = $1 ${range ? 'AND entry_date BETWEEN $2 AND $3' : ''}
       ORDER BY entry_date`,
      range ? [userId, range.start, range.end] : [userId]
    );
    return result.rows as PushRow[];
  } finally {
    client.release();
  }
}

export async function getPushSummary(
  userId: string
): Promise<{ days: number; since: string | null }> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS days, MIN(entry_date) AS since
       FROM intervals_nutrition_pushes WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] as { days: number; since: string | null };
  } finally {
    client.release();
  }
}

export async function upsertPushes(
  userId: string,
  rows: Omit<IntervalsNutritionPushesInitializer, 'user_id'>[]
): Promise<void> {
  if (rows.length === 0) return;
  const client = await getClient(userId);
  try {
    await client.query(
      `INSERT INTO intervals_nutrition_pushes
         (user_id, entry_date, kcal_consumed, protein, carbohydrates, fat_total, pushed_at)
       SELECT $1, r.entry_date, r.kcal_consumed, r.protein, r.carbohydrates, r.fat_total, now()
       FROM jsonb_to_recordset($2::jsonb) AS r(
         entry_date date, kcal_consumed int, protein numeric,
         carbohydrates numeric, fat_total numeric)
       ON CONFLICT (user_id, entry_date) DO UPDATE SET
         kcal_consumed = EXCLUDED.kcal_consumed,
         protein = EXCLUDED.protein,
         carbohydrates = EXCLUDED.carbohydrates,
         fat_total = EXCLUDED.fat_total,
         pushed_at = EXCLUDED.pushed_at`,
      [userId, JSON.stringify(rows)]
    );
  } finally {
    client.release();
  }
}

export async function deletePushes(
  userId: string,
  days: string[]
): Promise<void> {
  if (days.length === 0) return;
  const client = await getClient(userId);
  try {
    await client.query(
      'DELETE FROM intervals_nutrition_pushes WHERE user_id = $1 AND entry_date = ANY($2::date[])',
      [userId, days]
    );
  } finally {
    client.release();
  }
}

/** Users who opted in and have an active Intervals.icu provider (scheduler only). */
export async function getUsersWithPushEnabled(): Promise<
  { user_id: string; provider_id: string }[]
> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (p.user_id) p.user_id, p.id AS provider_id
       FROM user_preferences up
       JOIN external_data_providers p
         ON p.user_id = up.user_id AND p.provider_type = 'intervals' AND p.is_active
       WHERE up.intervals_push_nutrition
       ORDER BY p.user_id, p.created_at DESC`
    );
    return result.rows as { user_id: string; provider_id: string }[];
  } finally {
    client.release();
  }
}
