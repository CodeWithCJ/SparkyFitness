const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getGlobalSettings() {
    const client = await getSystemClient(); // System-level operation
    try {
        const result = await client.query('SELECT * FROM global_settings WHERE id = 1');
        const settings = result.rows[0];
        if (settings) {
            // Map the database column 'mfa_mandatory' to the frontend's expected 'is_mfa_mandatory'
            settings.is_mfa_mandatory = settings.mfa_mandatory;
            
            // Environment variable is source of truth if set
            if (process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG !== undefined) {
                const envValue = process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG === 'true' || 
                                 process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG === '1';
                settings.allow_user_ai_config = envValue;
                log('info', `[GLOBAL SETTINGS REPO] allow_user_ai_config overridden by environment variable: ${envValue}`);
            }
        }
        log('info', `[GLOBAL SETTINGS REPO] Retrieved Global Settings: ${JSON.stringify(settings)}`);
        return settings;
    } finally {
        client.release();
    }
}

async function saveGlobalSettings(settings) {
    const client = await getSystemClient(); // System-level operation
    try {
        // Check if environment variable is set - if so, don't allow saving this setting
        if (process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG !== undefined) {
            log('warn', '[GLOBAL SETTINGS REPO] allow_user_ai_config is controlled by environment variable, ignoring database update');
            // Remove allow_user_ai_config from settings if env var is set
            const { allow_user_ai_config, ...settingsWithoutAiConfig } = settings;
            settings = settingsWithoutAiConfig;
        }
        
        const result = await client.query(
            `UPDATE global_settings
             SET enable_email_password_login = $1, is_oidc_active = $2, mfa_mandatory = $3, allow_user_ai_config = COALESCE($4, allow_user_ai_config)
             WHERE id = 1
             RETURNING *`,
            // Use 'is_mfa_mandatory' from the incoming settings from the frontend
            [
                settings.enable_email_password_login, 
                settings.is_oidc_active, 
                settings.is_mfa_mandatory,
                settings.allow_user_ai_config
            ]
        );
        const savedSettings = result.rows[0];
        if (savedSettings) {
            // Also map the returned object for consistency in the response
            savedSettings.is_mfa_mandatory = savedSettings.mfa_mandatory;
            
            // Apply environment variable override if set
            if (process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG !== undefined) {
                const envValue = process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG === 'true' || 
                                 process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG === '1';
                savedSettings.allow_user_ai_config = envValue;
            }
        }
        return savedSettings;
    } finally {
        client.release();
    }
}

async function isUserAiConfigAllowed() {
    // Environment variable is source of truth if set
    if (process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG !== undefined) {
        const envValue = process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG === 'true' || 
                         process.env.SPARKY_FITNESS_ALLOW_USER_AI_CONFIG === '1';
        log('info', `[GLOBAL SETTINGS REPO] User AI config allowed (from env): ${envValue}`);
        return envValue;
    }
    
    // Otherwise check database
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
