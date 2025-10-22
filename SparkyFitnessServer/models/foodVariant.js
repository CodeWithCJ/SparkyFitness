const { getClient } = require("../db/poolManager");
const foodDb = require("./food"); // Import foodDb to get food owner
const { log } = require("../config/logging");
const format = require("pg-format");
const { sanitizeGlycemicIndex } = require("./food");

async function createFoodVariant(variantData, userId) {
  const foodOwnerId = await foodDb.getFoodOwnerId(variantData.food_id, userId);
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, glycemic_index, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, now(), now()) RETURNING id`,
      [
        variantData.food_id,
        variantData.serving_size,
        variantData.serving_unit,
        variantData.calories,
        variantData.protein,
        variantData.carbs,
        variantData.fat,
        variantData.saturated_fat,
        variantData.polyunsaturated_fat,
        variantData.monounsaturated_fat,
        variantData.trans_fat,
        variantData.cholesterol,
        variantData.sodium,
        variantData.potassium,
        variantData.dietary_fiber,
        variantData.sugars,
        variantData.vitamin_a,
        variantData.vitamin_c,
        variantData.calcium,
        variantData.iron,
        variantData.is_default || false,
        sanitizeGlycemicIndex(variantData.glycemic_index),
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodVariantById(id, userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      "SELECT *, glycemic_index FROM food_variants WHERE id = $1",
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function getFoodVariantOwnerId(variantId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT f.user_id
       FROM food_variants fv
       JOIN foods f ON fv.food_id = f.id
       WHERE fv.id = $1`,
      [variantId]
    );
    const ownerId = result.rows[0]?.user_id;
    log(
      "info",
      `getFoodVariantOwnerId: Variant ID ${variantId} owner: ${ownerId}`
    );
    return ownerId;
  } finally {
    client.release();
  }
}

async function getFoodVariantsByFoodId(foodId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      "SELECT * FROM food_variants WHERE food_id = $1",
      [foodId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateFoodVariant(id, variantData, userId) {
  // For update operations, we need the user_id of the food owner to ensure RLS is applied correctly.
  const foodOwnerId = await foodDb.getFoodOwnerId(variantData.food_id, userId);
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE food_variants SET
        food_id = COALESCE($1, food_id),
        serving_size = COALESCE($2, serving_size),
        serving_unit = COALESCE($3, serving_unit),
        calories = COALESCE($4, calories),
        protein = COALESCE($5, protein),
        carbs = COALESCE($6, carbs),
        fat = COALESCE($7, fat),
        saturated_fat = COALESCE($8, saturated_fat),
        polyunsaturated_fat = COALESCE($9, polyunsaturated_fat),
        monounsaturated_fat = COALESCE($10, monounsaturated_fat),
        trans_fat = COALESCE($11, trans_fat),
        cholesterol = COALESCE($12, cholesterol),
        sodium = COALESCE($13, sodium),
        potassium = COALESCE($14, potassium),
        dietary_fiber = COALESCE($15, dietary_fiber),
        sugars = COALESCE($16, sugars),
        vitamin_a = COALESCE($17, vitamin_a),
        vitamin_c = COALESCE($18, vitamin_c),
        calcium = COALESCE($19, calcium),
        iron = COALESCE($20, iron),
        is_default = COALESCE($21, is_default),
        glycemic_index = COALESCE($22, glycemic_index),
        updated_at = now()
      WHERE id = $23
      RETURNING *`,
      [
        variantData.food_id,
        variantData.serving_size,
        variantData.serving_unit,
        variantData.calories,
        variantData.protein,
        variantData.carbs,
        variantData.fat,
        variantData.saturated_fat,
        variantData.polyunsaturated_fat,
        variantData.monounsaturated_fat,
        variantData.trans_fat,
        variantData.cholesterol,
        variantData.sodium,
        variantData.potassium,
        variantData.dietary_fiber,
        variantData.sugars,
        variantData.vitamin_a,
        variantData.vitamin_c,
        variantData.calcium,
        variantData.iron,
        variantData.is_default,
        sanitizeGlycemicIndex(variantData.glycemic_index),
        id,
      ]
    );

    // If this variant is being set as default, ensure all other variants for this food_id are not default
    if (variantData.is_default) {
      await client.query(
        `UPDATE food_variants SET is_default = FALSE WHERE food_id = $1 AND id != $2`,
        [variantData.food_id, id]
      );
    }

    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteFoodVariant(id, userId) {
  // For delete operations, we need the user_id of the food owner to ensure RLS is applied correctly.
  const foodOwnerId = await foodDb.getFoodOwnerId(id, userId); // Assuming 'id' here is the variant ID
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      "DELETE FROM food_variants WHERE id = $1 RETURNING id",
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function bulkCreateFoodVariants(variantsData, userId) {
  // For bulk create, we need the user_id of the food owner. Assuming all variants belong to the same food.
  const foodOwnerId = variantsData.length > 0 ? await foodDb.getFoodOwnerId(variantsData[0].food_id, userId) : null;
  const client = await getClient(userId); // User-specific operation
  try {
    const query = `
      INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, glycemic_index, created_at, updated_at
      ) VALUES %L RETURNING id`;

    const values = variantsData.map((variant) => [
      variant.food_id,
      variant.serving_size,
      variant.serving_unit,
      variant.calories,
      variant.protein,
      variant.carbs,
      variant.fat,
      variant.saturated_fat,
      variant.polyunsaturated_fat,
      variant.monounsaturated_fat,
      variant.trans_fat,
      variant.cholesterol,
      variant.sodium,
      variant.potassium,
      variant.dietary_fiber,
      variant.sugars,
      variant.vitamin_a,
      variant.vitamin_c,
      variant.calcium,
      variant.iron,
      variant.is_default || false,
      sanitizeGlycemicIndex(variant.glycemic_index),
      "now()",
      "now()",
    ]);

    const formattedQuery = format(query, values);
    const result = await client.query(formattedQuery);
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  createFoodVariant,
  getFoodVariantById,
  getFoodVariantOwnerId,
  getFoodVariantsByFoodId,
  updateFoodVariant,
  deleteFoodVariant,
  bulkCreateFoodVariants,
};