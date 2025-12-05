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
        }
        return settings;
    } finally {
        client.release();
    }
}

async function saveGlobalSettings(settings) {
    const client = await getSystemClient(); // System-level operation
    try {
        const result = await client.query(
            `UPDATE global_settings
             SET enable_email_password_login = $1, is_oidc_active = $2, mfa_mandatory = $3
             WHERE id = 1
             RETURNING *`,
            // Use 'is_mfa_mandatory' from the incoming settings from the frontend
            [settings.enable_email_password_login, settings.is_oidc_active, settings.is_mfa_mandatory]
        );
        const savedSettings = result.rows[0];
        if (savedSettings) {
            // Also map the returned object for consistency in the response
            savedSettings.is_mfa_mandatory = savedSettings.mfa_mandatory;
        }
        return savedSettings;
    } finally {
        client.release();
    }
}

module.exports = {
    getGlobalSettings,
    saveGlobalSettings,
    getMfaMandatorySetting,
    setMfaMandatorySetting,
};

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
