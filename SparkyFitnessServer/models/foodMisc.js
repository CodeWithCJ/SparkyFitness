const { getClient, getSystemClient } = require("../db/poolManager");

async function getFoodDataProviderById(providerId) {
  const client = await getSystemClient(); // System-level operation
  try {
    const result = await client.query(
      "SELECT * FROM external_data_providers WHERE id = $1",
      [providerId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getRecentFoods(userId, limit, mealType) {
  const client = await getClient(userId); // User-specific operation

  const whereClauses = ["fe.user_id = $1"];
  const queryParams = [userId, limit];

  if (!!mealType) {
    whereClauses.push("fe.meal_type = $3");
    queryParams.push(mealType);
  }

  try {
    const result = await client.query(
      `SELECT DISTINCT ON (fe.food_id)
        f.id,
        f.name,
        f.brand,
        f.is_custom,
        f.user_id,
        f.shared_with_public,
        json_build_object(
          'id', fv.id,
          'serving_size', fv.serving_size,
          'serving_unit', fv.serving_unit,
          'calories', fv.calories,
          'protein', fv.protein,
          'carbs', fv.carbs,
          'fat', fv.fat,
          'saturated_fat', fv.saturated_fat,
          'polyunsaturated_fat', fv.polyunsaturated_fat,
          'monounsaturated_fat', fv.monounsaturated_fat,
          'trans_fat', fv.trans_fat,
          'cholesterol', fv.cholesterol,
          'sodium', fv.sodium,
          'potassium', fv.potassium,
          'dietary_fiber', fv.dietary_fiber,
          'sugars', fv.sugars,
          'vitamin_a', fv.vitamin_a,
          'vitamin_c', fv.vitamin_c,
          'calcium', fv.calcium,
          'iron', fv.iron,
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index
        ) AS default_variant
      FROM food_entries fe
      JOIN foods f ON fe.food_id = f.id
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE ${whereClauses.join(" AND ")} AND f.is_quick_food = FALSE
      ORDER BY fe.food_id, fe.created_at DESC
      LIMIT $2`,
      queryParams
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getTopFoods(userId, limit, mealType) {
  const client = await getClient(userId); // User-specific operation

  const whereClauses = ["fe.user_id = $1"];
  const queryParams = [userId, limit];

  if (!!mealType) {
    whereClauses.push("fe.meal_type = $3");
    queryParams.push(mealType);
  }

  try {
    const result = await client.query(
      `SELECT
        f.id,
        f.name,
        f.brand,
        f.is_custom,
        f.user_id,
        f.shared_with_public,
        json_build_object(
          'id', fv.id,
          'serving_size', fv.serving_size,
          'serving_unit', fv.serving_unit,
          'calories', fv.calories,
          'protein', fv.protein,
          'carbs', fv.carbs,
          'fat', fv.fat,
          'saturated_fat', fv.saturated_fat,
          'polyunsaturated_fat', fv.polyunsaturated_fat,
          'monounsaturated_fat', fv.monounsaturated_fat,
          'trans_fat', fv.trans_fat,
          'cholesterol', fv.cholesterol,
          'sodium', fv.sodium,
          'potassium', fv.potassium,
          'dietary_fiber', fv.dietary_fiber,
          'sugars', fv.sugars,
          'vitamin_a', fv.vitamin_a,
          'vitamin_c', fv.vitamin_c,
          'calcium', fv.calcium,
          'iron', fv.iron,
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index
        ) AS default_variant,
        COUNT(fe.food_id) AS usage_count
      FROM food_entries fe
      JOIN foods f ON fe.food_id = f.id
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE ${whereClauses.join(" AND ")} AND f.is_quick_food = FALSE
      GROUP BY f.id, fv.id
      ORDER BY usage_count DESC
      LIMIT $2`,
      queryParams
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getDailyNutritionSummary(userId, date) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        SUM(fe.calories * fe.quantity / fe.serving_size) AS total_calories,
        SUM(fe.protein * fe.quantity / fe.serving_size) AS total_protein,
        SUM(fe.carbs * fe.quantity / fe.serving_size) AS total_carbs,
        SUM(fe.fat * fe.quantity / fe.serving_size) AS total_fat,
        SUM(fe.dietary_fiber * fe.quantity / fe.serving_size) AS total_dietary_fiber
       FROM food_entries fe
       WHERE fe.user_id = $1 AND fe.entry_date = $2`,
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodsNeedingReview(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (fe.food_id, fe.variant_id)
          fe.food_id,
          fe.variant_id,
          fe.food_name,
          fe.brand_name,
          fe.updated_at AS entry_updated_at,
          fe.created_at AS entry_created_at,
          fe.user_id AS food_owner_id
       FROM food_entries fe
       WHERE fe.user_id = $1
         AND fe.updated_at > fe.created_at -- Food entry has been updated since it was created
         AND NOT EXISTS (
             SELECT 1 FROM user_ignored_updates uiu
             WHERE uiu.user_id = $1
               AND uiu.variant_id = fe.variant_id
               AND uiu.ignored_at_timestamp = fe.updated_at
         )
       ORDER BY fe.food_id, fe.variant_id, fe.created_at DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateFoodEntriesSnapshot(userId, foodId, variantId, newSnapshotData) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE food_entries
       SET
          food_name = $1,
          brand_name = $2,
          serving_size = $3,
          serving_unit = $4,
          calories = $5,
          protein = $6,
          carbs = $7,
          fat = $8,
          saturated_fat = $9,
          polyunsaturated_fat = $10,
          monounsaturated_fat = $11,
          trans_fat = $12,
          cholesterol = $13,
          sodium = $14,
          potassium = $15,
          dietary_fiber = $16,
          sugars = $17,
          vitamin_a = $18,
          vitamin_c = $19,
          calcium = $20,
          iron = $21,
          glycemic_index = $22,
          updated_at = now()
       WHERE user_id = $23 AND food_id = $24 AND variant_id = $25
       RETURNING id`,
      [
        newSnapshotData.food_name,
        newSnapshotData.brand_name,
        newSnapshotData.serving_size,
        newSnapshotData.serving_unit,
        newSnapshotData.calories,
        newSnapshotData.protein,
        newSnapshotData.carbs,
        newSnapshotData.fat,
        newSnapshotData.saturated_fat,
        newSnapshotData.polyunsaturated_fat,
        newSnapshotData.monounsaturated_fat,
        newSnapshotData.trans_fat,
        newSnapshotData.cholesterol,
        newSnapshotData.sodium,
        newSnapshotData.potassium,
        newSnapshotData.dietary_fiber,
        newSnapshotData.sugars,
        newSnapshotData.vitamin_a,
        newSnapshotData.vitamin_c,
        newSnapshotData.calcium,
        newSnapshotData.iron,
        newSnapshotData.glycemic_index,
        userId,
        foodId,
        variantId,
      ]
    );
    return result.rowCount;
  } finally {
    client.release();
  }
}

async function clearUserIgnoredUpdate(userId, variantId) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `DELETE FROM user_ignored_updates
       WHERE user_id = $1 AND variant_id = $2`,
      [userId, variantId]
    );
  } finally {
    client.release();
  }
}

module.exports = {
  getFoodDataProviderById,
  getRecentFoods,
  getTopFoods,
  getDailyNutritionSummary,
  getFoodsNeedingReview,
  updateFoodEntriesSnapshot,
  clearUserIgnoredUpdate,
};