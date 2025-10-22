const { getClient } = require('../db/poolManager');
const format = require('pg-format');

const TABLE_NAME = 'user_nutrient_display_preferences';

async function getNutrientDisplayPreferences(userId) {
    const query = `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1`;
    const client = await getClient(userId);
    try {
        const { rows } = await client.query(query, [userId]);
        return rows;
    } finally {
        client.release();
    }
}

async function upsertNutrientDisplayPreference(userId, viewGroup, platform, visibleNutrients) {
    const query = `
        INSERT INTO ${TABLE_NAME} (user_id, view_group, platform, visible_nutrients)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, view_group, platform)
        DO UPDATE SET visible_nutrients = EXCLUDED.visible_nutrients, updated_at = NOW()
        RETURNING *;
    `;
    const client = await getClient(userId);
    try {
        const { rows } = await client.query(query, [userId, viewGroup, platform, JSON.stringify(visibleNutrients)]);
        return rows[0];
    } finally {
        client.release();
    }
}

async function deleteNutrientDisplayPreference(userId, viewGroup, platform) {
    const query = `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 AND view_group = $2 AND platform = $3`;
    const client = await getClient(userId);
    try {
        await client.query(query, [userId, viewGroup, platform]);
    } finally {
        client.release();
    }
}

async function createDefaultNutrientPreferences(userId, defaultPreferences) {
    const values = defaultPreferences.map(pref => [
        userId,
        pref.view_group,
        pref.platform,
        JSON.stringify(pref.visible_nutrients)
    ]);

    const query = format(
        'INSERT INTO %I (user_id, view_group, platform, visible_nutrients) VALUES %L RETURNING *',
        TABLE_NAME,
        values
    );

    const client = await getClient(userId); // Assuming userId is available in context for this function
    try {
        const { rows } = await client.query(query);
        return rows;
    } finally {
        client.release();
    }
}

module.exports = {
    getNutrientDisplayPreferences,
    upsertNutrientDisplayPreference,
    deleteNutrientDisplayPreference,
    createDefaultNutrientPreferences
};