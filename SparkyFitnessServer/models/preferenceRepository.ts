import { getClient } from '../db/poolManager.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateUserPreferences(userId: any, preferenceData: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE user_preferences SET
        date_format = COALESCE($1, date_format),
        default_weight_unit = COALESCE($2, default_weight_unit),
        default_measurement_unit = COALESCE($3, default_measurement_unit),
        default_distance_unit = COALESCE($4, default_distance_unit),
        auto_clear_history = COALESCE($5, auto_clear_history),
        logging_level = COALESCE($6, logging_level),
        timezone = COALESCE($7, timezone),
        default_food_data_provider_id = COALESCE($8, default_food_data_provider_id),
        item_display_limit = COALESCE($9, item_display_limit),
        water_display_unit = COALESCE($10, water_display_unit),
        bmr_algorithm = COALESCE($11, bmr_algorithm),
        body_fat_algorithm = COALESCE($12, body_fat_algorithm),
        include_bmr_in_net_calories = COALESCE($13, include_bmr_in_net_calories),
        language = COALESCE($14, language),
        calorie_goal_adjustment_mode = COALESCE($15, calorie_goal_adjustment_mode),
        energy_unit = COALESCE($16, energy_unit),
        fat_breakdown_algorithm = COALESCE($17, fat_breakdown_algorithm),
        mineral_calculation_algorithm = COALESCE($18, mineral_calculation_algorithm),
        vitamin_calculation_algorithm = COALESCE($19, vitamin_calculation_algorithm),
        sugar_calculation_algorithm = COALESCE($20, sugar_calculation_algorithm),
        auto_scale_open_food_facts_imports = COALESCE($21, auto_scale_open_food_facts_imports),
        exercise_calorie_percentage = COALESCE($22, exercise_calorie_percentage),
        activity_level = COALESCE($23, activity_level),
        tdee_allow_negative_adjustment = COALESCE($24, tdee_allow_negative_adjustment),
        auto_scale_online_imports = COALESCE($25, auto_scale_online_imports),
        first_day_of_week = COALESCE($29, first_day_of_week),
        barcode_fallback_open_food_facts = COALESCE($30, barcode_fallback_open_food_facts),
        show_net_carbs = COALESCE($31, show_net_carbs),
        ai_assisted_conversions = COALESCE($32, ai_assisted_conversions),
        goal_mode = COALESCE($33, goal_mode),
        goal_mode_calculation_method = COALESCE($34, goal_mode_calculation_method),
        goal_mode_custom_percentage = COALESCE($35, goal_mode_custom_percentage),
        use_external_bmr = COALESCE($36, use_external_bmr),
        add_exercise_water_to_goal = COALESCE($39, add_exercise_water_to_goal),
        default_barcode_provider_id = CASE WHEN $27 THEN $26 ELSE default_barcode_provider_id END,
        active_ai_service_id = CASE WHEN $38 THEN $37 ELSE active_ai_service_id END,
        active_vision_ai_service_id = CASE WHEN $42 THEN $41 ELSE active_vision_ai_service_id END,
        measurement_decimal_places = COALESCE($40, measurement_decimal_places),
        updated_at = now()
      WHERE user_id = $28
      RETURNING *`,
      [
        preferenceData.date_format,
        preferenceData.default_weight_unit,
        preferenceData.default_measurement_unit,
        preferenceData.default_distance_unit,
        preferenceData.auto_clear_history,
        preferenceData.logging_level,
        preferenceData.timezone,
        preferenceData.default_food_data_provider_id,
        preferenceData.item_display_limit,
        preferenceData.water_display_unit,
        preferenceData.bmr_algorithm,
        preferenceData.body_fat_algorithm,
        preferenceData.include_bmr_in_net_calories,
        preferenceData.language,
        preferenceData.calorie_goal_adjustment_mode,
        preferenceData.energy_unit,
        preferenceData.fat_breakdown_algorithm,
        preferenceData.mineral_calculation_algorithm,
        preferenceData.vitamin_calculation_algorithm,
        preferenceData.sugar_calculation_algorithm,
        preferenceData.auto_scale_open_food_facts_imports,
        preferenceData.exercise_calorie_percentage,
        preferenceData.activity_level,
        preferenceData.tdee_allow_negative_adjustment,
        preferenceData.auto_scale_online_imports,
        preferenceData.default_barcode_provider_id,
        'default_barcode_provider_id' in preferenceData,
        userId,
        preferenceData.first_day_of_week,
        preferenceData.barcode_fallback_open_food_facts,
        preferenceData.show_net_carbs,
        preferenceData.ai_assisted_conversions,
        preferenceData.goal_mode,
        preferenceData.goal_mode_calculation_method,
        preferenceData.goal_mode_custom_percentage,
        preferenceData.use_external_bmr,
        preferenceData.active_ai_service_id,
        'active_ai_service_id' in preferenceData,
        preferenceData.add_exercise_water_to_goal,
        preferenceData.measurement_decimal_places,
        preferenceData.active_vision_ai_service_id,
        'active_vision_ai_service_id' in preferenceData,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteUserPreferences(userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserPreferences(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bootstrapUserTimezoneIfUnset(userId: any, timezone: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `WITH bootstrapped AS (
         INSERT INTO user_preferences (user_id, timezone)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           timezone = EXCLUDED.timezone,
           updated_at = now()
         WHERE user_preferences.timezone IS NULL
         RETURNING *
       )
       SELECT * FROM bootstrapped
       UNION ALL
       SELECT * FROM user_preferences
       WHERE user_id = $1
         AND NOT EXISTS (SELECT 1 FROM bootstrapped)
       LIMIT 1`,
      [userId, timezone]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertUserPreferences(preferenceData: any) {
  const client = await getClient(preferenceData.user_id); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO user_preferences (
       user_id, date_format, default_weight_unit, default_measurement_unit, default_distance_unit,
       auto_clear_history, logging_level, timezone,
       default_food_data_provider_id, item_display_limit, water_display_unit,
       bmr_algorithm, body_fat_algorithm, include_bmr_in_net_calories,
       language, calorie_goal_adjustment_mode, energy_unit,
       fat_breakdown_algorithm, mineral_calculation_algorithm, vitamin_calculation_algorithm, sugar_calculation_algorithm,
       auto_scale_open_food_facts_imports, exercise_calorie_percentage, activity_level,
       tdee_allow_negative_adjustment, auto_scale_online_imports, default_barcode_provider_id,
       first_day_of_week, barcode_fallback_open_food_facts,
       show_net_carbs,
       ai_assisted_conversions,
       goal_mode,
       goal_mode_calculation_method,
       goal_mode_custom_percentage,
       use_external_bmr,
       add_exercise_water_to_goal,
       active_ai_service_id,
       measurement_decimal_places,
       active_vision_ai_service_id,
       created_at, updated_at
     ) VALUES (
       $1, COALESCE($2, 'yyyy-MM-dd'), COALESCE($3, 'lbs'), COALESCE($4, 'in'), COALESCE($5, 'km'),
       COALESCE($6, 'never'), COALESCE($7, 'INFO'), $8,
       $9, COALESCE($10, 10), COALESCE($11, 'ml'),
       COALESCE($12, 'Mifflin-St Jeor'), COALESCE($13, 'U.S. Navy'), COALESCE($14, false),
       COALESCE($15, 'en'), COALESCE($16, 'dynamic'), COALESCE($17, 'kcal'),
       COALESCE($18, 'AHA Guidelines'), COALESCE($19, 'RDA Standard'), COALESCE($20, 'RDA Standard'), COALESCE($21, 'WHO Guidelines'),
       COALESCE($22, false), COALESCE($23, 100), COALESCE($24, 'not_much'),
       COALESCE($25, false),
       COALESCE($26, true),
       $27,
       COALESCE($29, 0),
       COALESCE($30, true),
       COALESCE($31, false),
       COALESCE($32, true),
       COALESCE($33, 'maintain'),
       COALESCE($34, 'manual'),
       COALESCE($35, 0),
       COALESCE($36, false),
       COALESCE($39, false),
       $37,
       COALESCE($40, 0),
       $41,
       now(), now()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       date_format = COALESCE(EXCLUDED.date_format, user_preferences.date_format),
       default_weight_unit = COALESCE(EXCLUDED.default_weight_unit, user_preferences.default_weight_unit),
       default_measurement_unit = COALESCE(EXCLUDED.default_measurement_unit, user_preferences.default_measurement_unit),
       default_distance_unit = COALESCE(EXCLUDED.default_distance_unit, user_preferences.default_distance_unit),
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
       auto_scale_open_food_facts_imports = COALESCE(EXCLUDED.auto_scale_open_food_facts_imports, user_preferences.auto_scale_open_food_facts_imports),
       exercise_calorie_percentage = COALESCE(EXCLUDED.exercise_calorie_percentage, user_preferences.exercise_calorie_percentage),
       activity_level = COALESCE(EXCLUDED.activity_level, user_preferences.activity_level),
       tdee_allow_negative_adjustment = COALESCE(EXCLUDED.tdee_allow_negative_adjustment, user_preferences.tdee_allow_negative_adjustment),
       auto_scale_online_imports = COALESCE(EXCLUDED.auto_scale_online_imports, user_preferences.auto_scale_online_imports),
       first_day_of_week = COALESCE(EXCLUDED.first_day_of_week, user_preferences.first_day_of_week),
       barcode_fallback_open_food_facts = COALESCE(EXCLUDED.barcode_fallback_open_food_facts, user_preferences.barcode_fallback_open_food_facts),
       show_net_carbs = COALESCE(EXCLUDED.show_net_carbs, user_preferences.show_net_carbs),
       ai_assisted_conversions = COALESCE(EXCLUDED.ai_assisted_conversions, user_preferences.ai_assisted_conversions),
       goal_mode = COALESCE(EXCLUDED.goal_mode, user_preferences.goal_mode),
       goal_mode_calculation_method = COALESCE(EXCLUDED.goal_mode_calculation_method, user_preferences.goal_mode_calculation_method),
       goal_mode_custom_percentage = COALESCE(EXCLUDED.goal_mode_custom_percentage, user_preferences.goal_mode_custom_percentage),
       use_external_bmr = COALESCE(EXCLUDED.use_external_bmr, user_preferences.use_external_bmr),
       add_exercise_water_to_goal = COALESCE(EXCLUDED.add_exercise_water_to_goal, user_preferences.add_exercise_water_to_goal),
       default_barcode_provider_id = CASE WHEN $28 THEN EXCLUDED.default_barcode_provider_id ELSE user_preferences.default_barcode_provider_id END,
       active_ai_service_id = CASE WHEN $38 THEN EXCLUDED.active_ai_service_id ELSE user_preferences.active_ai_service_id END,
       active_vision_ai_service_id = CASE WHEN $42 THEN EXCLUDED.active_vision_ai_service_id ELSE user_preferences.active_vision_ai_service_id END,
       measurement_decimal_places = COALESCE(EXCLUDED.measurement_decimal_places, user_preferences.measurement_decimal_places),
       updated_at = now()
     RETURNING *`,
      [
        preferenceData.user_id,
        preferenceData.date_format,
        preferenceData.default_weight_unit,
        preferenceData.default_measurement_unit,
        preferenceData.default_distance_unit,
        preferenceData.auto_clear_history,
        preferenceData.logging_level,
        preferenceData.timezone,
        preferenceData.default_food_data_provider_id,
        preferenceData.item_display_limit,
        preferenceData.water_display_unit,
        preferenceData.bmr_algorithm,
        preferenceData.body_fat_algorithm,
        preferenceData.include_bmr_in_net_calories,
        preferenceData.language,
        preferenceData.calorie_goal_adjustment_mode,
        preferenceData.energy_unit,
        preferenceData.fat_breakdown_algorithm,
        preferenceData.mineral_calculation_algorithm,
        preferenceData.vitamin_calculation_algorithm,
        preferenceData.sugar_calculation_algorithm,
        preferenceData.auto_scale_open_food_facts_imports,
        preferenceData.exercise_calorie_percentage,
        preferenceData.activity_level,
        preferenceData.tdee_allow_negative_adjustment,
        preferenceData.auto_scale_online_imports,
        preferenceData.default_barcode_provider_id,
        'default_barcode_provider_id' in preferenceData,
        preferenceData.first_day_of_week,
        preferenceData.barcode_fallback_open_food_facts,
        preferenceData.show_net_carbs,
        preferenceData.ai_assisted_conversions,
        preferenceData.goal_mode,
        preferenceData.goal_mode_calculation_method,
        preferenceData.goal_mode_custom_percentage,
        preferenceData.use_external_bmr,
        preferenceData.active_ai_service_id,
        'active_ai_service_id' in preferenceData,
        preferenceData.add_exercise_water_to_goal,
        preferenceData.measurement_decimal_places,
        preferenceData.active_vision_ai_service_id,
        'active_vision_ai_service_id' in preferenceData,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
export { updateUserPreferences };
export { deleteUserPreferences };
export { getUserPreferences };
export { bootstrapUserTimezoneIfUnset };
export { upsertUserPreferences };
export default {
  updateUserPreferences,
  deleteUserPreferences,
  getUserPreferences,
  bootstrapUserTimezoneIfUnset,
  upsertUserPreferences,
};
