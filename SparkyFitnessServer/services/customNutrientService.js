const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');
const { v4: uuidv4 } = require('uuid');

class CustomNutrientService {
    /**
     * Creates a new custom nutrient for a user.
     * @param {string} userId - The ID of the user creating the custom nutrient.
     * @param {object} nutrientData - The data for the custom nutrient (name, default_unit, data_type).
     * @returns {object} The newly created custom nutrient.
     */
        static async createCustomNutrient(userId, { name, unit }) {
            const client = await getClient(userId);
            try {
                const id = uuidv4();
                const result = await client.query(
                    `INSERT INTO user_custom_nutrients (id, user_id, name, unit)
                     VALUES ($1, $2, $3, $4)
                     RETURNING *`,
                    [id, userId, name, unit]
                );
                log('info', `Custom nutrient created: ${name} for user ${userId}`);
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    /**
     * Retrieves all custom nutrients for a given user.
     * @param {string} userId - The ID of the user.
     * @returns {Array<object>} An array of custom nutrient objects.
     */
        static async getCustomNutrients(userId) {
            const client = await getClient(userId);
            try {
                const result = await client.query(
                    `SELECT * FROM user_custom_nutrients
                     WHERE user_id = $1`,
                    [userId]
                );
                log('info', `CustomNutrientService.getCustomNutrients: Fetched ${result.rows.length} custom nutrients for user ${userId}. Data: ${JSON.stringify(result.rows)}`);
                return result.rows;
            } finally {
                client.release();
            }
        }

    /**
     * Retrieves a specific custom nutrient by its ID for a given user.
     * @param {string} userId - The ID of the user.
     * @param {string} id - The ID of the custom nutrient.
     * @returns {object|null} The custom nutrient object if found, otherwise null.
     */
    static async getCustomNutrientById(userId, id) {
        const client = await getClient(userId);
        try {
            const result = await client.query(
                `SELECT * FROM user_custom_nutrients
                 WHERE id = $1 AND user_id = $2`,
                [id, userId]
            );
            return result.rows[0] || null;
        } finally {
            client.release();
        }
    }

    /**
     * Updates an existing custom nutrient.
     * @param {string} userId - The ID of the user who owns the custom nutrient.
     * @param {string} id - The ID of the custom nutrient to update.
     * @param {object} updateData - The data to update (name, default_unit, data_type).
     * @returns {object|null} The updated custom nutrient object if found, otherwise null.
     */
        static async updateCustomNutrient(userId, id, { name, unit }) {
            const client = await getClient(userId);
            try {
                const result = await client.query(
                    `UPDATE user_custom_nutrients
                     SET name = COALESCE($1, name),
                         unit = COALESCE($2, unit),
                         updated_at = NOW()
                     WHERE id = $3 AND user_id = $4
                     RETURNING *`,
                    [name, unit, id, userId]
                );
                if (result.rows.length > 0) {
                log('info', `Custom nutrient updated: ${id} for user ${userId}`);
                return result.rows[0];
            }
            return null;
        } finally {
            client.release();
        }
    }

    /**
     * Deletes a custom nutrient.
     * @param {string} userId - The ID of the user who owns the custom nutrient.
     * @param {string} id - The ID of the custom nutrient to delete.
     * @returns {boolean} True if the custom nutrient was deleted, false otherwise.
     */
    static async deleteCustomNutrient(userId, id) {
        const client = await getClient(userId);
        try {
            const result = await client.query(
                `DELETE FROM user_custom_nutrients
                 WHERE id = $1 AND user_id = $2
                 RETURNING id`,
                [id, userId]
            );
            if (result.rows.length > 0) {
                log('info', `Custom nutrient deleted: ${id} for user ${userId}`);
                return true;
            }
            return false;
        } finally {
            client.release();
        }
    }
}

module.exports = CustomNutrientService;
