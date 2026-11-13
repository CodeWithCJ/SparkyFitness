import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  DEFAULT_SHOE_RETIREMENT_DISTANCE_KM,
  type AssignShoeResponse,
  type CreateShoeBody,
  type ShoeResponse,
  type ShoeStatus,
  type UpdateShoeBody,
} from '@workspace/shared';

// Distance on exercise_entries is stored in kilometres. Dates are formatted in
// SQL so they stay calendar-day strings instead of passing through a JS Date.
const SHOE_SELECT = `
  SELECT
    s.id, s.user_id, s.name, s.brand, s.model, s.nickname,
    to_char(s.purchase_date, 'YYYY-MM-DD') AS purchase_date,
    s.purchase_price, s.starting_distance_km, s.retirement_distance_km,
    s.status, s.is_default, s.retired_at, s.created_at, s.updated_at,
    COALESCE(SUM(ee.distance), 0) AS logged_distance_km,
    COUNT(ee.id) AS run_count,
    to_char(MAX(ee.entry_date), 'YYYY-MM-DD') AS last_used_date
  FROM shoes s
  LEFT JOIN exercise_entries ee ON ee.shoe_id = s.id`;

const SHOE_GROUP_BY = 'GROUP BY s.id';

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function mapRowToShoe(row: Record<string, unknown>): ShoeResponse {
  const startingDistance = Number(row.starting_distance_km);
  const loggedDistance = Number(row.logged_distance_km);
  const retirementDistance = Number(row.retirement_distance_km);
  const totalDistance = startingDistance + loggedDistance;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    brand: row.brand ? String(row.brand) : null,
    model: row.model ? String(row.model) : null,
    nickname: row.nickname ? String(row.nickname) : null,
    purchase_date: row.purchase_date ? String(row.purchase_date) : null,
    purchase_price: toNumberOrNull(row.purchase_price),
    starting_distance_km: startingDistance,
    retirement_distance_km: retirementDistance,
    status: row.status as ShoeStatus,
    is_default: Boolean(row.is_default),
    retired_at: row.retired_at ? toIso(row.retired_at) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    logged_distance_km: loggedDistance,
    total_distance_km: totalDistance,
    run_count: Number(row.run_count),
    last_used_date: row.last_used_date ? String(row.last_used_date) : null,
    is_worn_out: totalDistance >= retirementDistance,
  };
}

async function fetchShoeWithClient(
  client: PoolClient,
  userId: string,
  shoeId: string
): Promise<ShoeResponse | null> {
  const result = await client.query(
    `${SHOE_SELECT} WHERE s.id = $1 AND s.user_id = $2 ${SHOE_GROUP_BY}`,
    [shoeId, userId]
  );
  return result.rows[0] ? mapRowToShoe(result.rows[0]) : null;
}

async function clearDefaultWithClient(
  client: PoolClient,
  userId: string,
  exceptShoeId: string | null
): Promise<void> {
  await client.query(
    `UPDATE shoes SET is_default = FALSE, updated_at = NOW()
     WHERE user_id = $1 AND is_default AND ($2::uuid IS NULL OR id <> $2)`,
    [userId, exceptShoeId]
  );
}

async function lockShoesWithClient(
  client: PoolClient,
  userId: string
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `shoes:${userId}`,
  ]);
}

export async function getShoes(
  userId: string,
  authenticatedUserId?: string,
  status?: ShoeStatus
): Promise<ShoeResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `${SHOE_SELECT}
       WHERE s.user_id = $1 AND ($2::text IS NULL OR s.status = $2)
       ${SHOE_GROUP_BY}
       ORDER BY (s.status = 'active') DESC, s.is_default DESC, s.created_at DESC`,
      [userId, status ?? null]
    );
    return result.rows.map(mapRowToShoe);
  } finally {
    client.release();
  }
}

export async function getShoeById(
  userId: string,
  shoeId: string,
  authenticatedUserId?: string
): Promise<ShoeResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    return await fetchShoeWithClient(client, userId, shoeId);
  } finally {
    client.release();
  }
}

export async function createShoe(
  userId: string,
  data: CreateShoeBody,
  authenticatedUserId?: string
): Promise<ShoeResponse> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    if (data.is_default) {
      await lockShoesWithClient(client, userId);
      await clearDefaultWithClient(client, userId, null);
    }
    const inserted = await client.query(
      `INSERT INTO shoes (
        user_id, name, brand, model, nickname, purchase_date, purchase_price,
        starting_distance_km, retirement_distance_km, is_default, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        userId,
        data.name,
        data.brand ?? null,
        data.model ?? null,
        data.nickname ?? null,
        data.purchase_date ?? null,
        data.purchase_price ?? null,
        data.starting_distance_km ?? 0,
        data.retirement_distance_km ?? DEFAULT_SHOE_RETIREMENT_DISTANCE_KM,
        data.is_default ?? false,
        authenticatedUserId ?? userId,
      ]
    );
    const shoe = await fetchShoeWithClient(
      client,
      userId,
      String(inserted.rows[0].id)
    );
    await client.query('COMMIT');
    return shoe as ShoeResponse;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShoe(
  userId: string,
  shoeId: string,
  data: UpdateShoeBody,
  authenticatedUserId?: string
): Promise<ShoeResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    // Read the current default only after any other update has committed.
    await lockShoesWithClient(client, userId);
    const current = await fetchShoeWithClient(client, userId, shoeId);
    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }

    const status = data.status ?? current.status;
    // A retired pair can't be the default for new runs.
    const isDefault =
      status === 'retired' ? false : (data.is_default ?? current.is_default);
    if (isDefault) {
      await clearDefaultWithClient(client, userId, shoeId);
    }
    const retiredAt =
      status === 'retired'
        ? (current.retired_at ?? new Date().toISOString())
        : null;
    const pick = <T>(value: T | undefined, fallback: T): T =>
      value === undefined ? fallback : value;

    await client.query(
      `UPDATE shoes SET
        name = $3, brand = $4, model = $5, nickname = $6,
        purchase_date = $7, purchase_price = $8,
        starting_distance_km = $9, retirement_distance_km = $10,
        status = $11, is_default = $12, retired_at = $13,
        updated_by_user_id = $14, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [
        shoeId,
        userId,
        pick(data.name, current.name),
        pick(data.brand, current.brand),
        pick(data.model, current.model),
        pick(data.nickname, current.nickname),
        pick(data.purchase_date, current.purchase_date),
        pick(data.purchase_price, current.purchase_price),
        pick(data.starting_distance_km, current.starting_distance_km),
        pick(data.retirement_distance_km, current.retirement_distance_km),
        status,
        isDefault,
        retiredAt,
        authenticatedUserId ?? userId,
      ]
    );
    const updated = await fetchShoeWithClient(client, userId, shoeId);
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteShoe(
  userId: string,
  shoeId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    // exercise_entries.shoe_id is ON DELETE SET NULL, so diary entries survive.
    const result = await client.query(
      'DELETE FROM shoes WHERE id = $1 AND user_id = $2',
      [shoeId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Links an exercise entry to a shoe, or clears the link with `null`.
 * Returns null when the entry (or the shoe) isn't visible to this user.
 */
export async function assignShoeToExerciseEntry(
  userId: string,
  exerciseEntryId: string,
  shoeId: string | null,
  authenticatedUserId?: string
): Promise<AssignShoeResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    if (shoeId) {
      const shoe = await client.query(
        'SELECT 1 FROM shoes WHERE id = $1 AND user_id = $2',
        [shoeId, userId]
      );
      if (shoe.rowCount === 0) return null;
    }
    const result = await client.query(
      `UPDATE exercise_entries SET shoe_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, shoe_id`,
      [exerciseEntryId, userId, shoeId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      exercise_entry_id: String(row.id),
      shoe_id: row.shoe_id ? String(row.shoe_id) : null,
    };
  } finally {
    client.release();
  }
}
