const { getClient } = require('../db/poolManager');

async function updateUserPreferences(userId, preferenceData) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE user_preferences SET
        date_format = COALESCE($1, date_format),
        default_weight_unit = COALESCE($2, default_weight_unit),
        default_measurement_unit = COALESCE($3, default_measurement_unit),
        default_distance_unit = COALESCE($4, default_distance_unit),
        system_prompt = COALESCE($5, system_prompt),
        auto_clear_history = COALESCE($6, auto_clear_history),
        logging_level = COALESCE($7, logging_level),
        timezone = COALESCE($8, timezone),
        default_food_data_provider_id = COALESCE($9, default_food_data_provider_id),
        item_display_limit = COALESCE($10, item_display_limit),
        water_display_unit = COALESCE($11, water_display_unit),
        bmr_algorithm = COALESCE($12, bmr_algorithm),
        body_fat_algorithm = COALESCE($13, body_fat_algorithm),
        include_bmr_in_net_calories = COALESCE($14, include_bmr_in_net_calories),
        language = COALESCE($15, language),
        calorie_goal_adjustment_mode = COALESCE($16, calorie_goal_adjustment_mode),
        energy_unit = COALESCE($17, energy_unit),
        fat_breakdown_algorithm = COALESCE($18, fat_breakdown_algorithm),
        mineral_calculation_algorithm = COALESCE($19, mineral_calculation_algorithm),
        vitamin_calculation_algorithm = COALESCE($20, vitamin_calculation_algorithm),
        sugar_calculation_algorithm = COALESCE($21, sugar_calculation_algorithm),
        updated_at = now()
      WHERE user_id = $22
      RETURNING *`,
      [
        preferenceData.date_format, preferenceData.default_weight_unit, preferenceData.default_measurement_unit, preferenceData.default_distance_unit,
        preferenceData.system_prompt, preferenceData.auto_clear_history, preferenceData.logging_level, preferenceData.timezone,
        preferenceData.default_food_data_provider_id, preferenceData.item_display_limit, preferenceData.water_display_unit,
        preferenceData.bmr_algorithm, preferenceData.body_fat_algorithm, preferenceData.include_bmr_in_net_calories, preferenceData.language,
        preferenceData.calorie_goal_adjustment_mode, preferenceData.energy_unit,
        preferenceData.fat_breakdown_algorithm, preferenceData.mineral_calculation_algorithm, preferenceData.vitamin_calculation_algorithm, preferenceData.sugar_calculation_algorithm,
        userId
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteUserPreferences(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM user_preferences WHERE user_id = $1 RETURNING user_id',
      [userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getUserPreferences(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT * FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function upsertUserPreferences(preferenceData) {
  const client = await getClient(preferenceData.user_id); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO user_preferences (
       user_id, date_format, default_weight_unit, default_measurement_unit, default_distance_unit,
       system_prompt, auto_clear_history, logging_level, timezone,
       default_food_data_provider_id, item_display_limit, water_display_unit,
       bmr_algorithm, body_fat_algorithm, include_bmr_in_net_calories,
       language, calorie_goal_adjustment_mode, energy_unit,
       fat_breakdown_algorithm, mineral_calculation_algorithm, vitamin_calculation_algorithm, sugar_calculation_algorithm,
       created_at, updated_at
     ) VALUES (
       $1, COALESCE($2, 'yyyy-MM-dd'), COALESCE($3, 'lbs'), COALESCE($4, 'in'), COALESCE($5, 'km'),
       COALESCE($6, ''), COALESCE($7, 'never'), COALESCE($8, 'INFO'), COALESCE($9, 'UTC'),
       $10, COALESCE($11, 10), COALESCE($12, 'ml'),
       COALESCE($13, 'Mifflin-St Jeor'), COALESCE($14, 'U.S. Navy'), COALESCE($15, false),
       COALESCE($16, 'en'), COALESCE($17, 'dynamic'), COALESCE($18, 'kcal'),
       COALESCE($19, 'AHA Guidelines'), COALESCE($20, 'RDA Standard'), COALESCE($21, 'RDA Standard'), COALESCE($22, 'WHO Guidelines'),
       now(), now()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       date_format = COALESCE(EXCLUDED.date_format, user_preferences.date_format),
       default_weight_unit = COALESCE(EXCLUDED.default_weight_unit, user_preferences.default_weight_unit),
       default_measurement_unit = COALESCE(EXCLUDED.default_measurement_unit, user_preferences.default_measurement_unit),
       default_distance_unit = COALESCE(EXCLUDED.default_distance_unit, user_preferences.default_distance_unit),
       system_prompt = COALESCE(EXCLUDED.system_prompt, user_preferences.system_prompt),
       auto_clear_history = COALESCE(EXCLUDED.auto_clear_history, user_preferences.auto_clear_history),
       logging_level = COALESCE(EXCLUDED.logging_level, user_preferences.logging_level),
       timezone = COALESCE(EXCLUDED.timezone, user_preferences.timezone),
       default_food_data_provider_id = COALESCE(EXCLUDED.default_food_data_provider_id, user_preferences.default_food_data_provider_id),
       item_display_limit = COALESCE(EXCLUDED.item_display_limit, user_preferences.item_display_limit),
       water_display_unit = COALESCE(EXCLUDED.water_display_unit, user_preferences.water_display_unit),
       bmr_algorithm = COALESCE(EXCLUDED.bmr_algorithm, user_preferences.bmr_algorithm),
       body_fat_algorithm = COALESCE(EXCLUDED.body_fat_algorithm, user_preferences.body_fat_algorithm),
       include_bmr_in_net_calories = COALESCE(EXCLUDED.include_bmr_in_net_calories, user_preferences.include_bmr_in_net_calories),
       language = COALESCE(EXCLUDED.language, user_preferences.language),
       calorie_goal_adjustment_mode = COALESCE(EXCLUDED.calorie_goal_adjustment_mode, user_preferences.calorie_goal_adjustment_mode),
       energy_unit = COALESCE(EXCLUDED.energy_unit, user_preferences.energy_unit),
       fat_breakdown_algorithm = COALESCE(EXCLUDED.fat_breakdown_algorithm, user_preferences.fat_breakdown_algorithm),
       mineral_calculation_algorithm = COALESCE(EXCLUDED.mineral_calculation_algorithm, user_preferences.mineral_calculation_algorithm),
       vitamin_calculation_algorithm = COALESCE(EXCLUDED.vitamin_calculation_algorithm, user_preferences.vitamin_calculation_algorithm),
       sugar_calculation_algorithm = COALESCE(EXCLUDED.sugar_calculation_algorithm, user_preferences.sugar_calculation_algorithm),
       updated_at = now()
     RETURNING *`,
     [
       preferenceData.user_id, preferenceData.date_format, preferenceData.default_weight_unit, preferenceData.default_measurement_unit, preferenceData.default_distance_unit,
       preferenceData.system_prompt, preferenceData.auto_clear_history, preferenceData.logging_level, preferenceData.timezone,
       preferenceData.default_food_data_provider_id, preferenceData.item_display_limit, preferenceData.water_display_unit,
       preferenceData.bmr_algorithm, preferenceData.body_fat_algorithm, preferenceData.include_bmr_in_net_calories, preferenceData.language,
       preferenceData.calorie_goal_adjustment_mode, preferenceData.energy_unit,
       preferenceData.fat_breakdown_algorithm, preferenceData.mineral_calculation_algorithm, preferenceData.vitamin_calculation_algorithm, preferenceData.sugar_calculation_algorithm
     ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  updateUserPreferences,
  deleteUserPreferences,
  getUserPreferences,
  upsertUserPreferences,
};