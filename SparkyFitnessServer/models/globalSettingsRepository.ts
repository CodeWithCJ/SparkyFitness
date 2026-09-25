import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { getAgreedIdentitySettings } from '../utils/agreedSharedSettings.js';
/** Reads saved admin settings with the agreed environment overrides applied. */
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
    const overrides = getAgreedIdentitySettings();
    // Manage enable_email_password_login
    settings.is_email_login_env_configured =
      overrides.enable_email_password_login !== null;
    if (overrides.enable_email_password_login !== null) {
      settings.enable_email_password_login =
        overrides.enable_email_password_login;
    } else if (
      settings.enable_email_password_login === undefined ||
      settings.enable_email_password_login === null
    ) {
      settings.enable_email_password_login = true;
    }
    // Manage is_oidc_active
    settings.is_oidc_active_env_configured = overrides.is_oidc_active !== null;
    if (overrides.is_oidc_active !== null) {
      settings.is_oidc_active = overrides.is_oidc_active;
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

    log(
      'info',
      `[GLOBAL SETTINGS REPO] Retrieved Global Settings with overrides: ${JSON.stringify(settings)}`
    );
    return settings;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveGlobalSettings(settings: any) {
  const client = await getSystemClient(); // System-level operation
  try {
    const allowUserAiConfig =
      settings.allow_user_ai_config !== undefined
        ? settings.allow_user_ai_config
        : true;
    await client.query(
      `UPDATE global_settings
             SET enable_email_password_login = $1,
                 is_oidc_active = $2,
                 mfa_mandatory = $3,
                 allow_user_ai_config = COALESCE($4, allow_user_ai_config, true),
                 default_vision_ai_service_id = CASE WHEN $6 THEN $5 ELSE default_vision_ai_service_id END,
                 allow_openfoodfacts_contributions = COALESCE($7, allow_openfoodfacts_contributions, false),
                 allow_private_network_ai = COALESCE($8, allow_private_network_ai, false),
                 allow_private_network_food_providers = COALESCE($9, allow_private_network_food_providers, false),
                 public_api_docs = COALESCE($10, public_api_docs, false),
                 dev_tools_enabled = COALESCE($11, dev_tools_enabled, false),
                 mock_data_enabled = COALESCE($12, mock_data_enabled, false)
             WHERE id = 1
             RETURNING *`,
      [
        settings.enable_email_password_login,
        settings.is_oidc_active,
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
  | 'mock_data_enabled';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setMfaMandatorySetting(isMandatory: any) {
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
  isMockDataEnabled,
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
  isMockDataEnabled,
};
