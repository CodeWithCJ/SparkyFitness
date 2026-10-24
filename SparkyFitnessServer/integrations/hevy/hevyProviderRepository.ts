import { getClient } from '../../db/poolManager.js';
import type { QueryResult } from 'pg';

export interface HevySyncSettings {
  id: string;
  user_id: string;
  is_active: boolean;
  sync_frequency: string | null;
  last_sync_at: Date | string | null;
}

async function getSyncSettings(
  userId: string,
  providerId: string
): Promise<HevySyncSettings | null> {
  const client = await getClient(userId);
  try {
    const result: QueryResult<HevySyncSettings> = await client.query(
      `SELECT id, user_id, is_active, sync_frequency, last_sync_at
       FROM external_data_providers
       WHERE user_id = $1 AND id = $2 AND provider_type = 'hevy'`,
      [userId, providerId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export default { getSyncSettings };
