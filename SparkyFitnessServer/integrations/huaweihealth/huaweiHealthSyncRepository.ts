import { getClient } from '../../db/poolManager.js';

export async function updateHuaweiGrantedScopes(
  userId: string,
  authenticatedUserId: string,
  grantedScopes: string[]
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query(
      `UPDATE external_data_providers
       SET scope = $2, updated_at = NOW()
       WHERE user_id = $1
         AND provider_type = 'huaweihealth'
         AND is_public = FALSE`,
      [userId, grantedScopes.join(' ')]
    );
  } finally {
    client.release();
  }
}

export async function updateHuaweiLastSync(
  userId: string,
  authenticatedUserId: string,
  lastSyncAt: Date
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query(
      `UPDATE external_data_providers
       SET last_sync_at = $2, updated_at = NOW()
       WHERE user_id = $1
         AND provider_type = 'huaweihealth'
         AND is_public = FALSE`,
      [userId, lastSyncAt]
    );
  } finally {
    client.release();
  }
}
