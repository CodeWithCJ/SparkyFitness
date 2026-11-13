import { getClient } from '../db/poolManager.js';
import type {
  PlateInventoryResponse,
  SavePlateInventoryBody,
} from '@workspace/shared';

const COLUMNS = `id, user_id, weight_unit, bars, plates, collars_enabled,
  collar_weight, created_at, updated_at`;

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

function mapRow(row: Record<string, unknown>): PlateInventoryResponse {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    weight_unit: row.weight_unit as PlateInventoryResponse['weight_unit'],
    bars: row.bars as PlateInventoryResponse['bars'],
    plates: row.plates as PlateInventoryResponse['plates'],
    collars_enabled: Boolean(row.collars_enabled),
    collar_weight: Number(row.collar_weight),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function getPlateInventory(
  userId: string,
  authenticatedUserId?: string
): Promise<PlateInventoryResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${COLUMNS} FROM plate_inventories WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Creates the person's inventory or replaces the one they have. */
export async function savePlateInventory(
  userId: string,
  data: SavePlateInventoryBody,
  authenticatedUserId?: string
): Promise<PlateInventoryResponse> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const actor = authenticatedUserId ?? userId;
    const result = await client.query(
      `INSERT INTO plate_inventories (
         user_id, weight_unit, bars, plates, collars_enabled, collar_weight,
         created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         weight_unit = EXCLUDED.weight_unit,
         bars = EXCLUDED.bars,
         plates = EXCLUDED.plates,
         collars_enabled = EXCLUDED.collars_enabled,
         collar_weight = EXCLUDED.collar_weight,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()
       RETURNING ${COLUMNS}`,
      [
        userId,
        data.weight_unit,
        JSON.stringify(data.bars),
        JSON.stringify(data.plates),
        data.collars_enabled,
        data.collar_weight,
        actor,
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/** Removes the saved inventory; false when there was none. */
export async function deletePlateInventory(
  userId: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM plate_inventories WHERE user_id = $1',
      [userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
