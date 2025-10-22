const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function createGoalPreset(presetData) {
  const client = await getClient(presetData.user_id); // User-specific operation
  try {
    log('debug', 'createGoalPreset: Received presetData:', {
      protein: presetData.protein,
      carbs: presetData.carbs,
      fat: presetData.fat,
      protein_percentage: presetData.protein_percentage,
      carbs_percentage: presetData.carbs_percentage,
      fat_percentage: presetData.fat_percentage
    });
    const result = await client.query(
      `INSERT INTO goal_presets (
        user_id, preset_name, calories, protein, carbs, fat, water_goal,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron,
        target_exercise_calories_burned, target_exercise_duration_minutes,
        protein_percentage, carbs_percentage, fat_percentage,
        breakfast_percentage, lunch_percentage, dinner_percentage, snacks_percentage
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
      RETURNING *`,
      [
        presetData.user_id, presetData.preset_name, presetData.calories, presetData.protein, presetData.carbs, presetData.fat, presetData.water_goal,
        presetData.saturated_fat, presetData.polyunsaturated_fat, presetData.monounsaturated_fat, presetData.trans_fat,
        presetData.cholesterol, presetData.sodium, presetData.potassium, presetData.dietary_fiber, presetData.sugars,
        presetData.vitamin_a, presetData.vitamin_c, presetData.calcium, presetData.iron,
        presetData.target_exercise_calories_burned, presetData.target_exercise_duration_minutes,
        presetData.protein_percentage, presetData.carbs_percentage, presetData.fat_percentage,
        presetData.breakfast_percentage, presetData.lunch_percentage, presetData.dinner_percentage, presetData.snacks_percentage
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getGoalPresetsByUserId(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT * FROM goal_presets WHERE user_id = $1 ORDER BY preset_name`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getGoalPresetById(presetId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT * FROM goal_presets WHERE id = $1 AND user_id = $2`,
      [presetId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateGoalPreset(presetId, presetData) {
  const client = await getClient(presetData.user_id); // User-specific operation
  try {
    log('debug', 'updateGoalPreset: Received presetData:', {
      protein: presetData.protein,
      carbs: presetData.carbs,
      fat: presetData.fat,
      protein_percentage: presetData.protein_percentage,
      carbs_percentage: presetData.carbs_percentage,
      fat_percentage: presetData.fat_percentage
    });
    const result = await client.query(
      `UPDATE goal_presets SET
        preset_name = $1, calories = $2, protein = $3, carbs = $4, fat = $5, water_goal = $6,
        saturated_fat = $7, polyunsaturated_fat = $8, monounsaturated_fat = $9, trans_fat = $10,
        cholesterol = $11, sodium = $12, potassium = $13, dietary_fiber = $14, sugars = $15,
        vitamin_a = $16, vitamin_c = $17, calcium = $18, iron = $19,
        target_exercise_calories_burned = $20, target_exercise_duration_minutes = $21,
        protein_percentage = $22, carbs_percentage = $23, fat_percentage = $24,
        breakfast_percentage = $25, lunch_percentage = $26, dinner_percentage = $27, snacks_percentage = $28,
        updated_at = now()
      WHERE id = $29 AND user_id = $30
      RETURNING *`,
      [
        presetData.preset_name, presetData.calories, presetData.protein, presetData.carbs, presetData.fat, presetData.water_goal,
        presetData.saturated_fat, presetData.polyunsaturated_fat, presetData.monounsaturated_fat, presetData.trans_fat,
        presetData.cholesterol, presetData.sodium, presetData.potassium, presetData.dietary_fiber, presetData.sugars,
        presetData.vitamin_a, presetData.vitamin_c, presetData.calcium, presetData.iron,
        presetData.target_exercise_calories_burned, presetData.target_exercise_duration_minutes,
        presetData.protein_percentage, presetData.carbs_percentage, presetData.fat_percentage,
        presetData.breakfast_percentage, presetData.lunch_percentage, presetData.dinner_percentage, presetData.snacks_percentage,
        presetId, presetData.user_id
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteGoalPreset(presetId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `DELETE FROM goal_presets WHERE id = $1 AND user_id = $2 RETURNING *`,
      [presetId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  createGoalPreset,
  getGoalPresetsByUserId,
  getGoalPresetById,
  updateGoalPreset,
  deleteGoalPreset,
};