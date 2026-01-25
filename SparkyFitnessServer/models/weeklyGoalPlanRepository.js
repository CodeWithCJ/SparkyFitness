const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');

async function createWeeklyGoalPlan(planData) {
  const client = await getClient(planData.user_id); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO weekly_goal_plans (
        user_id, plan_name, start_date, end_date, is_active,
        monday_preset_id, tuesday_preset_id, wednesday_preset_id,
        thursday_preset_id, friday_preset_id, saturday_preset_id, sunday_preset_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        planData.user_id, planData.plan_name, planData.start_date, planData.end_date, planData.is_active,
        planData.monday_preset_id, planData.tuesday_preset_id, planData.wednesday_preset_id,
        planData.thursday_preset_id, planData.friday_preset_id, planData.saturday_preset_id, planData.sunday_preset_id
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getWeeklyGoalPlansByUserId(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT * FROM weekly_goal_plans WHERE user_id = $1 ORDER BY start_date DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getActiveWeeklyGoalPlan(userId, date) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT * FROM weekly_goal_plans
       WHERE user_id = $1 AND is_active = TRUE
         AND start_date <= $2
         AND (end_date IS NULL OR end_date >= $2)
       ORDER BY start_date DESC
       LIMIT 1`,
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateWeeklyGoalPlan(planId, planData) {
  const client = await getClient(planData.user_id); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE weekly_goal_plans SET
        plan_name = $1, start_date = $2, end_date = $3, is_active = $4,
        monday_preset_id = $5, tuesday_preset_id = $6, wednesday_preset_id = $7,
        thursday_preset_id = $8, friday_preset_id = $9, saturday_preset_id = $10, sunday_preset_id = $11,
        updated_at = now()
      WHERE id = $12 AND user_id = $13
      RETURNING *`,
      [
        planData.plan_name, planData.start_date, planData.end_date, planData.is_active,
        planData.monday_preset_id, planData.tuesday_preset_id, planData.wednesday_preset_id,
        planData.thursday_preset_id, planData.friday_preset_id, planData.saturday_preset_id, planData.sunday_preset_id,
        planId, planData.user_id
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deactivateAllWeeklyGoalPlans(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `UPDATE weekly_goal_plans SET is_active = FALSE WHERE user_id = $1`,
      [userId]
    );
    return true;
  } finally {
    client.release();
  }
}

async function deleteWeeklyGoalPlan(planId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `DELETE FROM weekly_goal_plans WHERE id = $1 AND user_id = $2 RETURNING *`,
      [planId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  createWeeklyGoalPlan,
  getWeeklyGoalPlansByUserId,
  getActiveWeeklyGoalPlan,
  updateWeeklyGoalPlan,
  deactivateAllWeeklyGoalPlans,
  deleteWeeklyGoalPlan,
};