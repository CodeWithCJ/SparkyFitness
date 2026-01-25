const { getClient } = require("../db/poolManager");

/**
 * Saves onboarding data and updates the user's status to complete.
 * This function uses a transaction to ensure atomicity.
 * @param {string} userId - The UUID of the user.
 * @param {object} data - The onboarding form data.
 * @returns {Promise<void>}
 */
async function saveOnboardingData(userId, data) {
  const {
    sex,
    primaryGoal,
    currentWeight,
    height,
    birthDate,
    bodyFatRange,
    targetWeight,
    mealsPerDay,
    activityLevel,
    addBurnedCalories,
  } = data;

  const client = await getClient(userId);
  try {
    await client.query("BEGIN"); 

    // Query 1: Insert or update the detailed onboarding data.
    const onboardingQuery = `
      INSERT INTO onboarding_data (
        user_id, sex, primary_goal, current_weight, height, birth_date,
        body_fat_range, target_weight, meals_per_day, activity_level, add_burned_calories
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id) DO UPDATE SET
        sex = EXCLUDED.sex, primary_goal = EXCLUDED.primary_goal, current_weight = EXCLUDED.current_weight,
        height = EXCLUDED.height, birth_date = EXCLUDED.birth_date, body_fat_range = EXCLUDED.body_fat_range,
        target_weight = EXCLUDED.target_weight, meals_per_day = EXCLUDED.meals_per_day,
        activity_level = EXCLUDED.activity_level, add_burned_calories = EXCLUDED.add_burned_calories;
    `;
    await client.query(onboardingQuery, [
      userId,
      sex,
      primaryGoal,
      currentWeight,
      height,
      birthDate,
      bodyFatRange,
      targetWeight,
      mealsPerDay,
      activityLevel,
      addBurnedCalories,
    ]);

    // Query 2: Mark onboarding as complete in the status table.
    const statusQuery = `
      UPDATE onboarding_status
      SET onboarding_complete = TRUE, updated_at = NOW()
      WHERE user_id = $1;
    `;
    await client.query(statusQuery, [userId]);

    await client.query("COMMIT"); 
  } catch (error) {
    await client.query("ROLLBACK"); 
    console.error("Error in saveOnboardingData repository:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Fetches the onboarding completion status for a given user.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<object|null>} The database row or null if not found.
 */
async function getOnboardingStatus(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      "SELECT onboarding_complete FROM onboarding_status WHERE user_id = $1",
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error in getOnboardingStatus repository:", error);
    throw error;
  } finally {
    client.release();
  }
}
 
/**
 * Resets the onboarding completion status for a given user to FALSE.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<void>}
 */
async function resetOnboardingStatus(userId) {
  const client = await getClient(userId);
  try {
    const query = `
      UPDATE onboarding_status
      SET onboarding_complete = FALSE, updated_at = NOW()
      WHERE user_id = $1;
    `;
    await client.query(query, [userId]);
  } catch (error) {
    console.error("Error in resetOnboardingStatus repository:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  saveOnboardingData,
  getOnboardingStatus,
  resetOnboardingStatus,
};
