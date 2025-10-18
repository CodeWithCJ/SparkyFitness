const { getPool } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getGlobalSettings() {
    const client = await getPool().connect();
    try {
        const result = await client.query('SELECT * FROM global_settings WHERE id = 1');
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function saveGlobalSettings(settings) {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            `UPDATE global_settings 
             SET enable_email_password_login = $1, is_oidc_active = $2
             WHERE id = 1
             RETURNING *`,
            [settings.enable_email_password_login, settings.is_oidc_active]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

module.exports = {
    getGlobalSettings,
    saveGlobalSettings,
};