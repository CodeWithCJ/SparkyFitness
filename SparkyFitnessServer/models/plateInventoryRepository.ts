import { getClient } from '../db/poolManager.js';
import type {
  PlateInventoryResponse,
  SavePlateInventoryBody,
} from '@workspace/shared';

// Each row is one gym. Exactly one per user is active; the single-inventory
// functions (get/save/delete) work on that one, which keeps older apps that
// only know one inventory working.
const COLUMNS = `id, user_id, name, is_active, weight_unit, bars, plates,
  dumbbells, machine_stacks, collars_enabled, collar_weight, created_at,
  updated_at`;

type Client = Awaited<ReturnType<typeof getClient>>;

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function mapRow(row: Record<string, unknown>): PlateInventoryResponse {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: (row.name as string | null) ?? null,
    is_active: Boolean(row.is_active),
    weight_unit: row.weight_unit as PlateInventoryResponse['weight_unit'],
    bars: row.bars as PlateInventoryResponse['bars'],
    plates: row.plates as PlateInventoryResponse['plates'],
    dumbbells: (row.dumbbells as number[] | null) ?? [],
    machine_stacks:
      (row.machine_stacks as PlateInventoryResponse['machine_stacks']) ?? [],
    collars_enabled: Boolean(row.collars_enabled),
    collar_weight: Number(row.collar_weight),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

async function withClient<T>(
  userId: string,
  authenticatedUserId: string | undefined,
  run: (client: Client) => Promise<T>
): Promise<T> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

async function inTransaction<T>(
  client: Client,
  run: () => Promise<T>
): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** The active gym's equipment, or null until the person saves one. */
export async function getPlateInventory(
  userId: string,
  authenticatedUserId?: string
): Promise<PlateInventoryResponse | null> {
  return withClient(userId, authenticatedUserId, async (client) => {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM plate_inventories
       WHERE user_id = $1 AND is_active`,
      [userId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}

/**
 * Creates the active gym or replaces its equipment. Gym fields left out of
 * `data` (older apps) keep their stored values.
 */
export async function savePlateInventory(
  userId: string,
  data: SavePlateInventoryBody,
  authenticatedUserId?: string
): Promise<PlateInventoryResponse> {
  return withClient(userId, authenticatedUserId, async (client) => {
    const actor = authenticatedUserId ?? userId;
    const values = [
      userId,
      data.weight_unit,
      JSON.stringify(data.bars),
      JSON.stringify(data.plates),
      data.collars_enabled,
      data.collar_weight,
      actor,
      data.name === undefined ? null : data.name,
      data.dumbbells === undefined ? null : JSON.stringify(data.dumbbells),
      data.machine_stacks === undefined
        ? null
        : JSON.stringify(data.machine_stacks),
      data.name !== undefined,
    ];
    const updated = await client.query(
      `UPDATE plate_inventories SET
         weight_unit = $2,
         bars = $3::jsonb,
         plates = $4::jsonb,
         collars_enabled = $5,
         collar_weight = $6,
         updated_by_user_id = $7,
         name = CASE WHEN $11 THEN $8 ELSE name END,
         dumbbells = COALESCE($9::jsonb, dumbbells),
         machine_stacks = COALESCE($10::jsonb, machine_stacks),
         updated_at = NOW()
       WHERE user_id = $1 AND is_active
       RETURNING ${COLUMNS}`,
      values
    );
    if (updated.rows[0]) return mapRow(updated.rows[0]);
    const inserted = await client.query(
      `INSERT INTO plate_inventories (
         user_id, weight_unit, bars, plates, collars_enabled, collar_weight,
         created_by_user_id, updated_by_user_id, name, dumbbells,
         machine_stacks, is_active
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $7, $8,
         COALESCE($9::jsonb, '[]'::jsonb), COALESCE($10::jsonb, '[]'::jsonb),
         TRUE)
       RETURNING ${COLUMNS}`,
      values.slice(0, 10)
    );
    return mapRow(inserted.rows[0]);
  });
}

/**
 * Removes the active gym; false when there was none. Another gym, the most
 * recently updated, becomes active so the calculator keeps real equipment.
 */
export async function deletePlateInventory(
  userId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  return withClient(userId, authenticatedUserId, (client) =>
    inTransaction(client, async () => {
      const result = await client.query(
        'DELETE FROM plate_inventories WHERE user_id = $1 AND is_active',
        [userId]
      );
      if ((result.rowCount ?? 0) === 0) return false;
      await activateMostRecent(client, userId);
      return true;
    })
  );
}

async function activateMostRecent(client: Client, userId: string) {
  await client.query(
    `UPDATE plate_inventories SET is_active = TRUE
     WHERE id = (
       SELECT id FROM plate_inventories WHERE user_id = $1
       ORDER BY updated_at DESC LIMIT 1
     ) AND NOT EXISTS (
       SELECT 1 FROM plate_inventories WHERE user_id = $1 AND is_active
     )`,
    [userId]
  );
}

/** Every gym, active first, then by name. */
export async function listGyms(
  userId: string,
  authenticatedUserId?: string
): Promise<PlateInventoryResponse[]> {
  return withClient(userId, authenticatedUserId, async (client) => {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM plate_inventories WHERE user_id = $1
       ORDER BY is_active DESC, name NULLS FIRST, created_at`,
      [userId]
    );
    return result.rows.map(mapRow);
  });
}

/** Adds a gym and makes it the active one. */
export async function createGym(
  userId: string,
  data: SavePlateInventoryBody,
  authenticatedUserId?: string
): Promise<PlateInventoryResponse> {
  return withClient(userId, authenticatedUserId, (client) =>
    inTransaction(client, async () => {
      await client.query(
        'UPDATE plate_inventories SET is_active = FALSE WHERE user_id = $1 AND is_active',
        [userId]
      );
      const actor = authenticatedUserId ?? userId;
      const result = await client.query(
        `INSERT INTO plate_inventories (
           user_id, name, weight_unit, bars, plates, dumbbells, machine_stacks,
           collars_enabled, collar_weight, created_by_user_id,
           updated_by_user_id, is_active
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8,
           $9, $10, $10, TRUE)
         RETURNING ${COLUMNS}`,
        [
          userId,
          data.name ?? null,
          data.weight_unit,
          JSON.stringify(data.bars),
          JSON.stringify(data.plates),
          JSON.stringify(data.dumbbells ?? []),
          JSON.stringify(data.machine_stacks ?? []),
          data.collars_enabled,
          data.collar_weight,
          actor,
        ]
      );
      return mapRow(result.rows[0]);
    })
  );
}

/** Makes a gym the active one; null when it isn't the person's. */
export async function activateGym(
  userId: string,
  gymId: string,
  authenticatedUserId?: string
): Promise<PlateInventoryResponse | null> {
  return withClient(userId, authenticatedUserId, (client) =>
    inTransaction(client, async () => {
      const exists = await client.query(
        'SELECT 1 FROM plate_inventories WHERE id = $1 AND user_id = $2',
        [gymId, userId]
      );
      if (exists.rowCount === 0) return null;
      await client.query(
        'UPDATE plate_inventories SET is_active = FALSE WHERE user_id = $1 AND is_active AND id <> $2',
        [userId, gymId]
      );
      const result = await client.query(
        `UPDATE plate_inventories SET is_active = TRUE, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
        [gymId, userId]
      );
      return mapRow(result.rows[0]);
    })
  );
}

/** Deletes a gym; when it was active another becomes active. */
export async function deleteGym(
  userId: string,
  gymId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  return withClient(userId, authenticatedUserId, (client) =>
    inTransaction(client, async () => {
      const result = await client.query(
        'DELETE FROM plate_inventories WHERE id = $1 AND user_id = $2',
        [gymId, userId]
      );
      if ((result.rowCount ?? 0) === 0) return false;
      await activateMostRecent(client, userId);
      return true;
    })
  );
}
