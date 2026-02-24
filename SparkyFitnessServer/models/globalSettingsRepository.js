const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getGlobalSettings() {
    const client = await getSystemClient(); // System-level operation
    try {
        const result = await client.query('SELECT * FROM global_settings WHERE id = 1');
        const settings = result.rows[0] || {};

        // Map mandatory MFA
        settings.is_mfa_mandatory = !!settings.mfa_mandatory;

        // Environment variable overrides
        const forceEmailLogin = process.env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN === 'true';
        const disableEmailLogin = process.env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN === 'true';
        const oidcAuthEnabledEnv = process.env.SPARKY_FITNESS_OIDC_AUTH_ENABLED === 'true';

        // Manage enable_email_password_login
        settings.is_email_login_env_configured = forceEmailLogin || disableEmailLogin;
        if (forceEmailLogin) {
            settings.enable_email_password_login = true;
        } else if (disableEmailLogin) {
            settings.enable_email_password_login = false;
        } else if (settings.enable_email_password_login === undefined || settings.enable_email_password_login === null) {
            settings.enable_email_password_login = true;
        }

        // Manage is_oidc_active
        settings.is_oidc_active_env_configured = oidcAuthEnabledEnv;
        if (oidcAuthEnabledEnv) {
            settings.is_oidc_active = true;
        } else if (settings.is_oidc_active === undefined || settings.is_oidc_active === null) {
            settings.is_oidc_active = false;
        }

        // Ensure allow_user_ai_config defaults to true
        if (settings.allow_user_ai_config === null || settings.allow_user_ai_config === undefined) {
            settings.allow_user_ai_config = true;
        }

        log('info', `[GLOBAL SETTINGS REPO] Retrieved Global Settings with overrides: ${JSON.stringify(settings)}`);
        return settings;
    } finally {
        client.release();
    }
}

async function saveGlobalSettings(settings) {
    const client = await getSystemClient(); // System-level operation
    try {
        // Default allow_user_ai_config to true if not provided
        const allowUserAiConfig = settings.allow_user_ai_config !== undefined
            ? settings.allow_user_ai_config
            : true;

        const result = await client.query(
            `UPDATE global_settings
             SET enable_email_password_login = $1, is_oidc_active = $2, mfa_mandatory = $3, allow_user_ai_config = COALESCE($4, allow_user_ai_config, true)
             WHERE id = 1
             RETURNING *`,
            // Use 'is_mfa_mandatory' from the incoming settings from the frontend
            [
                settings.enable_email_password_login,
                settings.is_oidc_active,
                settings.is_mfa_mandatory,
                allowUserAiConfig
            ]
        );
        // Return the full truth (DB + ENV overrides)
        return await getGlobalSettings();
    } finally {
        client.release();
    }
}

async function isUserAiConfigAllowed() {
    const client = await getSystemClient();
    try {
        const result = await client.query('SELECT allow_user_ai_config FROM global_settings WHERE id = 1');
        const value = result.rows[0] ? result.rows[0].allow_user_ai_config : true; // Default to true if not set
        log('info', `[GLOBAL SETTINGS REPO] User AI config allowed (from DB): ${value}`);
        return value;
    } finally {
        client.release();
    }
}

async function getMfaMandatorySetting() {
    const client = await getSystemClient();
    try {
        const result = await client.query('SELECT mfa_mandatory FROM global_settings WHERE id = 1');
        return result.rows[0] ? result.rows[0].mfa_mandatory : false;
    } finally {
        client.release();
    }
}

async function setMfaMandatorySetting(isMandatory) {
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

module.exports = {
    getGlobalSettings,
    saveGlobalSettings,
    getMfaMandatorySetting,
    setMfaMandatorySetting,
    isUserAiConfigAllowed,
};
