const { getPool } = require('../db/poolManager');

async function getNutritionData(userId, startDate, endDate) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
         TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS date,
         SUM(fv.calories * fe.quantity / fv.serving_size) AS calories,
         SUM(fv.protein * fe.quantity / fv.serving_size) AS protein,
         SUM(fv.carbs * fe.quantity / fv.serving_size) AS carbs,
         SUM(fv.fat * fe.quantity / fv.serving_size) AS fat,
         SUM(COALESCE(fv.saturated_fat, 0) * fe.quantity / fv.serving_size) AS saturated_fat,
         SUM(COALESCE(fv.polyunsaturated_fat, 0) * fe.quantity / fv.serving_size) AS polyunsaturated_fat,
         SUM(COALESCE(fv.monounsaturated_fat, 0) * fe.quantity / fv.serving_size) AS monounsaturated_fat,
         SUM(COALESCE(fv.trans_fat, 0) * fe.quantity / fv.serving_size) AS trans_fat,
         SUM(COALESCE(fv.cholesterol, 0) * fe.quantity / fv.serving_size) AS cholesterol,
         SUM(COALESCE(fv.sodium, 0) * fe.quantity / fv.serving_size) AS sodium,
         SUM(COALESCE(fv.potassium, 0) * fe.quantity / fv.serving_size) AS potassium,
         SUM(COALESCE(fv.dietary_fiber, 0) * fe.quantity / fv.serving_size) AS dietary_fiber,
         SUM(COALESCE(fv.sugars, 0) * fe.quantity / fv.serving_size) AS sugars,
         SUM(COALESCE(fv.vitamin_a, 0) * fe.quantity / fv.serving_size) AS vitamin_a,
         SUM(COALESCE(fv.vitamin_c, 0) * fe.quantity / fv.serving_size) AS vitamin_c,
         SUM(COALESCE(fv.calcium, 0) * fe.quantity / fv.serving_size) AS calcium,
         SUM(COALESCE(fv.iron, 0) * fe.quantity / fv.serving_size) AS iron
       FROM food_entries fe
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
       GROUP BY fe.entry_date
       ORDER BY fe.entry_date`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getTabularFoodData(userId, startDate, endDate) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS entry_date, fe.meal_type, fe.quantity, fe.unit, fe.food_id, fe.variant_id, fe.user_id, f.name AS food_name, f.brand,
              fv.calories, fv.protein, fv.carbs, fv.fat,
              fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat,
              fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars, fv.glycemic_index,
              fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron, fv.serving_size, fv.serving_unit
       FROM food_entries fe
       JOIN foods f ON fe.food_id = f.id
       JOIN food_variants fv ON fe.variant_id = fv.id
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
  const client = await getPool().connect();
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
  const client = await getPool().connect();
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
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT
         TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS entry_date,
         SUM(fv.calories * fe.quantity / fv.serving_size) AS total_calories,
         SUM(fv.protein * fe.quantity / fv.serving_size) AS total_protein,
         SUM(fv.carbs * fe.quantity / fv.serving_size) AS total_carbs,
         SUM(fv.fat * fe.quantity / fv.serving_size) AS total_fat,
         SUM(COALESCE(fv.saturated_fat, 0) * fe.quantity / fv.serving_size) AS total_saturated_fat,
         SUM(COALESCE(fv.polyunsaturated_fat, 0) * fe.quantity / fv.serving_size) AS total_polyunsaturated_fat,
         SUM(COALESCE(fv.monounsaturated_fat, 0) * fe.quantity / fv.serving_size) AS total_monounsaturated_fat,
         SUM(COALESCE(fv.trans_fat, 0) * fe.quantity / fv.serving_size) AS total_trans_fat,
         SUM(COALESCE(fv.cholesterol, 0) * fe.quantity / fv.serving_size) AS total_cholesterol,
         SUM(COALESCE(fv.sodium, 0) * fe.quantity / fv.serving_size) AS total_sodium,
         SUM(COALESCE(fv.potassium, 0) * fe.quantity / fv.serving_size) AS total_potassium,
         SUM(COALESCE(fv.dietary_fiber, 0) * fe.quantity / fv.serving_size) AS total_dietary_fiber,
         SUM(COALESCE(fv.sugars, 0) * fe.quantity / fv.serving_size) AS total_sugars,
         SUM(COALESCE(fv.vitamin_a, 0) * fe.quantity / fv.serving_size) AS total_vitamin_a,
         SUM(COALESCE(fv.vitamin_c, 0) * fe.quantity / fv.serving_size) AS total_vitamin_c,
         SUM(COALESCE(fv.calcium, 0) * fe.quantity / fv.serving_size) AS total_calcium,
         SUM(COALESCE(fv.iron, 0) * fe.quantity / fv.serving_size) AS total_iron
       FROM food_entries fe
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
       GROUP BY fe.entry_date
       ORDER BY fe.entry_date`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getExerciseEntries(userId, startDate, endDate, equipment, muscle, exercise) {
  const client = await getPool().connect();
  try {
    let query = `SELECT
         ee.id,
         TO_CHAR(ee.entry_date, 'YYYY-MM-DD') AS entry_date,
         ee.duration_minutes,
         ee.calories_burned,
         ee.notes,
         e.id AS exercise_id,
         e.name AS exercise_name,
         e.category AS exercise_category,
         e.calories_per_hour AS exercise_calories_per_hour,
         e.equipment AS exercise_equipment,
         e.primary_muscles AS exercise_primary_muscles,
         e.secondary_muscles AS exercise_secondary_muscles,
         e.instructions AS exercise_instructions,
         e.images AS exercise_images,
         e.source AS exercise_source,
         e.source_id AS exercise_source_id,
         e.user_id AS exercise_user_id,
         e.is_custom AS exercise_is_custom,
         e.level AS exercise_level,
         e.force AS exercise_force,
         e.mechanic AS exercise_mechanic,
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
       JOIN exercises e ON ee.exercise_id = e.id
       WHERE ee.user_id = $1 AND ee.entry_date BETWEEN $2 AND $3`;

    const params = [userId, startDate, endDate];
    let paramIndex = 4;

    if (equipment) {
      query += ` AND e.equipment::jsonb @> '["${equipment}"]'`;
    }
    if (muscle) {
      query += ` AND e.primary_muscles::jsonb @> '["${muscle}"]'`;
    }
    if (exercise) {
      query += ` AND e.name = $${paramIndex}`;
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
  const client = await getPool().connect();
  try {
    let query = `SELECT DISTINCT id, name FROM exercises WHERE user_id = $1`;
    const params = [userId];
    let paramIndex = 2;

    if (muscle) {
      query += ` AND primary_muscles::jsonb @> '["${muscle}"]'`;
    }
    if (equipment) {
      query += ` AND equipment::jsonb @> '["${equipment}"]'`;
    }
    query += ` ORDER BY name`;

    const result = await client.query(query, params);
    return result.rows; // Return the full objects { id, name }
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