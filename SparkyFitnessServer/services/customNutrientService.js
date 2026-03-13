const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");
const { v4: uuidv4 } = require("uuid");

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
        [id, userId, name, unit],
      );
      log("info", `Custom nutrient created: ${name} for user ${userId}`);

      // Automatically add to specific views (Food Database, Goal, Reports)
      try {
        const nutrientDisplayPreferenceService = require("./nutrientDisplayPreferenceService");
        await nutrientDisplayPreferenceService.addNutrientToSpecificViews(
          userId,
          name,
        );

        // Also add to goal_presets and future user_goals with 0 value
        // This ensures they show up in the goal editing and progress tracking
        await client.query(
          `UPDATE goal_presets 
           SET custom_nutrients = jsonb_set(custom_nutrients, ARRAY[$1], '0'::jsonb) 
           WHERE user_id = $2`,
          [name, userId]
        );

        const today = new Date().toISOString().split("T")[0];
        await client.query(
          `UPDATE user_goals 
           SET custom_nutrients = jsonb_set(custom_nutrients, ARRAY[$1], '0'::jsonb) 
           WHERE user_id = $2 AND (goal_date >= $3 OR goal_date IS NULL)`,
          [name, userId, today]
        );

      } catch (autoAddError) {
        log(
          "error",
          `Failed to automatically add custom nutrient ${name} to views or goals: ${autoAddError.message}`,
        );
        // We don't want to fail the whole creation if preference/goal update fails
      }

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
        [userId],
      );
      log(
        "info",
        `CustomNutrientService.getCustomNutrients: Fetched ${result.rows.length} custom nutrients for user ${userId}. Data: ${JSON.stringify(result.rows)}`,
      );
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
        [id, userId],
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
        [name, unit, id, userId],
      );
      if (result.rows.length > 0) {
        log("info", `Custom nutrient updated: ${id} for user ${userId}`);
        return result.rows[0];
      }
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Deletes a custom nutrient and cleans up its data across the system.
   * @param {string} userId - The ID of the user who owns the custom nutrient.
   * @param {string} id - The ID of the custom nutrient to delete.
   * @param {boolean} deleteAllHistory - Whether to remove from historical entries and goals.
   * @returns {boolean} True if the custom nutrient was deleted, false otherwise.
   */
  static async deleteCustomNutrient(userId, id, deleteAllHistory = false) {
    const client = await getClient(userId);
    try {
      // 1. Get the nutrient name first so we know what to clean up from JSONB
      const nutrientRes = await client.query(
        "SELECT name FROM user_custom_nutrients WHERE id = $1 AND user_id = $2",
        [id, userId],
      );

      if (nutrientRes.rows.length === 0) {
        return false;
      }

      const nutrientName = nutrientRes.rows[0].name;
      log(
        "info",
        `Deleting custom nutrient "${nutrientName}" for user ${userId}. Delete history: ${deleteAllHistory}`,
      );

      // Start transaction for atomic cleanup
      await client.query("BEGIN");

      // 2. Remove the definition
      await client.query(
        "DELETE FROM user_custom_nutrients WHERE id = $1 AND user_id = $2",
        [id, userId],
      );

      // 3. Remove from UI Display Preferences (Always)
      const nutrientDisplayPreferenceService = require("./nutrientDisplayPreferenceService");
      await nutrientDisplayPreferenceService.removeNutrientFromAllViews(
        userId,
        nutrientName,
      );

      // 4. Remove from Goal Presets (Always)
      await client.query(
        "UPDATE goal_presets SET custom_nutrients = custom_nutrients - $1 WHERE user_id = $2",
        [nutrientName, userId],
      );

      // 5. Remove from Food Database (Always - standardizes the library)
      await client.query(
        `UPDATE food_variants SET custom_nutrients = custom_nutrients - $1 
         WHERE food_id IN (SELECT id FROM foods WHERE user_id = $2)`,
        [nutrientName, userId],
      );

      // 6. Remove from Future Goals (Always - date >= today)
      const today = new Date().toISOString().split("T")[0];
      await client.query(
        "UPDATE user_goals SET custom_nutrients = custom_nutrients - $1 WHERE user_id = $2 AND (goal_date >= $3 OR goal_date IS NULL)",
        [nutrientName, userId, today],
      );

      // 7. Optional: Remove from History (Diary Entries and Past Goals)
      if (deleteAllHistory) {
        log(
          "info",
          `Cleaning up historical data for nutrient "${nutrientName}" for user ${userId}`,
        );

        // Remove from all Diary Entries
        await client.query(
          "UPDATE food_entries SET custom_nutrients = custom_nutrients - $1 WHERE user_id = $2",
          [nutrientName, userId],
        );

        // Remove from all Past Goals
        await client.query(
          "UPDATE user_goals SET custom_nutrients = custom_nutrients - $1 WHERE user_id = $2 AND goal_date < $3",
          [nutrientName, userId, today],
        );
      }

      await client.query("COMMIT");
      log(
        "info",
        `Successfully deleted custom nutrient "${nutrientName}" and performed cascading cleanup for user ${userId}`,
      );
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      log(
        "error",
        `Failed to delete custom nutrient ${id} for user ${userId}: ${error.message}`,
      );
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = CustomNutrientService;
