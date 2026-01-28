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
    const sortOrder = data.sort_order !== undefined ? data.sort_order : 100;

    const result = await client.query(
      `INSERT INTO meal_types (name, user_id, sort_order, is_visible)
       VALUES ($1, $2, $3, TRUE)
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
      `SELECT 
         mt.id,
         mt.name,
         mt.sort_order,
         mt.user_id,
         mt.created_at,
         COALESCE(umv.is_visible, mt.is_visible) AS is_visible
       FROM meal_types mt
       LEFT JOIN user_meal_visibilities umv 
         ON mt.id = umv.meal_type_id AND umv.user_id = $1
       WHERE mt.user_id = $1 OR mt.user_id IS NULL 
       ORDER BY mt.sort_order ASC, mt.id ASC`,
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
      `SELECT 
         mt.*,
         COALESCE(umv.is_visible, mt.is_visible) AS is_visible
       FROM meal_types mt
       LEFT JOIN user_meal_visibilities umv 
         ON mt.id = umv.meal_type_id AND umv.user_id = $2
       WHERE mt.id = $1 
         AND (mt.user_id = $2 OR mt.user_id IS NULL)`,
      [mealTypeId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateMealType(mealTypeId, data, userId) {
  log(
    "info",
    `updateMealType in mealType.js: id: ${mealTypeId}, data: ${JSON.stringify(
      data
    )}`
  );
  const client = await getClient(userId);
  try {
    await client.query("BEGIN");
    console.log(data);
    console.log(data.is_visible);
    if (data.is_visible !== undefined) {
      await client.query(
        `INSERT INTO user_meal_visibilities (user_id, meal_type_id, is_visible)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, meal_type_id) 
         DO UPDATE SET is_visible = EXCLUDED.is_visible`,
        [userId, mealTypeId, data.is_visible]
      );
    }

    if (data.name !== undefined || data.sort_order !== undefined) {
      const updateResult = await client.query(
        `UPDATE meal_types 
         SET 
           name = COALESCE($1, name),
           sort_order = COALESCE($2, sort_order)
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [data.name, data.sort_order, mealTypeId, userId]
      );

      if (updateResult.rows.length === 0) {
        const check = await client.query(
          "SELECT 1 FROM meal_types WHERE id = $1 AND user_id IS NULL",
          [mealTypeId]
        );
        if (check.rows.length > 0) {
          throw new Error(
            "Cannot rename or reorder system default meal types."
          );
        }
        throw new Error("Meal type not found or access denied.");
      }
    }

    await client.query("COMMIT");

    return await getMealTypeById(mealTypeId, userId);
  } catch (error) {
    await client.query("ROLLBACK");
    log("error", "Error updating meal type:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMealType(mealTypeId, userId) {
  log("info", `deleteMealType in mealType.js: id: ${mealTypeId}`);
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM meal_types 
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [mealTypeId, userId]
    );

    if (result.rowCount === 0) {
      const checkSystem = await client.query(
        "SELECT id FROM meal_types WHERE id = $1 AND user_id IS NULL",
        [mealTypeId]
      );
      if (checkSystem.rows.length > 0) {
        throw new Error("Cannot delete system default meal types.");
      }
      return false;
    }

    return true;
  } catch (error) {
    if (error.code === "23503") {
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
