import { getSystemClient } from '../db/poolManager.js';

export interface OAuthClientSummary {
  clientId: string;
  name: string | null;
  uri: string | null;
  icon: string | null;
}

export interface OAuthAuthorizationSummary extends OAuthClientSummary {
  consentId: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

function parseOAuthStringArray(value: string | null): string[] {
  if (value === null) return [];

  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item): item is string => typeof item === 'string')
  ) {
    throw new Error('OAuth array column does not contain a string array');
  }
  return parsed;
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

export async function listOAuthAuthorizations(
  userId: string
): Promise<OAuthAuthorizationSummary[]> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT consent.id AS consent_id,
              consent.scopes,
              consent.created_at,
              consent.updated_at,
              oauth_client.client_id,
              oauth_client.name,
              oauth_client.uri,
              oauth_client.icon
         FROM oauth_consent AS consent
         JOIN oauth_client ON oauth_client.client_id = consent.client_id
        WHERE consent.user_id = $1
          AND oauth_client.disabled = false
        ORDER BY consent.updated_at DESC`,
      [userId]
    );
    return result.rows.map(
      (row: {
        consent_id: string;
        client_id: string;
        name: string | null;
        uri: string | null;
        icon: string | null;
        scopes: string | null;
        created_at: Date | string;
        updated_at: Date | string;
      }) => ({
        consentId: row.consent_id,
        clientId: row.client_id,
        name: row.name ?? null,
        uri: row.uri ?? null,
        icon: row.icon ?? null,
        scopes: parseOAuthStringArray(row.scopes),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      })
    );
  } finally {
    client.release();
  }
}

/**
 * Checks both current consent and the per-client revocation watermark. The
 * watermark prevents a JWT issued before revocation becoming valid again if
 * the same client is authorized later.
 */
export async function isOAuthAuthorizationActive(
  userId: string,
  clientId: string,
  issuedAtSeconds: number
): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT EXISTS (
         SELECT 1
           FROM oauth_consent
          WHERE user_id = $1
            AND client_id = $2
       ) AS has_consent,
       NOT EXISTS (
         SELECT 1
           FROM oauth_authorization_revocation
          WHERE user_id = $1
            AND client_id = $2
            AND revoked_at >= to_timestamp($3)
       ) AS issued_after_revocation,
       EXISTS (
         SELECT 1
           FROM oauth_client
          WHERE client_id = $2
            AND disabled = false
       ) AS client_enabled`,
      [userId, clientId, issuedAtSeconds]
    );
    return (
      result.rows[0]?.has_consent === true &&
      result.rows[0]?.issued_after_revocation === true &&
      result.rows[0]?.client_enabled === true
    );
  } finally {
    client.release();
  }
}

/** Revokes one user-owned consent and every renewable token for its client. */
export async function revokeOAuthAuthorization(
  userId: string,
  consentId: string
): Promise<boolean> {
  const client = await getSystemClient();
  try {
    await client.query('BEGIN');
    const consentResult = await client.query(
      `SELECT client_id
         FROM oauth_consent
        WHERE id = $1
          AND user_id = $2
        FOR UPDATE`,
      [consentId, userId]
    );
    const clientId = consentResult.rows[0]?.client_id as string | undefined;
    if (!clientId) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `INSERT INTO oauth_authorization_revocation (user_id, client_id, revoked_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, client_id)
       DO UPDATE SET revoked_at = EXCLUDED.revoked_at`,
      [userId, clientId]
    );
    await client.query(
      `UPDATE oauth_refresh_token
          SET revoked = now()
        WHERE user_id = $1
          AND client_id = $2
          AND revoked IS NULL`,
      [userId, clientId]
    );
    await client.query(
      `UPDATE oauth_access_token
          SET revoked = now()
        WHERE user_id = $1
          AND client_id = $2
          AND revoked IS NULL`,
      [userId, clientId]
    );
    await client.query(
      `DELETE FROM oauth_consent
        WHERE id = $1
          AND user_id = $2`,
      [consentId, userId]
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
