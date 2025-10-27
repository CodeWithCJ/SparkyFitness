const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getNutritionData(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
         TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS date,
         SUM(fe.calories * fe.quantity / fe.serving_size) AS calories,
         SUM(fe.protein * fe.quantity / fe.serving_size) AS protein,
         SUM(fe.carbs * fe.quantity / fe.serving_size) AS carbs,
         SUM(fe.fat * fe.quantity / fe.serving_size) AS fat,
         SUM(COALESCE(fe.saturated_fat, 0) * fe.quantity / fe.serving_size) AS saturated_fat,
         SUM(COALESCE(fe.polyunsaturated_fat, 0) * fe.quantity / fe.serving_size) AS polyunsaturated_fat,
         SUM(COALESCE(fe.monounsaturated_fat, 0) * fe.quantity / fe.serving_size) AS monounsaturated_fat,
         SUM(COALESCE(fe.trans_fat, 0) * fe.quantity / fe.serving_size) AS trans_fat,
         SUM(COALESCE(fe.cholesterol, 0) * fe.quantity / fe.serving_size) AS cholesterol,
         SUM(COALESCE(fe.sodium, 0) * fe.quantity / fe.serving_size) AS sodium,
         SUM(COALESCE(fe.potassium, 0) * fe.quantity / fe.serving_size) AS potassium,
         SUM(COALESCE(fe.dietary_fiber, 0) * fe.quantity / fe.serving_size) AS dietary_fiber,
         SUM(COALESCE(fe.sugars, 0) * fe.quantity / fe.serving_size) AS sugars,
         SUM(COALESCE(fe.vitamin_a, 0) * fe.quantity / fe.serving_size) AS vitamin_a,
         SUM(COALESCE(fe.vitamin_c, 0) * fe.quantity / fe.serving_size) AS vitamin_c,
         SUM(COALESCE(fe.calcium, 0) * fe.quantity / fe.serving_size) AS calcium,
         SUM(COALESCE(fe.iron, 0) * fe.quantity / fe.serving_size) AS iron
       FROM food_entries fe
       WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
       GROUP BY fe.entry_date
       ORDER BY fe.entry_date`,
      [userId, startDate, endDate]
    );
    //log('debug', `[reportRepository] getNutritionData for user ${userId} from ${startDate} to ${endDate}:`, result.rows);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getTabularFoodData(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS entry_date, fe.meal_type, fe.quantity, fe.unit, fe.food_id, fe.variant_id, fe.user_id, fe.food_name, fe.brand_name,
               fe.calories, fe.protein, fe.carbs, fe.fat,
               fe.saturated_fat, fe.polyunsaturated_fat, fe.monounsaturated_fat, fe.trans_fat,
               fe.cholesterol, fe.sodium, fe.potassium, fe.dietary_fiber, fe.sugars, fe.glycemic_index,
               fe.vitamin_a, fe.vitamin_c, fe.calcium, fe.iron, fe.serving_size, fe.serving_unit
        FROM food_entries fe
        WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
        ORDER BY fe.entry_date, fe.meal_type`,
     [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getMeasurementData(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
       `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date, weight, neck, waist, hips, steps FROM check_in_measurements WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 ORDER BY entry_date`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getCustomMeasurementsData(userId, categoryId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
       `SELECT category_id, TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date, entry_hour AS hour, value, notes, entry_timestamp AS timestamp FROM custom_measurements WHERE user_id = $1 AND category_id = $2 AND entry_date BETWEEN $3 AND $4 ORDER BY entry_date, entry_timestamp`,
      [userId, categoryId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getMiniNutritionTrends(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
         TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS entry_date,
         SUM(fe.calories * fe.quantity / fe.serving_size) AS total_calories,
         SUM(fe.protein * fe.quantity / fe.serving_size) AS total_protein,
         SUM(fe.carbs * fe.quantity / fe.serving_size) AS total_carbs,
         SUM(fe.fat * fe.quantity / fe.serving_size) AS total_fat,
         SUM(COALESCE(fe.saturated_fat, 0) * fe.quantity / fe.serving_size) AS total_saturated_fat,
         SUM(COALESCE(fe.polyunsaturated_fat, 0) * fe.quantity / fe.serving_size) AS total_polyunsaturated_fat,
         SUM(COALESCE(fe.monounsaturated_fat, 0) * fe.quantity / fe.serving_size) AS total_monounsaturated_fat,
         SUM(COALESCE(fe.trans_fat, 0) * fe.quantity / fe.serving_size) AS total_trans_fat,
         SUM(COALESCE(fe.cholesterol, 0) * fe.quantity / fe.serving_size) AS total_cholesterol,
         SUM(COALESCE(fe.sodium, 0) * fe.quantity / fe.serving_size) AS total_sodium,
         SUM(COALESCE(fe.potassium, 0) * fe.quantity / fe.serving_size) AS total_potassium,
         SUM(COALESCE(fe.dietary_fiber, 0) * fe.quantity / fe.serving_size) AS total_dietary_fiber,
         SUM(COALESCE(fe.sugars, 0) * fe.quantity / fe.serving_size) AS total_sugars,
         SUM(COALESCE(fe.vitamin_a, 0) * fe.quantity / fe.serving_size) AS total_vitamin_a,
         SUM(COALESCE(fe.vitamin_c, 0) * fe.quantity / fe.serving_size) AS total_vitamin_c,
         SUM(COALESCE(fe.calcium, 0) * fe.quantity / fe.serving_size) AS total_calcium,
         SUM(COALESCE(fe.iron, 0) * fe.quantity / fe.serving_size) AS total_iron
       FROM food_entries fe
       WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
       GROUP BY fe.entry_date
       ORDER BY fe.entry_date`,
      [userId, startDate, endDate]
    );
    // log('debug', `[reportRepository] getMiniNutritionTrends for user ${userId} from ${startDate} to ${endDate}:`, result.rows);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getExerciseEntries(userId, startDate, endDate, equipment, muscle, exercise) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `SELECT
         ee.id,
         TO_CHAR(ee.entry_date, 'YYYY-MM-DD') AS entry_date,
         ee.duration_minutes,
         ee.calories_burned,
         ee.notes,
         ee.exercise_id,
         ee.exercise_name,
         ee.category AS exercise_category,
         ee.calories_per_hour AS exercise_calories_per_hour,
         ee.equipment AS exercise_equipment,
         ee.primary_muscles AS exercise_primary_muscles,
         ee.secondary_muscles AS exercise_secondary_muscles,
         ee.instructions AS exercise_instructions,
         ee.images AS exercise_images,
         ee.source AS exercise_source,
         ee.source_id AS exercise_source_id,
         ee.user_id AS exercise_user_id,
         ee.level AS exercise_level,
         ee.force AS exercise_force,
         ee.mechanic AS exercise_mechanic,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
         ) AS sets
       FROM exercise_entries ee
       WHERE ee.user_id = $1 AND ee.entry_date BETWEEN $2 AND $3`;

    const params = [userId, startDate, endDate];
    let paramIndex = 4;

    if (equipment) {
      query += ` AND ee.equipment ILIKE $${paramIndex}`;
      params.push(`%${equipment}%`);
      paramIndex++;
    }
    if (muscle) {
      query += ` AND ee.primary_muscles ILIKE $${paramIndex}`;
      params.push(`%${muscle}%`);
      paramIndex++;
    }
    if (exercise) {
      query += ` AND ee.exercise_name = $${paramIndex}`;
      params.push(exercise);
      paramIndex++;
    }

    query += ` ORDER BY ee.entry_date DESC, ee.created_at DESC`;

    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getExerciseNames(userId, muscle, equipment) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `SELECT DISTINCT exercise_id as id, exercise_name as name FROM exercise_entries WHERE user_id = $1`;
    const params = [userId];
    let paramIndex = 2;

    if (muscle) {
      query += ` AND primary_muscles ILIKE $${paramIndex}`;
      params.push(`%${muscle}%`);
      paramIndex++;
    }
    if (equipment) {
      query += ` AND equipment ILIKE $${paramIndex}`;
      params.push(`%${equipment}%`);
      paramIndex++;
    }
    query += ` ORDER BY name`;

    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  getNutritionData,
  getTabularFoodData,
  getMeasurementData,
  getCustomMeasurementsData,
  getMiniNutritionTrends,
  getExerciseEntries,
  getExerciseNames,
};