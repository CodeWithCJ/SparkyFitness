const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");
const format = require("pg-format");

async function createFoodEntry(entryData, createdByUserId) {
  log("info", `createFoodEntry in foodEntry.js: entryData: ${JSON.stringify(entryData)}, createdByUserId: ${createdByUserId}`);
  const client = await getClient(createdByUserId); // User-specific operation
  try {
    await client.query("BEGIN");

    let snapshot;
    // For individual food entries (food_id present), fetch snapshot from food/variant
    // For entries that are components of a logged meal (food_entry_meal_id present),
    // snapshot data should be directly provided in entryData.
    if (entryData.food_id) { // This is an individual food entry
      const foodSnapshotQuery = await client.query(
        `SELECT f.name, f.brand, fv.*
         FROM foods f
         JOIN food_variants fv ON f.id = fv.food_id
         WHERE f.id = $1 AND fv.id = $2`,
        [entryData.food_id, entryData.variant_id]
      );

      if (foodSnapshotQuery.rows.length === 0) {
        throw new Error("Food or variant not found for snapshotting.");
      }
      snapshot = foodSnapshotQuery.rows[0];
    } else { // This means it's an entry where snapshot data is already prepared (e.g., from migration or meal components)
      // We expect snapshot data to be present in entryData
      snapshot = {
        name: entryData.food_name,
        brand: entryData.brand_name,
        serving_size: entryData.serving_size,
        serving_unit: entryData.serving_unit,
        calories: entryData.calories,
        protein: entryData.protein,
        carbs: entryData.carbs,
        fat: entryData.fat,
        saturated_fat: entryData.saturated_fat,
        polyunsaturated_fat: entryData.polyunsaturated_fat,
        monounsaturated_fat: entryData.monounsaturated_fat,
        trans_fat: entryData.trans_fat,
        cholesterol: entryData.cholesterol,
        sodium: entryData.sodium,
        potassium: entryData.potassium,
        dietary_fiber: entryData.dietary_fiber,
        sugars: entryData.sugars,
        vitamin_a: entryData.vitamin_a,
        vitamin_c: entryData.vitamin_c,
        calcium: entryData.calcium,
        iron: entryData.iron,
        glycemic_index: entryData.glycemic_index,
      };
    }

    // Insert the food entry with the snapshot data
    const result = await client.query(
      `INSERT INTO food_entries (
         user_id, food_id, meal_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id,
         food_entry_meal_id, -- New column
         created_by_user_id, food_name, brand_name, serving_size, serving_unit, calories, protein, carbs, fat,
         saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, sodium,
         potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, glycemic_index, updated_by_user_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
         $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34
       ) RETURNING *`,
      [
        entryData.user_id,
        entryData.food_id,
        entryData.meal_id, // This should eventually be NULL or removed if not needed.
        entryData.meal_type,
        entryData.quantity,
        entryData.unit,
        entryData.entry_date,
        entryData.variant_id,
        entryData.meal_plan_template_id,
        entryData.food_entry_meal_id, // New column value
        createdByUserId, // created_by_user_id
        snapshot.name, // food_name
        snapshot.brand, // brand_name
        snapshot.serving_size,
        snapshot.serving_unit,
        snapshot.calories,
        snapshot.protein,
        snapshot.carbs,
        snapshot.fat,
        snapshot.saturated_fat,
        snapshot.polyunsaturated_fat,
        snapshot.monounsaturated_fat,
        snapshot.trans_fat,
        snapshot.cholesterol,
        snapshot.sodium,
        snapshot.potassium,
        snapshot.dietary_fiber,
        snapshot.sugars,
        snapshot.vitamin_a,
        snapshot.vitamin_c,
        snapshot.calcium,
        snapshot.iron,
        snapshot.glycemic_index,
        createdByUserId, // updated_by_user_id
      ]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    log("error", "Error creating food entry with snapshot:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function getFoodEntryById(entryId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_id, fe.meal_type, fe.quantity, fe.unit, fe.variant_id, fe.entry_date, fe.meal_plan_template_id,
        fe.food_entry_meal_id, fe.food_name, fe.brand_name, fe.serving_size, fe.serving_unit, fe.calories, fe.protein, fe.carbs, fe.fat,
        fe.saturated_fat, fe.polyunsaturated_fat, fe.monounsaturated_fat, fe.trans_fat, fe.cholesterol, fe.sodium,
        fe.potassium, fe.dietary_fiber, fe.sugars, fe.vitamin_a, fe.vitamin_c, fe.calcium, fe.iron, fe.glycemic_index,
        fe.user_id
       FROM food_entries fe
       WHERE fe.id = $1`,
      [entryId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodEntryOwnerId(entryId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      "SELECT user_id FROM food_entries WHERE id = $1",
      [entryId]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function deleteFoodEntry(entryId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      "DELETE FROM food_entries WHERE id = $1 RETURNING id",
      [entryId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function updateFoodEntry(entryId, userId, actingUserId, entryData, snapshotData) {
  const client = await getClient(actingUserId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE food_entries SET
        quantity = COALESCE($1, quantity),
        unit = COALESCE($2, unit),
        entry_date = COALESCE($3, entry_date),
        variant_id = COALESCE($4, variant_id),
        food_entry_meal_id = COALESCE($5, food_entry_meal_id), -- New column
        updated_by_user_id = $6,
        food_name = $7,
        brand_name = $8,
        serving_size = $9,
        serving_unit = $10,
        calories = $11,
        protein = $12,
        carbs = $13,
        fat = $14,
        saturated_fat = $15,
        polyunsaturated_fat = $16,
        monounsaturated_fat = $17,
        trans_fat = $18,
        cholesterol = $19,
        sodium = $20,
        potassium = $21,
        dietary_fiber = $22,
        sugars = $23,
        vitamin_a = $24,
        vitamin_c = $25,
        calcium = $26,
        iron = $27,
        glycemic_index = $28
      WHERE id = $29
      RETURNING *`,
      [
        entryData.quantity,
        entryData.unit,
        entryData.entry_date,
        entryData.variant_id,
        entryData.food_entry_meal_id, // New column value
        actingUserId,
        snapshotData.food_name,
        snapshotData.brand_name,
        snapshotData.serving_size,
        snapshotData.serving_unit,
        snapshotData.calories,
        snapshotData.protein,
        snapshotData.carbs,
        snapshotData.fat,
        snapshotData.saturated_fat,
        snapshotData.polyunsaturated_fat,
        snapshotData.monounsaturated_fat,
        snapshotData.trans_fat,
        snapshotData.cholesterol,
        snapshotData.sodium,
        snapshotData.potassium,
        snapshotData.dietary_fiber,
        snapshotData.sugars,
        snapshotData.vitamin_a,
        snapshotData.vitamin_c,
        snapshotData.calcium,
        snapshotData.iron,
        snapshotData.glycemic_index,
        entryId,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodEntriesByDate(userId, selectedDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_id, fe.meal_type, 
        (CASE WHEN fe.food_entry_meal_id IS NOT NULL THEN fe.quantity * COALESCE(fem.quantity, 1) ELSE fe.quantity END) as quantity,
        fe.unit, fe.variant_id, fe.entry_date, fe.meal_plan_template_id,
        fe.food_entry_meal_id, -- New column
        fe.food_name, fe.brand_name, fe.serving_size, fe.serving_unit, fe.calories, fe.protein, fe.carbs, fe.fat,
        fe.saturated_fat, fe.polyunsaturated_fat, fe.monounsaturated_fat, fe.trans_fat, fe.cholesterol, fe.sodium,
        fe.potassium, fe.dietary_fiber, fe.sugars, fe.vitamin_a, fe.vitamin_c, fe.calcium, fe.iron, fe.glycemic_index
       FROM food_entries fe
       LEFT JOIN food_entry_meals fem ON fe.food_entry_meal_id = fem.id
       WHERE fe.user_id = $1 AND fe.entry_date = $2
       ORDER BY fe.created_at`,
      [userId, selectedDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodEntriesByDateAndMealType(userId, date, mealType) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_id, fe.meal_type,
        (CASE WHEN fe.food_entry_meal_id IS NOT NULL THEN fe.quantity * COALESCE(fem.quantity, 1) ELSE fe.quantity END) as quantity,
        fe.unit, fe.variant_id, fe.entry_date, fe.meal_plan_template_id,
        fe.food_entry_meal_id, -- New column
        fe.food_name, fe.brand_name, fe.serving_size, fe.serving_unit, fe.calories, fe.protein, fe.carbs, fe.fat,
        fe.saturated_fat, fe.polyunsaturated_fat, fe.monounsaturated_fat, fe.trans_fat, fe.cholesterol, fe.sodium,
        fe.potassium, fe.dietary_fiber, fe.sugars, fe.vitamin_a, fe.vitamin_c, fe.calcium, fe.iron, fe.glycemic_index
       FROM food_entries fe
       LEFT JOIN food_entry_meals fem ON fe.food_entry_meal_id = fem.id
       WHERE fe.user_id = $1 AND fe.entry_date = $2 AND fe.meal_type = $3`,
      [userId, date, mealType]
    );
    log("debug", `getFoodEntriesByDateAndMealType: Fetched entries for user ${userId}, date ${date}, mealType ${mealType}: ${JSON.stringify(result.rows)}`);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodEntriesByDateRange(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_id, fe.meal_type,
        (CASE WHEN fe.food_entry_meal_id IS NOT NULL THEN fe.quantity * COALESCE(fem.quantity, 1) ELSE fe.quantity END) as quantity,
        fe.unit, fe.variant_id, fe.entry_date, fe.meal_plan_template_id,
        fe.food_entry_meal_id, -- New column
        fe.food_name, fe.brand_name, fe.serving_size, fe.serving_unit, fe.calories, fe.protein, fe.carbs, fe.fat,
        fe.saturated_fat, fe.polyunsaturated_fat, fe.monounsaturated_fat, fe.trans_fat,
        fe.cholesterol, fe.sodium, fe.potassium, fe.dietary_fiber, fe.sugars,
        fe.vitamin_a, fe.vitamin_c, fe.calcium, fe.iron, fe.glycemic_index
       FROM food_entries fe
       LEFT JOIN food_entry_meals fem ON fe.food_entry_meal_id = fem.id
       WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
       ORDER BY fe.entry_date`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodEntryByDetails(
  userId,
  foodId,
  mealType,
  entryDate,
  variantId
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT id FROM food_entries
       WHERE user_id = $1
         AND food_id = $2
         AND meal_type = $3
         AND entry_date = $4
         AND variant_id = $5`,
      [userId, foodId, mealType, entryDate, variantId]
    );
    return result.rows[0]; // Returns the entry if found, otherwise undefined
  } finally {
    client.release();
  }
}

async function bulkCreateFoodEntries(entriesData, authenticatedUserId) {
  log("info", `bulkCreateFoodEntries in foodEntry.js: entriesData: ${JSON.stringify(entriesData)}, authenticatedUserId: ${authenticatedUserId}`);
  // For bulk create, assuming all entries belong to the same user,
  // and the first entry's user_id can be used for RLS context.
  const client = await getClient(authenticatedUserId); // User-specific operation
  try {
    const query = `
      INSERT INTO food_entries (
        user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id,
        food_entry_meal_id, -- New column
        created_by_user_id, updated_by_user_id,
        food_name, brand_name, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, sodium,
        potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, glycemic_index
      )
      VALUES %L RETURNING *`;

    const values = entriesData.map((entry) => [
      entry.user_id,
      entry.food_id,
      entry.meal_type,
      entry.quantity,
      entry.unit,
      entry.entry_date,
      entry.variant_id,
      entry.meal_plan_template_id || null, // meal_plan_template_id can be null
      entry.food_entry_meal_id || null, // New column value
      entry.created_by_user_id, // created_by_user_id
      entry.created_by_user_id, // updated_by_user_id
      // Snapshot data
      entry.food_name,
      entry.brand_name,
      entry.serving_size,
      entry.serving_unit,
      entry.calories,
      entry.protein,
      entry.carbs,
      entry.fat,
      entry.saturated_fat,
      entry.polyunsaturated_fat,
      entry.monounsaturated_fat,
      entry.trans_fat,
      entry.cholesterol,
      entry.sodium,
      entry.potassium,
      entry.dietary_fiber,
      entry.sugars,
      entry.vitamin_a,
      entry.vitamin_c,
      entry.calcium,
      entry.iron,
      entry.glycemic_index,
    ]);

    const formattedQuery = format(query, values);
    const result = await client.query(formattedQuery);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodEntryComponentsByFoodEntryMealId(foodEntryMealId, userId) {
  log("info", `getFoodEntryComponentsByFoodEntryMealId in foodEntry.js: foodEntryMealId: ${foodEntryMealId}, userId: ${userId}`);
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_type, fe.quantity, fe.unit, fe.variant_id, fe.entry_date,
        fe.food_entry_meal_id, fe.food_name, fe.brand_name, fe.serving_size, fe.serving_unit, fe.calories, fe.protein, fe.carbs, fe.fat,
        fe.saturated_fat, fe.polyunsaturated_fat, fe.monounsaturated_fat, fe.trans_fat, fe.cholesterol, fe.sodium,
        fe.potassium, fe.dietary_fiber, fe.sugars, fe.vitamin_a, fe.vitamin_c, fe.calcium, fe.iron, fe.glycemic_index
       FROM food_entries fe
       WHERE fe.food_entry_meal_id = $1`,
      [foodEntryMealId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteFoodEntryComponentsByFoodEntryMealId(foodEntryMealId, userId) {
  log("info", `deleteFoodEntryComponentsByFoodEntryMealId in foodEntry.js: foodEntryMealId: ${foodEntryMealId}, userId: ${userId}`);
  const client = await getClient(userId);
  try {
    const result = await client.query(
      "DELETE FROM food_entries WHERE food_entry_meal_id = $1 RETURNING id",
      [foodEntryMealId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

module.exports = {
  createFoodEntry,
  getFoodEntryOwnerId,
  updateFoodEntry,
  deleteFoodEntry,
  getFoodEntriesByDate,
  getFoodEntriesByDateAndMealType,
  getFoodEntriesByDateRange,
  getFoodEntryByDetails,
  bulkCreateFoodEntries,
  getFoodEntryById,
  getFoodEntryComponentsByFoodEntryMealId,
  deleteFoodEntryComponentsByFoodEntryMealId,
};