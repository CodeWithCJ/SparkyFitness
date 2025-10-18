const { getPool } = require('../db/poolManager');

async function updateUserPreferences(userId, preferenceData) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `UPDATE user_preferences SET
        date_format = COALESCE($1, date_format),
        default_weight_unit = COALESCE($2, default_weight_unit),
        default_measurement_unit = COALESCE($3, default_measurement_unit),
        system_prompt = COALESCE($4, system_prompt),
        auto_clear_history = COALESCE($5, auto_clear_history),
        logging_level = COALESCE($6, logging_level),
        timezone = COALESCE($7, timezone),
        default_food_data_provider_id = COALESCE($8, default_food_data_provider_id),
        item_display_limit = COALESCE($9, item_display_limit),
        water_display_unit = COALESCE($10, water_display_unit),
        bmr_algorithm = COALESCE($11, bmr_algorithm),
        body_fat_algorithm = COALESCE($12, body_fat_algorithm),
        include_bmr_in_net_calories = COALESCE($13, include_bmr_in_net_calories),
        updated_at = now()
      WHERE user_id = $14
      RETURNING *`,
      [
        preferenceData.date_format, preferenceData.default_weight_unit, preferenceData.default_measurement_unit,
        preferenceData.system_prompt, preferenceData.auto_clear_history, preferenceData.logging_level, preferenceData.timezone,
        preferenceData.default_food_data_provider_id, preferenceData.item_display_limit, preferenceData.water_display_unit,
        preferenceData.bmr_algorithm, preferenceData.body_fat_algorithm, preferenceData.include_bmr_in_net_calories, userId
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteUserPreferences(userId) {
  const client = await getPool().connect();
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
  const client = await getPool().connect();
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
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `INSERT INTO user_preferences (
       user_id, date_format, default_weight_unit, default_measurement_unit,
       system_prompt, auto_clear_history, logging_level, timezone,
       default_food_data_provider_id, item_display_limit, water_display_unit,
       bmr_algorithm, body_fat_algorithm, include_bmr_in_net_calories,
       created_at, updated_at
     ) VALUES (
       $1, COALESCE($2, 'yyyy-MM-dd'), COALESCE($3, 'lbs'), COALESCE($4, 'in'),
       COALESCE($5, ''), COALESCE($6, 'never'), COALESCE($7, 'INFO'), COALESCE($8, 'UTC'),
       $9, COALESCE($10, 10), COALESCE($11, 'ml'),
       COALESCE($12, 'Mifflin-St Jeor'), COALESCE($13, 'U.S. Navy'), COALESCE($14, false),
       now(), now()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       date_format = COALESCE(EXCLUDED.date_format, user_preferences.date_format),
       default_weight_unit = COALESCE(EXCLUDED.default_weight_unit, user_preferences.default_weight_unit),
       default_measurement_unit = COALESCE(EXCLUDED.default_measurement_unit, user_preferences.default_measurement_unit),
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
       updated_at = now()
     RETURNING *`,
     [
       preferenceData.user_id, preferenceData.date_format, preferenceData.default_weight_unit, preferenceData.default_measurement_unit,
       preferenceData.system_prompt, preferenceData.auto_clear_history, preferenceData.logging_level, preferenceData.timezone,
       preferenceData.default_food_data_provider_id, preferenceData.item_display_limit, preferenceData.water_display_unit,
       preferenceData.bmr_algorithm, preferenceData.body_fat_algorithm, preferenceData.include_bmr_in_net_calories
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