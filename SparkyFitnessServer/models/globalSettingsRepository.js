const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getGlobalSettings() {
    const client = await getSystemClient(); // System-level operation
    try {
        const result = await client.query('SELECT * FROM global_settings WHERE id = 1');
        return result.rows[0];
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
            [settings.enable_email_password_login, settings.is_oidc_active, settings.mfa_mandatory]
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