const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getNutritionData(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
         TO_CHAR(entry_date, 'YYYY-MM-DD') AS date,
         SUM(calories) AS calories,
         SUM(protein) AS protein,
         SUM(carbs) AS carbs,
         SUM(fat) AS fat,
         SUM(saturated_fat) AS saturated_fat,
         SUM(polyunsaturated_fat) AS polyunsaturated_fat,
         SUM(monounsaturated_fat) AS monounsaturated_fat,
         SUM(trans_fat) AS trans_fat,
         SUM(cholesterol) AS cholesterol,
         SUM(sodium) AS sodium,
         SUM(potassium) AS potassium,
         SUM(dietary_fiber) AS dietary_fiber,
         SUM(sugars) AS sugars,
         SUM(vitamin_a) AS vitamin_a,
         SUM(vitamin_c) AS vitamin_c,
         SUM(calcium) AS calcium,
         SUM(iron) AS iron
       FROM (
         SELECT
           fe.entry_date,
           (fe.calories * fe.quantity / fe.serving_size) AS calories,
           (fe.protein * fe.quantity / fe.serving_size) AS protein,
           (fe.carbs * fe.quantity / fe.serving_size) AS carbs,
           (fe.fat * fe.quantity / fe.serving_size) AS fat,
           (COALESCE(fe.saturated_fat, 0) * fe.quantity / fe.serving_size) AS saturated_fat,
           (COALESCE(fe.polyunsaturated_fat, 0) * fe.quantity / fe.serving_size) AS polyunsaturated_fat,
           (COALESCE(fe.monounsaturated_fat, 0) * fe.quantity / fe.serving_size) AS monounsaturated_fat,
           (COALESCE(fe.trans_fat, 0) * fe.quantity / fe.serving_size) AS trans_fat,
           (COALESCE(fe.cholesterol, 0) * fe.quantity / fe.serving_size) AS cholesterol,
           (COALESCE(fe.sodium, 0) * fe.quantity / fe.serving_size) AS sodium,
           (COALESCE(fe.potassium, 0) * fe.quantity / fe.serving_size) AS potassium,
           (COALESCE(fe.dietary_fiber, 0) * fe.quantity / fe.serving_size) AS dietary_fiber,
           (COALESCE(fe.sugars, 0) * fe.quantity / fe.serving_size) AS sugars,
           (COALESCE(fe.vitamin_a, 0) * fe.quantity / fe.serving_size) AS vitamin_a,
           (COALESCE(fe.vitamin_c, 0) * fe.quantity / fe.serving_size) AS vitamin_c,
           (COALESCE(fe.calcium, 0) * fe.quantity / fe.serving_size) AS calcium,
           (COALESCE(fe.iron, 0) * fe.quantity / fe.serving_size) AS iron
         FROM food_entries fe
         WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3 AND fe.food_entry_meal_id IS NULL
         UNION ALL
         SELECT
           fem.entry_date,
           SUM((fe_meal.calories * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS calories,
           SUM((fe_meal.protein * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS protein,
           SUM((fe_meal.carbs * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS carbs,
           SUM((fe_meal.fat * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS fat,
           SUM((COALESCE(fe_meal.saturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS saturated_fat,
           SUM((COALESCE(fe_meal.polyunsaturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS polyunsaturated_fat,
           SUM((COALESCE(fe_meal.monounsaturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS monounsaturated_fat,
           SUM((COALESCE(fe_meal.trans_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS trans_fat,
           SUM((COALESCE(fe_meal.cholesterol, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS cholesterol,
           SUM((COALESCE(fe_meal.sodium, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS sodium,
           SUM((COALESCE(fe_meal.potassium, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS potassium,
           SUM((COALESCE(fe_meal.dietary_fiber, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS dietary_fiber,
           SUM((COALESCE(fe_meal.sugars, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS sugars,
           SUM((COALESCE(fe_meal.vitamin_a, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS vitamin_a,
           SUM((COALESCE(fe_meal.vitamin_c, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS vitamin_c,
           SUM((COALESCE(fe_meal.calcium, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS calcium,
           SUM((COALESCE(fe_meal.iron, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS iron
         FROM food_entry_meals fem
         JOIN food_entries fe_meal ON fem.id = fe_meal.food_entry_meal_id
         WHERE fem.user_id = $1 AND fem.entry_date BETWEEN $2 AND $3
         GROUP BY fem.entry_date
       ) AS combined_nutrition
       GROUP BY entry_date
       ORDER BY entry_date`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getTabularFoodData(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `WITH CalculatedFoodEntries AS (
        SELECT
          fe.id,
          TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS entry_date,
          fe.meal_type,
          fe.quantity,
          fe.unit,
          fe.food_id,
          fe.variant_id,
          fe.user_id,
          fe.food_name,
          fe.brand_name,
          (fe.calories * fe.quantity / fe.serving_size) AS calories,
          (fe.protein * fe.quantity / fe.serving_size) AS protein,
          (fe.carbs * fe.quantity / fe.serving_size) AS carbs,
          (fe.fat * fe.quantity / fe.serving_size) AS fat,
          (COALESCE(fe.saturated_fat, 0) * fe.quantity / fe.serving_size) AS saturated_fat,
          (COALESCE(fe.polyunsaturated_fat, 0) * fe.quantity / fe.serving_size) AS polyunsaturated_fat,
          (COALESCE(fe.monounsaturated_fat, 0) * fe.quantity / fe.serving_size) AS monounsaturated_fat,
          (COALESCE(fe.trans_fat, 0) * fe.quantity / fe.serving_size) AS trans_fat,
          (COALESCE(fe.cholesterol, 0) * fe.quantity / fe.serving_size) AS cholesterol,
          (COALESCE(fe.sodium, 0) * fe.quantity / fe.serving_size) AS sodium,
          (COALESCE(fe.potassium, 0) * fe.quantity / fe.serving_size) AS potassium,
          (COALESCE(fe.dietary_fiber, 0) * fe.quantity / fe.serving_size) AS dietary_fiber,
          (COALESCE(fe.sugars, 0) * fe.quantity / fe.serving_size) AS sugars,
          fe.glycemic_index,
          (COALESCE(fe.vitamin_a, 0) * fe.quantity / fe.serving_size) AS vitamin_a,
          (COALESCE(fe.vitamin_c, 0) * fe.quantity / fe.serving_size) AS vitamin_c,
          (COALESCE(fe.calcium, 0) * fe.quantity / fe.serving_size) AS calcium,
          (COALESCE(fe.iron, 0) * fe.quantity / fe.serving_size) AS iron,
          fe.serving_size,
          fe.serving_unit,
          fe.food_entry_meal_id
        FROM food_entries fe
        WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
      )
      SELECT
        cfe.entry_date,
        cfe.meal_type,
        cfe.quantity,
        cfe.unit,
        cfe.food_id,
        cfe.variant_id,
        cfe.user_id,
        cfe.food_name,
        cfe.brand_name,
        cfe.calories,
        cfe.protein,
        cfe.carbs,
        cfe.fat,
        cfe.saturated_fat,
        cfe.polyunsaturated_fat,
        cfe.monounsaturated_fat,
        cfe.trans_fat,
        cfe.cholesterol,
        cfe.sodium,
        cfe.potassium,
        cfe.dietary_fiber,
        cfe.sugars,
        cfe.glycemic_index,
        cfe.vitamin_a,
        cfe.vitamin_c,
        cfe.calcium,
        cfe.iron,
        cfe.serving_size,
        cfe.serving_unit,
        cfe.food_entry_meal_id
      FROM CalculatedFoodEntries cfe
      WHERE cfe.food_entry_meal_id IS NULL -- Standalone food entries
      UNION ALL
      SELECT
        TO_CHAR(fem.entry_date, 'YYYY-MM-DD') AS entry_date,
        fem.meal_type,
        fem.quantity AS quantity, -- Use meal quantity
        'meal' AS unit, -- Indicate it's a meal
        NULL AS food_id,
        NULL AS variant_id,
        fem.user_id,
        fem.name AS food_name, -- Meal name as food_name
        fem.description AS brand_name, -- Meal description as brand_name
        SUM(cfe_meal.calories * fem.quantity) AS calories,
        SUM(cfe_meal.protein * fem.quantity) AS protein,
        SUM(cfe_meal.carbs * fem.quantity) AS carbs,
        SUM(cfe_meal.fat * fem.quantity) AS fat,
        SUM(cfe_meal.saturated_fat * fem.quantity) AS saturated_fat,
        SUM(cfe_meal.polyunsaturated_fat * fem.quantity) AS polyunsaturated_fat,
        SUM(cfe_meal.monounsaturated_fat * fem.quantity) AS monounsaturated_fat,
        SUM(cfe_meal.trans_fat * fem.quantity) AS trans_fat,
        SUM(cfe_meal.cholesterol * fem.quantity) AS cholesterol,
        SUM(cfe_meal.sodium * fem.quantity) AS sodium,
        SUM(cfe_meal.potassium * fem.quantity) AS potassium,
        SUM(cfe_meal.dietary_fiber * fem.quantity) AS dietary_fiber,
        SUM(cfe_meal.sugars * fem.quantity) AS sugars,
        (CASE
            WHEN SUM(cfe_meal.carbs) = 0 THEN 'None'
            ELSE
                (CASE
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 20 THEN 'Very Low'
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 40 THEN 'Low'
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 60 THEN 'Medium'
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 80 THEN 'High'
                    ELSE 'Very High'
                END)
        END) AS glycemic_index,
        SUM(cfe_meal.vitamin_a * fem.quantity) AS vitamin_a,
        SUM(cfe_meal.vitamin_c * fem.quantity) AS vitamin_c,
        SUM(cfe_meal.calcium * fem.quantity) AS calcium,
        SUM(cfe_meal.iron * fem.quantity) AS iron,
        1 AS serving_size, -- Treat meal as single serving unit for calculations
        'serving' AS serving_unit,
        fem.id AS food_entry_meal_id
      FROM food_entry_meals fem
      JOIN CalculatedFoodEntries cfe_meal ON fem.id = cfe_meal.food_entry_meal_id
      WHERE fem.user_id = $1 AND fem.entry_date BETWEEN $2 AND $3
      GROUP BY fem.id, fem.entry_date, fem.meal_type, fem.name, fem.description, fem.user_id, fem.quantity
      ORDER BY entry_date, meal_type`,
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
         TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
         SUM(calories) AS total_calories,
         SUM(protein) AS total_protein,
         SUM(carbs) AS total_carbs,
         SUM(fat) AS total_fat,
         SUM(saturated_fat) AS total_saturated_fat,
         SUM(polyunsaturated_fat) AS total_polyunsaturated_fat,
         SUM(monounsaturated_fat) AS total_monounsaturated_fat,
         SUM(trans_fat) AS total_trans_fat,
         SUM(cholesterol) AS total_cholesterol,
         SUM(sodium) AS total_sodium,
         SUM(potassium) AS total_potassium,
         SUM(dietary_fiber) AS total_dietary_fiber,
         SUM(sugars) AS total_sugars,
         SUM(vitamin_a) AS total_vitamin_a,
         SUM(vitamin_c) AS total_vitamin_c,
         SUM(calcium) AS total_calcium,
         SUM(iron) AS total_iron
       FROM (
         SELECT
           fe.entry_date,
           (fe.calories * fe.quantity / fe.serving_size) AS calories,
           (fe.protein * fe.quantity / fe.serving_size) AS protein,
           (fe.carbs * fe.quantity / fe.serving_size) AS carbs,
           (fe.fat * fe.quantity / fe.serving_size) AS fat,
           (COALESCE(fe.saturated_fat, 0) * fe.quantity / fe.serving_size) AS saturated_fat,
           (COALESCE(fe.polyunsaturated_fat, 0) * fe.quantity / fe.serving_size) AS polyunsaturated_fat,
           (COALESCE(fe.monounsaturated_fat, 0) * fe.quantity / fe.serving_size) AS monounsaturated_fat,
           (COALESCE(fe.trans_fat, 0) * fe.quantity / fe.serving_size) AS trans_fat,
           (COALESCE(fe.cholesterol, 0) * fe.quantity / fe.serving_size) AS cholesterol,
           (COALESCE(fe.sodium, 0) * fe.quantity / fe.serving_size) AS sodium,
           (COALESCE(fe.potassium, 0) * fe.quantity / fe.serving_size) AS potassium,
           (COALESCE(fe.dietary_fiber, 0) * fe.quantity / fe.serving_size) AS dietary_fiber,
           (COALESCE(fe.sugars, 0) * fe.quantity / fe.serving_size) AS sugars,
           (COALESCE(fe.vitamin_a, 0) * fe.quantity / fe.serving_size) AS vitamin_a,
           (COALESCE(fe.vitamin_c, 0) * fe.quantity / fe.serving_size) AS vitamin_c,
           (COALESCE(fe.calcium, 0) * fe.quantity / fe.serving_size) AS calcium,
           (COALESCE(fe.iron, 0) * fe.quantity / fe.serving_size) AS iron
         FROM food_entries fe
         WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3 AND fe.food_entry_meal_id IS NULL
         UNION ALL
         SELECT
           fem.entry_date,
           SUM((fe_meal.calories * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS calories,
           SUM((fe_meal.protein * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS protein,
           SUM((fe_meal.carbs * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS carbs,
           SUM((fe_meal.fat * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS fat,
           SUM((COALESCE(fe_meal.saturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS saturated_fat,
           SUM((COALESCE(fe_meal.polyunsaturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS polyunsaturated_fat,
           SUM((COALESCE(fe_meal.monounsaturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS monounsaturated_fat,
           SUM((COALESCE(fe_meal.trans_fat, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS trans_fat,
           SUM((COALESCE(fe_meal.cholesterol, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS cholesterol,
           SUM((COALESCE(fe_meal.sodium, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS sodium,
           SUM((COALESCE(fe_meal.potassium, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS potassium,
           SUM((COALESCE(fe_meal.dietary_fiber, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS dietary_fiber,
           SUM((COALESCE(fe_meal.sugars, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS sugars,
           SUM((COALESCE(fe_meal.vitamin_a, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS vitamin_a,
           SUM((COALESCE(fe_meal.vitamin_c, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS vitamin_c,
           SUM((COALESCE(fe_meal.calcium, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS calcium,
           SUM((COALESCE(fe_meal.iron, 0) * fe_meal.quantity / fe_meal.serving_size) * fem.quantity) AS iron
         FROM food_entry_meals fem
         JOIN food_entries fe_meal ON fem.id = fe_meal.food_entry_meal_id
         WHERE fem.user_id = $1 AND fem.entry_date BETWEEN $2 AND $3
         GROUP BY fem.entry_date
       ) AS combined_nutrition
       GROUP BY entry_date
       ORDER BY entry_date`,
      [userId, startDate, endDate]
    );
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