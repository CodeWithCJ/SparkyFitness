import { getClient } from '../../db/poolManager.js';
import { HuaweiHealthError } from './huaweiHealthErrors.js';
import type {
  HuaweiHealthConnectionRecord,
  HuaweiHealthOAuthRepository,
  HuaweiHealthRefreshedTokens,
  HuaweiHealthStoredTokens,
} from './huaweiHealthOAuthService.js';

const PROVIDER_TYPE = 'huaweihealth';
const PROVIDER_NAME = 'HUAWEI Health';

async function updateOAuthState(
  userId: string,
  authenticatedUserId: string,
  stateRecord: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE external_data_providers
       SET oauth_state = $3, updated_at = NOW()
       WHERE user_id = $1 AND provider_type = $2 AND is_public = FALSE
       RETURNING id`,
      [userId, PROVIDER_TYPE, stateRecord]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function storeOAuthState(
  userId: string,
  authenticatedUserId: string,
  stateRecord: string
): Promise<void> {
  if (await updateOAuthState(userId, authenticatedUserId, stateRecord)) return;

  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `INSERT INTO external_data_providers (
         user_id, provider_name, provider_type, is_active, is_public,
         oauth_state, created_at, updated_at
       )
       VALUES ($1, $2, $3, FALSE, FALSE, $4, NOW(), NOW())
       ON CONFLICT (user_id, provider_name) DO NOTHING
       RETURNING id`,
      [userId, PROVIDER_NAME, PROVIDER_TYPE, stateRecord]
    );
    if ((result.rowCount ?? 0) > 0) return;
  } finally {
    client.release();
  }

  // A concurrent authorization request may have created the row after the
  // first UPDATE. Retry once; a same-name row of another type remains a clear
  // conflict and is never repurposed silently.
  if (await updateOAuthState(userId, authenticatedUserId, stateRecord)) return;

  throw new HuaweiHealthError(
    'HUAWEI_PROVIDER_CONFLICT',
    409,
    'A different provider already uses the reserved HUAWEI Health name.'
  );
}

async function consumeOAuthStateAtomically(
  userId: string,
  authenticatedUserId: string,
  state: string
): Promise<string | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `WITH matched AS (
         SELECT id, oauth_state
         FROM external_data_providers
         WHERE user_id = $1
           AND provider_type = $2
           AND is_public = FALSE
           AND split_part(oauth_state, '.', 1) = $3
         FOR UPDATE
       ), consumed AS (
         UPDATE external_data_providers edp
         SET oauth_state = NULL, updated_at = NOW()
         FROM matched
         WHERE edp.id = matched.id
         RETURNING matched.oauth_state
       )
       SELECT oauth_state FROM consumed`,
      [userId, PROVIDER_TYPE, state]
    );
    return result.rows[0]?.oauth_state ?? null;
  } finally {
    client.release();
  }
}

async function saveTokens(
  userId: string,
  authenticatedUserId: string,
  tokens: HuaweiHealthStoredTokens
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE external_data_providers
       SET encrypted_access_token = $3,
           access_token_iv = $4,
           access_token_tag = $5,
           encrypted_refresh_token = $6,
           refresh_token_iv = $7,
           refresh_token_tag = $8,
           token_expires_at = $9,
           scope = $10,
           external_user_id = $11,
           is_active = TRUE,
           is_public = FALSE,
           updated_at = NOW()
       WHERE user_id = $1 AND provider_type = $2 AND is_public = FALSE
       RETURNING id`,
      [
        userId,
        PROVIDER_TYPE,
        tokens.accessToken.encryptedText,
        tokens.accessToken.iv,
        tokens.accessToken.tag,
        tokens.refreshToken.encryptedText,
        tokens.refreshToken.iv,
        tokens.refreshToken.tag,
        tokens.tokenExpiresAt,
        tokens.scope,
        tokens.externalUserId,
      ]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new HuaweiHealthError(
        'HUAWEI_OAUTH_STATE_INVALID',
        400,
        'The Huawei authorization request no longer exists.'
      );
    }
  } finally {
    client.release();
  }
}

async function saveRefreshedTokens(
  userId: string,
  authenticatedUserId: string,
  tokens: HuaweiHealthRefreshedTokens
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE external_data_providers
       SET encrypted_access_token = $3,
           access_token_iv = $4,
           access_token_tag = $5,
           encrypted_refresh_token = COALESCE($6, encrypted_refresh_token),
           refresh_token_iv = COALESCE($7, refresh_token_iv),
           refresh_token_tag = COALESCE($8, refresh_token_tag),
           token_expires_at = $9,
           scope = COALESCE($10, scope),
           is_active = TRUE,
           updated_at = NOW()
       WHERE user_id = $1 AND provider_type = $2 AND is_public = FALSE
       RETURNING id`,
      [
        userId,
        PROVIDER_TYPE,
        tokens.accessToken.encryptedText,
        tokens.accessToken.iv,
        tokens.accessToken.tag,
        tokens.refreshToken?.encryptedText ?? null,
        tokens.refreshToken?.iv ?? null,
        tokens.refreshToken?.tag ?? null,
        tokens.tokenExpiresAt,
        tokens.scope ?? null,
      ]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new HuaweiHealthError(
        'HUAWEI_NOT_CONNECTED',
        409,
        'HUAWEI Health is not connected.'
      );
    }
  } finally {
    client.release();
  }
}

function toEncryptedValue(row: Record<string, unknown>): {
  encryptedAccessToken: string | null;
  accessTokenIv: string | null;
  accessTokenTag: string | null;
} {
  return {
    encryptedAccessToken: (row.encrypted_access_token as string | null) ?? null,
    accessTokenIv: (row.access_token_iv as string | null) ?? null,
    accessTokenTag: (row.access_token_tag as string | null) ?? null,
  };
}

async function getConnection(
  userId: string,
  authenticatedUserId: string
): Promise<HuaweiHealthConnectionRecord | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT is_active, external_user_id, last_sync_at, token_expires_at,
              scope, encrypted_access_token, access_token_iv, access_token_tag,
              encrypted_refresh_token, refresh_token_iv, refresh_token_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = $2 AND is_public = FALSE`,
      [userId, PROVIDER_TYPE]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      isActive: row.is_active === true,
      externalUserId: row.external_user_id ?? null,
      lastSyncAt: row.last_sync_at ?? null,
      tokenExpiresAt: row.token_expires_at ?? null,
      scope: row.scope ?? null,
      ...toEncryptedValue(row),
      encryptedRefreshToken: row.encrypted_refresh_token ?? null,
      refreshTokenIv: row.refresh_token_iv ?? null,
      refreshTokenTag: row.refresh_token_tag ?? null,
    };
  } finally {
    client.release();
  }
}

async function clearConnection(
  userId: string,
  authenticatedUserId: string
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query(
      `UPDATE external_data_providers
       SET encrypted_access_token = NULL,
           access_token_iv = NULL,
           access_token_tag = NULL,
           encrypted_refresh_token = NULL,
           refresh_token_iv = NULL,
           refresh_token_tag = NULL,
           token_expires_at = NULL,
           external_user_id = NULL,
           scope = NULL,
           oauth_state = NULL,
           is_active = FALSE,
           updated_at = NOW()
       WHERE user_id = $1 AND provider_type = $2 AND is_public = FALSE`,
      [userId, PROVIDER_TYPE]
    );
  } finally {
    client.release();
  }
}

const huaweiHealthOAuthRepository: HuaweiHealthOAuthRepository = {
  storeOAuthState,
  consumeOAuthState: consumeOAuthStateAtomically,
  saveTokens,
  saveRefreshedTokens,
  getConnection,
  clearConnection,
};

export default huaweiHealthOAuthRepository;
