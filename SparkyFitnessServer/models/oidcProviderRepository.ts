import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import NodeCache from 'node-cache';
import type { OidcProviderUpdate } from '../schemas/oidcProviderSchemas.js';
import type { PoolClient } from 'pg';
const discoveryCache = new NodeCache({ stdTTL: 3600 });

/** Thrown when a provider cannot be saved because its discovery document is unavailable. */
class OidcDiscoveryError extends Error {
  readonly discoveryEndpoint: string;
  constructor(discoveryEndpoint: string) {
    super(`OIDC discovery document unavailable at ${discoveryEndpoint}`);
    this.name = 'OidcDiscoveryError';
    this.discoveryEndpoint = discoveryEndpoint;
  }
}

/** Falls back to Better Auth's configuration when the legacy client ID column is unset. */
function getStoredClientId(row: {
  client_id: string | null;
  oidc_config?: { clientId?: string } | null;
}): string | null {
  return row.client_id ?? row.oidc_config?.clientId ?? null;
}

/**
 * Returns the frontend base URL with protocol and no trailing slash (for OIDC redirect URIs).
 * @returns {string}
 */
function getBaseUrl() {
  const frontendUrl =
    process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080';
  const urlWithProtocol = frontendUrl.startsWith('http')
    ? frontendUrl
    : `https://${frontendUrl}`;
  return urlWithProtocol.replace(/\/$/, '');
}
/**
 * Fetches OIDC endpoints from the discovery document
 * @param {string} discoveryEndpoint - The OIDC discovery endpoint URL
 * @returns {Promise<Object>} Object containing jwksEndpoint, tokenEndpoint, authorizationEndpoint, userInfoEndpoint
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOidcEndpoints(discoveryEndpoint: any) {
  let discoveryDocument = discoveryCache.get(discoveryEndpoint);
  if (!discoveryDocument) {
    try {
      const response = await fetch(discoveryEndpoint);
      if (response.ok) {
        discoveryDocument = await response.json();
        discoveryCache.set(discoveryEndpoint, discoveryDocument);
      } else {
        log(
          'error',
          `Failed to fetch discovery document from ${discoveryEndpoint}: ${response.status}`
        );
        return {};
      }
    } catch (e) {
      log('error', `Error fetching discovery from ${discoveryEndpoint}:`, e);
      return {};
    }
  }
  return {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    issuer: discoveryDocument.issuer,
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    jwksEndpoint: discoveryDocument.jwks_uri,
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    tokenEndpoint: discoveryDocument.token_endpoint,
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    authorizationEndpoint: discoveryDocument.authorization_endpoint,
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    userInfoEndpoint: discoveryDocument.userinfo_endpoint,
  };
}
async function getOidcProviders() {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT * FROM "sso_provider" ORDER BY created_at ASC'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result.rows.map((row: any) => {
      const config = row.additional_config
        ? JSON.parse(row.additional_config)
        : {};
      const baseUrl = getBaseUrl();
      return {
        id: row.id,
        provider_id: row.provider_id,
        issuer_url: row.issuer,
        domain: row.domain,
        client_id: getStoredClientId(row),
        scope: row.scopes,
        is_active: config.is_active !== undefined ? config.is_active : true,
        redirect_uris: config.redirect_uris || [],
        response_types: config.response_types || ['code'],
        token_endpoint_auth_method:
          config.token_endpoint_auth_method || 'client_secret_post',
        signing_algorithm: config.signing_algorithm || 'RS256',
        profile_signing_algorithm: config.profile_signing_algorithm || 'none',
        timeout: config.timeout || 30000,
        userInfoEndpoint: row.userinfo_endpoint,
        jwksEndpoint: row.jwks_endpoint,
        tokenEndpoint: row.token_endpoint,
        authorizationEndpoint: row.authorization_endpoint,
        discoveryEndpoint: row.discovery_endpoint,
        ...config,
        // Force correct redirectURI for Better Auth
        redirectURI: `${baseUrl}/api/auth/sso/callback/${row.provider_id}`,
      };
    });
  } finally {
    client.release();
  }
}
/** Resolve a provider by row ID, exact provider ID, or a legacy prefix alias. */
async function getOidcProviderById(id: string) {
  if (!id) return null;
  const client = await getSystemClient();
  try {
    const cleanId = id.startsWith('oidc-') ? id.replace('oidc-', '') : id;
    const prefixedId = id.startsWith('oidc-') ? id : `oidc-${id}`;

    const result = await client.query(
      `SELECT * FROM "sso_provider" 
       WHERE id::text = $1 
          OR provider_id = $1 
          OR provider_id = $2 
          OR provider_id = $3
       ORDER BY CASE
         WHEN id::text = $1 THEN 0
         WHEN provider_id = $1 THEN 1
         ELSE 2
       END
       LIMIT 1`,
      [id, cleanId, prefixedId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const config = row.additional_config
      ? JSON.parse(row.additional_config)
      : {};
    const baseUrl = getBaseUrl();
    const provider = {
      id: row.id,
      provider_id: row.provider_id,
      issuer_url: row.issuer,
      domain: row.domain,
      client_id: getStoredClientId(row),
      client_secret: row.client_secret,
      scope: row.scopes,
      is_active: config.is_active !== undefined ? config.is_active : true,
      redirect_uris: config.redirect_uris || [],
      response_types: config.response_types || ['code'],
      token_endpoint_auth_method:
        config.token_endpoint_auth_method || 'client_secret_post',
      signing_algorithm: config.signing_algorithm || 'RS256',
      profile_signing_algorithm: config.profile_signing_algorithm || 'none',
      timeout: config.timeout || 30000,
      userInfoEndpoint: row.userinfo_endpoint,
      jwksEndpoint: row.jwks_endpoint,
      tokenEndpoint: row.token_endpoint,
      authorizationEndpoint: row.authorization_endpoint,
      discoveryEndpoint: row.discovery_endpoint,
      ...config,
      // Force correct redirectURI for Better Auth
      redirectURI: `${baseUrl}/api/auth/sso/callback/${row.provider_id}`,
    };
    let endSessionEndpoint = null;
    if (provider.issuer_url) {
      const discoveryUrl = `${provider.issuer_url.replace(/\/$/, '')}/.well-known/openid-configuration`;
      let discoveryDocument = discoveryCache.get(discoveryUrl);
      if (!discoveryDocument) {
        try {
          const response = await fetch(discoveryUrl);
          if (response.ok) {
            discoveryDocument = await response.json();
            discoveryCache.set(discoveryUrl, discoveryDocument);
          }
        } catch (e) {
          log(
            'error',
            `Repo: Error fetching discovery from ${discoveryUrl}:`,
            e
          );
        }
      }
      if (discoveryDocument) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        endSessionEndpoint = discoveryDocument.end_session_endpoint;
      }
    }
    return {
      ...provider,
      end_session_endpoint: endSessionEndpoint,
    };
  } finally {
    client.release();
  }
}
/** Prepares stored configuration and discovered endpoints without writing to the database. */
async function prepareOidcProvider(
  providerData: OidcProviderUpdate,
  providerId: string
) {
  const config = JSON.stringify({
    display_name: providerData.display_name,
    logo_url: providerData.logo_url,
    auto_register: providerData.auto_register || false,
    is_active:
      providerData.is_active !== undefined ? providerData.is_active : true,
    redirect_uris: providerData.redirect_uris || [],
    response_types: providerData.response_types || ['code'],
    token_endpoint_auth_method:
      providerData.token_endpoint_auth_method || 'client_secret_post',
    signing_algorithm: providerData.signing_algorithm || 'RS256',
    profile_signing_algorithm: providerData.profile_signing_algorithm || 'none',
    timeout: providerData.timeout || 30000,
    is_env_configured: providerData.is_env_configured || false,
    admin_group: providerData.admin_group,
  });
  const discoveryEndpoint =
    providerData.issuer_url.replace(/\/$/, '') +
    '/.well-known/openid-configuration';
  const endpoints = await fetchOidcEndpoints(discoveryEndpoint);
  const baseUrl = getBaseUrl();
  const callbackBase = `${baseUrl}/api/auth`;
  const oidcConfig = {
    issuer: endpoints.issuer || providerData.issuer_url,
    clientId: providerData.client_id,
    clientSecret: providerData.client_secret,
    scopes: (providerData.scope || 'openid email profile')
      .split(' ')
      .filter(Boolean),
    discoveryEndpoint: discoveryEndpoint,
    pkce: true,
    redirectURI: `${callbackBase}/sso/callback/${providerId}`,
    jwksEndpoint: endpoints.jwksEndpoint,
    tokenEndpoint: endpoints.tokenEndpoint,
    authorizationEndpoint: endpoints.authorizationEndpoint,
    userInfoEndpoint: endpoints.userInfoEndpoint,
    tokenEndpointAuthentication:
      providerData.token_endpoint_auth_method || 'client_secret_post',
    overrideUserInfo: true,
  };
  return { config, discoveryEndpoint, endpoints, oidcConfig };
}

/** Creates a provider with default configuration for omitted settings. */
async function createOidcProvider(providerData: OidcProviderUpdate) {
  const client = await getSystemClient();
  try {
    const providerId = providerData.provider_id || `oidc-${Date.now()}`;
    const { config, discoveryEndpoint, endpoints, oidcConfig } =
      await prepareOidcProvider(
        { ...providerData, admin_group: providerData.admin_group || null },
        providerId
      );
    const result = await client.query(
      `INSERT INTO "sso_provider" 
            (provider_id, issuer, domain, client_id, client_secret, scopes, discovery_endpoint, 
             authorization_endpoint, token_endpoint, jwks_endpoint, userinfo_endpoint, 
             additional_config, oidc_config)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
            RETURNING id`,
      [
        providerId,
        endpoints.issuer || providerData.issuer_url,
        providerData.domain || `${providerId}.internal`,
        providerData.client_id,
        providerData.client_secret,
        providerData.scope || 'openid email profile',
        discoveryEndpoint,
        endpoints.authorizationEndpoint,
        endpoints.tokenEndpoint,
        endpoints.jwksEndpoint,
        endpoints.userInfoEndpoint,
        config,
        oidcConfig,
      ]
    );
    // Refresh Better Auth trusted providers after creation
    try {
      const { syncTrustedProviders } = await import('../auth.js');
      await syncTrustedProviders();
    } catch (err) {
      log('error', 'Failed to refresh trusted providers after creation:', err);
    }
    return result.rows[0];
  } finally {
    client.release();
  }
}
/** Saves the environment provider and removes stale environment providers atomically. */
async function upsertEnvOidcProvider(
  providerData: OidcProviderUpdate & {
    provider_id: string;
    client_secret: string;
    domain: string;
  }
): Promise<string[]> {
  const providerId = providerData.provider_id;
  const { config, discoveryEndpoint, endpoints, oidcConfig } =
    await prepareOidcProvider(providerData, providerId);
  // Without discovery the row would carry the configured issuer instead of the
  // IdP's, and no endpoints, so every login would fail until the next restart.
  // Leave any existing row untouched and let the caller retry.
  if (!endpoints.issuer) {
    throw new OidcDiscoveryError(discoveryEndpoint);
  }
  const client: PoolClient = await getSystemClient();
  let rollbackFailed = false;
  let removed: string[];
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('oidc_environment_provider_reconciliation'))"
    );
    await client.query(
      `INSERT INTO "sso_provider"
       (provider_id, issuer, domain, client_id, client_secret, scopes, discovery_endpoint,
        authorization_endpoint, token_endpoint, jwks_endpoint, userinfo_endpoint,
        additional_config, oidc_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT (provider_id) DO UPDATE SET
         issuer = EXCLUDED.issuer, domain = EXCLUDED.domain,
         client_id = EXCLUDED.client_id, client_secret = EXCLUDED.client_secret,
         scopes = EXCLUDED.scopes, discovery_endpoint = EXCLUDED.discovery_endpoint,
         authorization_endpoint = EXCLUDED.authorization_endpoint,
         token_endpoint = EXCLUDED.token_endpoint, jwks_endpoint = EXCLUDED.jwks_endpoint,
         userinfo_endpoint = EXCLUDED.userinfo_endpoint,
         additional_config = EXCLUDED.additional_config, oidc_config = EXCLUDED.oidc_config,
         updated_at = NOW()`,
      [
        providerId,
        endpoints.issuer || providerData.issuer_url,
        providerData.domain,
        providerData.client_id,
        providerData.client_secret,
        providerData.scope || 'openid email profile',
        discoveryEndpoint,
        endpoints.authorizationEndpoint,
        endpoints.tokenEndpoint,
        endpoints.jwksEndpoint,
        endpoints.userInfoEndpoint,
        config,
        oidcConfig,
      ]
    );
    const result = await client.query<{ provider_id: string }>(
      `DELETE FROM "sso_provider"
       WHERE additional_config::jsonb->>'is_env_configured' = 'true'
       AND provider_id != $1
       RETURNING provider_id`,
      [providerId]
    );
    removed = result.rows.map((row) => row.provider_id);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      rollbackFailed = true;
      log(
        'error',
        'Failed to roll back environment OIDC configuration:',
        rollbackError
      );
    }
    throw error;
  } finally {
    client.release(rollbackFailed);
  }
  try {
    const { syncTrustedProviders } = await import('../auth.js');
    await syncTrustedProviders();
  } catch (error) {
    log(
      'error',
      'Failed to refresh trusted providers after environment configuration:',
      error
    );
  }
  return removed;
}

/** Update the resolved provider, retaining its provider ID unless explicitly replaced. */
async function updateOidcProvider(
  id: string,
  providerData: OidcProviderUpdate
) {
  const client = await getSystemClient();
  try {
    const existing = await getOidcProviderById(id);
    if (!existing) {
      throw new Error('OIDC provider not found');
    }
    const clientId = providerData.client_id ?? existing.client_id;
    if (typeof clientId !== 'string' || clientId.length === 0) {
      throw new Error('OIDC client ID is required');
    }
    const clientSecret = providerData.client_secret || existing.client_secret;
    const providerIdToUse = providerData.provider_id || existing.provider_id;
    const { config, discoveryEndpoint, endpoints, oidcConfig } =
      await prepareOidcProvider(
        {
          ...providerData,
          client_id: clientId,
          client_secret: clientSecret,
          admin_group:
            providerData.admin_group !== undefined
              ? providerData.admin_group
              : existing.admin_group || null,
        },
        providerIdToUse
      );
    const query = `
            UPDATE "sso_provider" 
            SET issuer=$1, domain=$2, client_id=$3, client_secret=$4, scopes=$5, discovery_endpoint=$6, 
                authorization_endpoint=$7, token_endpoint=$8, jwks_endpoint=$9, userinfo_endpoint=$10,
                additional_config=$11, oidc_config=$12::jsonb, provider_id=$13, updated_at=NOW() 
            WHERE id::text=$14
            RETURNING id`;
    const result = await client.query(query, [
      endpoints.issuer || providerData.issuer_url,
      providerData.domain === undefined ? existing.domain : providerData.domain,
      clientId,
      clientSecret,
      providerData.scope || 'openid email profile',
      discoveryEndpoint,
      endpoints.authorizationEndpoint,
      endpoints.tokenEndpoint,
      endpoints.jwksEndpoint,
      endpoints.userInfoEndpoint,
      config,
      oidcConfig,
      providerIdToUse,
      existing.id,
    ]);
    // Refresh Better Auth trusted providers after update
    try {
      const { syncTrustedProviders } = await import('../auth.js');
      await syncTrustedProviders();
    } catch (err) {
      log('error', 'Failed to refresh trusted providers after update:', err);
    }
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteOidcProvider(id: any) {
  const client = await getSystemClient();
  try {
    await client.query(
      'DELETE FROM "sso_provider" WHERE id::text = $1 OR provider_id = $1',
      [id]
    );
    // Refresh Better Auth trusted providers after deletion
    try {
      const { syncTrustedProviders } = await import('../auth.js');
      await syncTrustedProviders();
    } catch (err) {
      log('error', 'Failed to refresh trusted providers after deletion:', err);
    }
  } finally {
    client.release();
  }
}
async function getActiveOidcProviderIds() {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT provider_id, additional_config FROM "sso_provider"'
    );
    return (
      result.rows
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => {
          let config = row.additional_config;
          if (typeof config === 'string') {
            try {
              config = JSON.parse(config);
            } catch (e) {
              log('error', `Failed to parse config for ${row.provider_id}:`, e);
              return false;
            }
          }
          // Trust if active (default to true if field is missing)
          const isActive = config && config.is_active !== false;
          return isActive;
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => row.provider_id)
    );
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setProviderLogo(id: any, logoUrl: any) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT additional_config FROM "sso_provider" WHERE id::text = $1',
      [id]
    );
    if (result.rows.length > 0) {
      const config = result.rows[0].additional_config
        ? JSON.parse(result.rows[0].additional_config)
        : {};
      config.logo_url = logoUrl;
      await client.query(
        'UPDATE "sso_provider" SET additional_config = $1 WHERE id::text = $2',
        [JSON.stringify(config), id]
      );
      return true;
    }
    return false;
  } finally {
    client.release();
  }
}
export { getOidcProviders };
export { getOidcProviderById };
export { getActiveOidcProviderIds };
export { createOidcProvider };
export { updateOidcProvider };
export { upsertEnvOidcProvider };
export { OidcDiscoveryError };
export { deleteOidcProvider };
export { setProviderLogo };
export default {
  getOidcProviders,
  getOidcProviderById,
  getActiveOidcProviderIds,
  createOidcProvider,
  updateOidcProvider,
  upsertEnvOidcProvider,
  deleteOidcProvider,
  setProviderLogo,
};
