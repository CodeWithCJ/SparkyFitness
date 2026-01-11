const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");

/**
 * Creates a new custom meal type for a specific user.
 * @param {Object} data - { name: string, sort_order: number }
 * @param {string} userId - The UUID of the authenticated user
 */
async function createMealType(data, userId) {
  log(
    "info",
    `createMealType in mealType.js: data: ${JSON.stringify(
      data
    )}, userId: ${userId}`
  );
  const client = await getClient(userId);
  try {
    // We default sort_order to 100 if not provided, putting custom meals at the end by default
    const sortOrder = data.sort_order !== undefined ? data.sort_order : 100;

    const result = await client.query(
      `INSERT INTO meal_types (name, user_id, sort_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.name, userId, sortOrder]
    );
    return result.rows[0];
  } catch (error) {
    log("error", "Error creating meal type:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Fetches all available meal types for a user.
 * This includes System Defaults (user_id is NULL) AND User Custom types.
 * Ordered by sort_order.
 */
async function getAllMealTypes(userId) {
  log("info", `getAllMealTypes in mealType.js for userId: ${userId}`);
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM meal_types 
       WHERE user_id = $1 OR user_id IS NULL 
       ORDER BY sort_order ASC, id ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Fetches a single meal type by ID.
 * Ensures the user has access to it (it's either theirs or a system default).
 */
async function getMealTypeById(mealTypeId, userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM meal_types 
       WHERE id = $1 
         AND (user_id = $2 OR user_id IS NULL)`,
      [mealTypeId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Updates a meal type.
 * CRITICAL: This query includes "AND user_id = $4".
 * This prevents a user from renaming "Breakfast" (System default where user_id is NULL).
 * Only custom meals created by the user can be updated.
 */
async function updateMealType(mealTypeId, data, userId) {
  log(
    "info",
    `updateMealType in mealType.js: id: ${mealTypeId}, data: ${JSON.stringify(
      data
    )}`
  );
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE meal_types 
       SET 
         name = COALESCE($1, name),
         sort_order = COALESCE($2, sort_order)
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [data.name, data.sort_order, mealTypeId, userId]
    );

    if (result.rows.length === 0) {
      // Check if it exists as a system default
      const checkSystem = await client.query(
        "SELECT id FROM meal_types WHERE id = $1 AND user_id IS NULL",
        [mealTypeId]
      );
      if (checkSystem.rows.length > 0) {
        throw new Error("Cannot edit system default meal types.");
      }
      throw new Error("Meal type not found or access denied.");
    }

    return result.rows[0];
  } catch (error) {
    log("error", "Error updating meal type:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes a meal type.
 * CRITICAL: Checks "AND user_id = $2".
 * Prevents deleting system defaults.
 */
async function deleteMealType(mealTypeId, userId) {
  log("info", `deleteMealType in mealType.js: id: ${mealTypeId}`);
  const client = await getClient(userId);
  try {
    // Optional: Check if used in food_entries before deleting?
    // Usually ON DELETE RESTRICT in DB handles this, but we can check here nicely.

    const result = await client.query(
      `DELETE FROM meal_types 
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [mealTypeId, userId]
    );

    if (result.rowCount === 0) {
      // Check if it was a system default
      const checkSystem = await client.query(
        "SELECT id FROM meal_types WHERE id = $1 AND user_id IS NULL",
        [mealTypeId]
      );
      if (checkSystem.rows.length > 0) {
        throw new Error("Cannot delete system default meal types.");
      }
      return false; // Not found or not owned
    }

    return true;
  } catch (error) {
    // specialized error message if DB constraint prevents deletion
    if (error.code === "23503") {
      // foreign_key_violation
      throw new Error(
        "Cannot delete this meal type because it contains food entries."
      );
    }
    log("error", "Error deleting meal type:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createMealType,
  getAllMealTypes,
  getMealTypeById,
  updateMealType,
  deleteMealType,
};
