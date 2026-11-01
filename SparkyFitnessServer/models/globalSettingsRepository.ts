import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import {
  DEFAULT_MCP_OAUTH_ALLOWED_REDIRECT_URIS,
  getMcpOAuthAvailability,
} from '../utils/mcpOAuth.js';

interface GlobalSettingsUpdate {
  enable_email_password_login?: boolean;
  is_oidc_active?: boolean;
  is_mfa_mandatory?: boolean | null;
  allow_user_ai_config?: boolean;
  default_vision_ai_service_id?: string | null;
  allow_openfoodfacts_contributions?: boolean;
  allow_private_network_ai?: boolean;
  allow_private_network_food_providers?: boolean;
  public_api_docs?: boolean;
  dev_tools_enabled?: boolean;
  mock_data_enabled?: boolean;
  enable_passkey_login?: boolean;
  mcp_oauth_enabled?: boolean;
  mcp_oauth_allowed_redirect_uris?: string[];
  enable_version_check?: boolean;
}

async function getGlobalSettings() {
  const client = await getSystemClient(); // System-level operation
  try {
    const result = await client.query(
      'SELECT * FROM global_settings WHERE id = 1'
    );
    const settings = result.rows[0] || {};
    // Map mandatory MFA
    settings.is_mfa_mandatory = !!settings.mfa_mandatory;
    // Environment variable overrides
    const forceEmailLogin =
      process.env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN === 'true';
    const disableEmailLogin =
      process.env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN === 'true';
    const oidcAuthEnabledEnv =
      process.env.SPARKY_FITNESS_OIDC_AUTH_ENABLED === 'true';
    // Manage enable_email_password_login
    settings.is_email_login_env_configured =
      forceEmailLogin || disableEmailLogin;
    if (forceEmailLogin) {
      settings.enable_email_password_login = true;
    } else if (disableEmailLogin) {
      settings.enable_email_password_login = false;
    } else if (
      settings.enable_email_password_login === undefined ||
      settings.enable_email_password_login === null
    ) {
      settings.enable_email_password_login = true;
    }
    // Manage enable_passkey_login
    const forcePasskeyLogin =
      process.env.SPARKY_FITNESS_FORCE_PASSKEY_LOGIN === 'true';
    const disablePasskeyLogin =
      process.env.SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN === 'true';
    settings.is_passkey_login_env_configured =
      forcePasskeyLogin || disablePasskeyLogin;
    if (forcePasskeyLogin) {
      settings.enable_passkey_login = true;
    } else if (disablePasskeyLogin) {
      settings.enable_passkey_login = false;
    } else if (
      settings.enable_passkey_login === undefined ||
      settings.enable_passkey_login === null
    ) {
      settings.enable_passkey_login = true;
    }
    // Manage is_oidc_active
    settings.is_oidc_active_env_configured = oidcAuthEnabledEnv;
    if (oidcAuthEnabledEnv) {
      settings.is_oidc_active = true;
    } else if (
      settings.is_oidc_active === undefined ||
      settings.is_oidc_active === null
    ) {
      settings.is_oidc_active = false;
    }
    // Ensure allow_user_ai_config defaults to true
    if (
      settings.allow_user_ai_config === null ||
      settings.allow_user_ai_config === undefined
    ) {
      settings.allow_user_ai_config = true;
    }
    if (
      settings.allow_openfoodfacts_contributions === null ||
      settings.allow_openfoodfacts_contributions === undefined
    ) {
      settings.allow_openfoodfacts_contributions = false;
    }
    settings.allow_private_network_ai = !!settings.allow_private_network_ai;
    settings.allow_private_network_food_providers =
      !!settings.allow_private_network_food_providers;
    settings.public_api_docs = !!settings.public_api_docs;
    settings.dev_tools_enabled = !!settings.dev_tools_enabled;
    settings.mock_data_enabled = !!settings.mock_data_enabled;
    settings.mcp_oauth_enabled = !!settings.mcp_oauth_enabled;
    settings.mcp_oauth_allowed_redirect_uris = Array.isArray(
      settings.mcp_oauth_allowed_redirect_uris
    )
      ? settings.mcp_oauth_allowed_redirect_uris
      : [...DEFAULT_MCP_OAUTH_ALLOWED_REDIRECT_URIS];
    const mcpOAuthAvailability = getMcpOAuthAvailability();
    settings.mcp_oauth_available = mcpOAuthAvailability.available;
    settings.mcp_oauth_unavailable_reason = mcpOAuthAvailability.reason;
    // The column is NOT NULL DEFAULT TRUE; a missing row reads as off, matching
    // isVersionCheckEnabled.
    settings.enable_version_check = !!settings.enable_version_check;

    log(
      'info',
      `[GLOBAL SETTINGS REPO] Retrieved Global Settings with overrides: ${JSON.stringify(settings)}`
    );
    return settings;
  } finally {
    client.release();
  }
}
async function saveGlobalSettings(settings: GlobalSettingsUpdate) {
  const client = await getSystemClient(); // System-level operation
  try {
    const allowUserAiConfig =
      settings.allow_user_ai_config !== undefined
        ? settings.allow_user_ai_config
        : true;
    // While an env var forces a login setting, keep the stored admin choice:
    // the admin page sends back the forced value on every unrelated save.
    const emailLoginEnvForced =
      process.env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN === 'true' ||
      process.env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN === 'true';
    const oidcEnvForced =
      process.env.SPARKY_FITNESS_OIDC_AUTH_ENABLED === 'true';
    const passkeyEnvForced =
      process.env.SPARKY_FITNESS_FORCE_PASSKEY_LOGIN === 'true' ||
      process.env.SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN === 'true';
    await client.query(
      `UPDATE global_settings
             SET enable_email_password_login = COALESCE($1, enable_email_password_login),
                 is_oidc_active = COALESCE($2, is_oidc_active),
                 mfa_mandatory = $3,
                 allow_user_ai_config = COALESCE($4, allow_user_ai_config, true),
                 default_vision_ai_service_id = CASE WHEN $6 THEN $5 ELSE default_vision_ai_service_id END,
                 allow_openfoodfacts_contributions = COALESCE($7, allow_openfoodfacts_contributions, false),
                 allow_private_network_ai = COALESCE($8, allow_private_network_ai, false),
                 allow_private_network_food_providers = COALESCE($9, allow_private_network_food_providers, false),
                 public_api_docs = COALESCE($10, public_api_docs, false),
                 dev_tools_enabled = COALESCE($11, dev_tools_enabled, false),
                 mock_data_enabled = COALESCE($12, mock_data_enabled, false),
                 enable_passkey_login = COALESCE($13, enable_passkey_login, true),
                 mcp_oauth_enabled = COALESCE($14, mcp_oauth_enabled, false),
                 enable_version_check = COALESCE($15, enable_version_check, true),
                 mcp_oauth_allowed_redirect_uris = COALESCE($16, mcp_oauth_allowed_redirect_uris)
             WHERE id = 1
             RETURNING *`,
      [
        emailLoginEnvForced
          ? null
          : (settings.enable_email_password_login ?? null),
        oidcEnvForced ? null : (settings.is_oidc_active ?? null),
        settings.is_mfa_mandatory,
        allowUserAiConfig,
        settings.default_vision_ai_service_id ?? null,
        'default_vision_ai_service_id' in settings,
        settings.allow_openfoodfacts_contributions ?? null,
        settings.allow_private_network_ai ?? null,
        settings.allow_private_network_food_providers ?? null,
        settings.public_api_docs ?? null,
        settings.dev_tools_enabled ?? null,
        settings.mock_data_enabled ?? null,
        passkeyEnvForced ? null : (settings.enable_passkey_login ?? null),
        settings.mcp_oauth_enabled ?? null,
        settings.enable_version_check ?? null,
        settings.mcp_oauth_allowed_redirect_uris ?? null,
      ]
    );
    // Return the full truth (DB + ENV overrides)
    return await getGlobalSettings();
  } finally {
    client.release();
  }
}
async function isOpenFoodFactsContributionAllowed(): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT allow_openfoodfacts_contributions
         FROM global_settings
        WHERE id = 1`
    );
    return result.rows[0]?.allow_openfoodfacts_contributions === true;
  } finally {
    client.release();
  }
}
/**
 * The boolean policy columns on `global_settings`. A closed union, because the
 * column name is interpolated into the SQL below — nothing outside this file
 * can widen it, and no value ever comes from a request.
 */
type BooleanSettingColumn =
  | 'allow_private_network_ai'
  | 'allow_private_network_food_providers'
  | 'public_api_docs'
  | 'dev_tools_enabled'
  | 'mock_data_enabled'
  | 'mcp_oauth_enabled'
  | 'enable_version_check';

/**
 * Reads one boolean policy column from `global_settings`, failing closed.
 *
 * These are consulted on request paths (SSRF policy, API-doc access, dev tool
 * registration), so an unreachable database must deny rather than throw a
 * connection error into the caller. The client is acquired inside the try for
 * that reason: `getSystemClient()` itself rejects when Postgres is down.
 */
async function readBooleanSetting(
  column: BooleanSettingColumn
): Promise<boolean> {
  let client;
  try {
    client = await getSystemClient();
    const result = await client.query(
      `SELECT ${column} FROM global_settings WHERE id = 1`
    );
    return result.rows[0]?.[column] === true;
  } catch (error) {
    log(
      'warn',
      `[GLOBAL SETTINGS REPO] Could not read ${column}; defaulting to false: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  } finally {
    client?.release();
  }
}

async function isPrivateNetworkAiAllowed(): Promise<boolean> {
  return readBooleanSetting('allow_private_network_ai');
}
async function isPrivateNetworkFoodProvidersAllowed(): Promise<boolean> {
  return readBooleanSetting('allow_private_network_food_providers');
}
async function isPublicApiDocsAllowed(): Promise<boolean> {
  return readBooleanSetting('public_api_docs');
}
async function isDevToolsEnabled(): Promise<boolean> {
  return readBooleanSetting('dev_tools_enabled');
}
async function isMcpOAuthEnabled(): Promise<boolean> {
  return readBooleanSetting('mcp_oauth_enabled');
}

/** Reads the administrator-controlled OAuth redirect allowlist, failing closed. */
async function getMcpOAuthAllowedRedirectUris(): Promise<string[]> {
  let client;
  try {
    client = await getSystemClient();
    const result = await client.query(
      'SELECT mcp_oauth_allowed_redirect_uris FROM global_settings WHERE id = 1'
    );
    const value = result.rows[0]?.mcp_oauth_allowed_redirect_uris;
    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value
      : [];
  } catch (error) {
    log(
      'warn',
      `[GLOBAL SETTINGS REPO] Could not read MCP OAuth redirect allowlist; denying redirects: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  } finally {
    client?.release();
  }
}
/**
 * Admin master switch for the runtime mock-data options. While false, the
 * per-sync `saveMockData` / `dataSource` request options are ignored, so no
 * user can make the server write provider responses to disk or replay
 * fixtures. There is deliberately no env fallback: this is an operator
 * decision made in the Admin UI and meant to be turned back off.
 */
async function isMockDataEnabled(): Promise<boolean> {
  return readBooleanSetting('mock_data_enabled');
}
/**
 * Whether the server may ask GitHub for the latest release
 * (`/api/version/latest-github`). On by default; an admin turns it off when
 * updates are managed outside the app or the server must not contact
 * api.github.com. Fails closed like the lookups above, so an unreadable
 * setting skips the request instead of making it.
 */
async function isVersionCheckEnabled(): Promise<boolean> {
  return readBooleanSetting('enable_version_check');
}
async function isUserAiConfigAllowed() {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT allow_user_ai_config FROM global_settings WHERE id = 1'
    );
    const value = result.rows[0] ? result.rows[0].allow_user_ai_config : true; // Default to true if not set
    log(
      'debug',
      `[GLOBAL SETTINGS REPO] User AI config allowed (from DB): ${value}`
    );
    return value;
  } finally {
    client.release();
  }
}
async function getMfaMandatorySetting() {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'SELECT mfa_mandatory FROM global_settings WHERE id = 1'
    );
    return result.rows[0] ? result.rows[0].mfa_mandatory : false;
  } finally {
    client.release();
  }
}
async function setMfaMandatorySetting(isMandatory: boolean) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      'UPDATE global_settings SET mfa_mandatory = $1, updated_at = now() WHERE id = 1 RETURNING mfa_mandatory',
      [isMandatory]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
export {
  getGlobalSettings,
  saveGlobalSettings,
  getMfaMandatorySetting,
  setMfaMandatorySetting,
  isUserAiConfigAllowed,
  isOpenFoodFactsContributionAllowed,
  isPrivateNetworkAiAllowed,
  isPrivateNetworkFoodProvidersAllowed,
  isPublicApiDocsAllowed,
  isDevToolsEnabled,
  isMcpOAuthEnabled,
  getMcpOAuthAllowedRedirectUris,
  isMockDataEnabled,
  isVersionCheckEnabled,
};
export default {
  getGlobalSettings,
  saveGlobalSettings,
  getMfaMandatorySetting,
  setMfaMandatorySetting,
  isUserAiConfigAllowed,
  isOpenFoodFactsContributionAllowed,
  isPrivateNetworkAiAllowed,
  isPrivateNetworkFoodProvidersAllowed,
  isPublicApiDocsAllowed,
  isDevToolsEnabled,
  isMcpOAuthEnabled,
  getMcpOAuthAllowedRedirectUris,
  isMockDataEnabled,
  isVersionCheckEnabled,
};
