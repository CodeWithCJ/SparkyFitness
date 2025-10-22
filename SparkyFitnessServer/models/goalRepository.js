const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function getGoalByDate(userId, selectedDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT calories, protein, carbs, fat, water_goal_ml,
               saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
               cholesterol, sodium, potassium, dietary_fiber, sugars,
               vitamin_a, vitamin_c, calcium, iron,
               target_exercise_calories_burned, target_exercise_duration_minutes,
               protein_percentage, carbs_percentage, fat_percentage,
               breakfast_percentage, lunch_percentage, dinner_percentage, snacks_percentage
        FROM user_goals
        WHERE goal_date = $1
        ORDER BY updated_at DESC, created_at DESC -- Prioritize most recently updated/created
        LIMIT 1`,
      [selectedDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getMostRecentGoalBeforeDate(userId, selectedDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT calories, protein, carbs, fat, water_goal_ml,
               saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
               cholesterol, sodium, potassium, dietary_fiber, sugars,
               vitamin_a, vitamin_c, calcium, iron,
               target_exercise_calories_burned, target_exercise_duration_minutes,
               protein_percentage, carbs_percentage, fat_percentage,
               breakfast_percentage, lunch_percentage, dinner_percentage, snacks_percentage
       FROM user_goals
       WHERE (goal_date < $1 OR goal_date IS NULL)
       ORDER BY goal_date DESC NULLS LAST
       LIMIT 1`,
      [selectedDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function upsertGoal(goalData) {
  const client = await getClient(goalData.user_id); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO user_goals (
        user_id, goal_date, calories, protein, carbs, fat, water_goal_ml,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron,
        target_exercise_calories_burned, target_exercise_duration_minutes,
        protein_percentage, carbs_percentage, fat_percentage,
        breakfast_percentage, lunch_percentage, dinner_percentage, snacks_percentage,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
      ON CONFLICT (user_id, COALESCE(goal_date, '1900-01-01'::date))
      DO UPDATE SET
        calories = EXCLUDED.calories,
        protein = EXCLUDED.protein,
        carbs = EXCLUDED.carbs,
        fat = EXCLUDED.fat,
        water_goal_ml = EXCLUDED.water_goal_ml,
        saturated_fat = EXCLUDED.saturated_fat,
        polyunsaturated_fat = EXCLUDED.polyunsaturated_fat,
        monounsaturated_fat = EXCLUDED.monounsaturated_fat,
        trans_fat = EXCLUDED.trans_fat,
        cholesterol = EXCLUDED.cholesterol,
        sodium = EXCLUDED.sodium,
        potassium = EXCLUDED.potassium,
        dietary_fiber = EXCLUDED.dietary_fiber,
        sugars = EXCLUDED.sugars,
        vitamin_a = EXCLUDED.vitamin_a,
        vitamin_c = EXCLUDED.vitamin_c,
        calcium = EXCLUDED.calcium,
        iron = EXCLUDED.iron,
        target_exercise_calories_burned = EXCLUDED.target_exercise_calories_burned,
        target_exercise_duration_minutes = EXCLUDED.target_exercise_duration_minutes,
        protein_percentage = EXCLUDED.protein_percentage,
        carbs_percentage = EXCLUDED.carbs_percentage,
        fat_percentage = EXCLUDED.fat_percentage,
        breakfast_percentage = EXCLUDED.breakfast_percentage,
        lunch_percentage = EXCLUDED.lunch_percentage,
        dinner_percentage = EXCLUDED.dinner_percentage,
        snacks_percentage = EXCLUDED.snacks_percentage,
        updated_at = now()
      RETURNING *`,
      [
        goalData.user_id, goalData.goal_date, goalData.calories, goalData.protein, goalData.carbs, goalData.fat, goalData.water_goal_ml,
        goalData.saturated_fat, goalData.polyunsaturated_fat, goalData.monounsaturated_fat, goalData.trans_fat,
        goalData.cholesterol, goalData.sodium, goalData.potassium, goalData.dietary_fiber, goalData.sugars,
        goalData.vitamin_a, goalData.vitamin_c, goalData.calcium, goalData.iron,
        goalData.target_exercise_calories_burned, goalData.target_exercise_duration_minutes,
        goalData.protein_percentage, goalData.carbs_percentage, goalData.fat_percentage,
        goalData.breakfast_percentage, goalData.lunch_percentage, goalData.dinner_percentage, goalData.snacks_percentage,
        new Date(), // for created_at
        new Date()  // for updated_at
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteGoalsInRange(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `DELETE FROM user_goals
       WHERE goal_date >= $1
         AND goal_date < $2
         AND goal_date IS NOT NULL`,
      [startDate, endDate]
    );
    return true;
  } finally {
    client.release();
  }
}

async function deleteDefaultGoal(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `DELETE FROM user_goals
       WHERE goal_date IS NULL`,
      []
    );
    return true;
  } finally {
    client.release();
  }
}

module.exports = {
  getGoalByDate,
  getMostRecentGoalBeforeDate,
  upsertGoal,
  deleteGoalsInRange,
  deleteDefaultGoal,
};