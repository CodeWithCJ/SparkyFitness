import { getSystemClient } from '../db/poolManager.js';

export interface OAuthClientSummary {
  clientId: string;
  name: string | null;
  uri: string | null;
  icon: string | null;
}

export async function getOAuthClientSummary(
  clientId: string
): Promise<OAuthClientSummary | null> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT client_id, name, uri, icon
         FROM oauth_client
        WHERE client_id = $1
          AND disabled = false`,
      [clientId]
    );
    const row = result.rows[0];
    return row
      ? {
          clientId: row.client_id,
          name: row.name ?? null,
          uri: row.uri ?? null,
          icon: row.icon ?? null,
        }
      : null;
  } finally {
    client.release();
  }
}
