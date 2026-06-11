import { getClient } from '../db/poolManager.js';

// Aggregate queries backing the chatbot coach tools (sparky_get_health_summary,
// sparky_analyze_trends, sparky_get_30day_trends, sparky_detect_patterns,
// sparky_generate_coaching_plan). Trend math and pattern classification live in
// ai/tools/coachTools.ts; this file only holds the SQL.
//
// Snapshot nutrient columns on food_entries are stored unscaled (per serving),
// so totals scale by quantity / serving_size.

async function getNutritionAggregates(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        COALESCE(SUM(calories * quantity / NULLIF(serving_size, 0)), 0)::numeric AS total_calories,
        COALESCE(AVG(protein * quantity / NULLIF(serving_size, 0)), 0)::numeric AS avg_protein,
        COALESCE(AVG(carbs * quantity / NULLIF(serving_size, 0)), 0)::numeric AS avg_carbs,
        COALESCE(AVG(fat * quantity / NULLIF(serving_size, 0)), 0)::numeric AS avg_fat,
        COUNT(*)::int AS entry_count
       FROM food_entries
       WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
      [userId, startDate, endDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getExerciseAggregates(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        COALESCE(SUM(calories_burned), 0)::numeric AS total_calories_burned,
        COUNT(*)::int AS workout_count
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
      [userId, startDate, endDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getLatestWeightInRange(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT weight, entry_date
       FROM check_in_measurements
       WHERE user_id = $1 AND weight IS NOT NULL AND entry_date >= $2 AND entry_date <= $3
       ORDER BY entry_date DESC
       LIMIT 1`,
      [userId, startDate, endDate]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function getWaterIntakeTotal(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT COALESCE(SUM(water_ml), 0)::numeric AS total_water
       FROM water_intake
       WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
      [userId, startDate, endDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getWeightSeries(userId: string, days: number) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT weight, entry_date
       FROM check_in_measurements
       WHERE user_id = $1 AND weight IS NOT NULL AND entry_date >= (CURRENT_DATE - $2::int)
       ORDER BY entry_date ASC`,
      [userId, days]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getDailyCalorieSeries(userId: string, days: number) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT entry_date, SUM(calories * quantity / NULLIF(serving_size, 0))::numeric AS daily_calories
       FROM food_entries
       WHERE user_id = $1 AND entry_date >= (CURRENT_DATE - $2::int)
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [userId, days]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function get30DayFoodAggregates(userId: string, endDate: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        COUNT(DISTINCT entry_date)::int AS days_logged,
        COALESCE(AVG(daily_cal), 0)::numeric AS avg_daily_calories,
        COALESCE(AVG(daily_protein), 0)::numeric AS avg_daily_protein
       FROM (
         SELECT entry_date,
                SUM(calories * quantity / NULLIF(serving_size, 0)) AS daily_cal,
                SUM(protein * quantity / NULLIF(serving_size, 0)) AS daily_protein
         FROM food_entries
         WHERE user_id = $1 AND entry_date > ($2::date - INTERVAL '30 days') AND entry_date <= $2::date
         GROUP BY entry_date
       ) sub`,
      [userId, endDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function get30DayExerciseAggregates(userId: string, endDate: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        COUNT(*)::int AS total_workouts,
        COUNT(DISTINCT entry_date)::int AS active_days,
        COALESCE(SUM(calories_burned), 0)::numeric AS total_calories_burned
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date > ($2::date - INTERVAL '30 days') AND entry_date <= $2::date`,
      [userId, endDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function get30DayMoodAggregates(userId: string, endDate: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        COUNT(*)::int AS entries,
        COALESCE(AVG(mood_value), 0)::numeric AS avg_mood
       FROM mood_entries
       WHERE user_id = $1 AND entry_date > ($2::date - INTERVAL '30 days') AND entry_date <= $2::date`,
      [userId, endDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function get30DaySleepAggregates(userId: string, endDate: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        COUNT(*)::int AS entries,
        COALESCE(AVG(duration_in_seconds), 0)::numeric AS avg_duration_seconds,
        COALESCE(AVG(sleep_score), 0)::numeric AS avg_sleep_score
       FROM sleep_entries
       WHERE user_id = $1 AND entry_date > ($2::date - INTERVAL '30 days') AND entry_date <= $2::date`,
      [userId, endDate]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function get30DayWeightSeries(userId: string, endDate: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT weight, entry_date
       FROM check_in_measurements
       WHERE user_id = $1 AND weight IS NOT NULL AND entry_date > ($2::date - INTERVAL '30 days') AND entry_date <= $2::date
       ORDER BY entry_date ASC`,
      [userId, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Daily nutrition totals joined with same-day sleep and mood, for pattern
// detection (sparky_detect_patterns).
async function getDailyCorrelationRows(userId: string, days: number) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `WITH daily_food AS (
        SELECT
          entry_date,
          SUM(calories * quantity / NULLIF(serving_size, 0)) as calories,
          SUM(protein * quantity / NULLIF(serving_size, 0)) as protein,
          SUM(carbs * quantity / NULLIF(serving_size, 0)) as carbs,
          SUM(fat * quantity / NULLIF(serving_size, 0)) as fat,
          SUM(sugars * quantity / NULLIF(serving_size, 0)) as sugars,
          SUM(sodium * quantity / NULLIF(serving_size, 0)) as sodium,
          SUM(dietary_fiber * quantity / NULLIF(serving_size, 0)) as fiber,
          SUM(saturated_fat * quantity / NULLIF(serving_size, 0)) as sat_fat,
          SUM(cholesterol * quantity / NULLIF(serving_size, 0)) as cholesterol,
          SUM(potassium * quantity / NULLIF(serving_size, 0)) as potassium,
          SUM(vitamin_a * quantity / NULLIF(serving_size, 0)) as vit_a,
          SUM(vitamin_c * quantity / NULLIF(serving_size, 0)) as vit_c,
          SUM(calcium * quantity / NULLIF(serving_size, 0)) as calcium,
          SUM(iron * quantity / NULLIF(serving_size, 0)) as iron
        FROM food_entries
        WHERE user_id = $1 AND entry_date >= CURRENT_DATE - $2::int
        GROUP BY entry_date
      ),
      daily_sleep AS (
        SELECT entry_date, duration_in_seconds, sleep_score
        FROM sleep_entries
        WHERE user_id = $1 AND entry_date >= CURRENT_DATE - $2::int
      ),
      daily_mood AS (
        SELECT entry_date, mood_value
        FROM mood_entries
        WHERE user_id = $1 AND entry_date >= CURRENT_DATE - $2::int
      )
      SELECT
        f.*,
        s.duration_in_seconds, s.sleep_score,
        m.mood_value
      FROM daily_food f
      LEFT JOIN daily_sleep s ON f.entry_date = s.entry_date
      LEFT JOIN daily_mood m ON f.entry_date = m.entry_date
      ORDER BY f.entry_date DESC`,
      [userId, days]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Most frequently logged foods with >10g protein, for shopping-list
// suggestions (sparky_generate_coaching_plan).
async function getFrequentHighProteinFoods(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT food_name, COUNT(*) as frequency
       FROM food_entries
       WHERE user_id = $1 AND protein > 10
       GROUP BY food_name
       ORDER BY frequency DESC
       LIMIT 5`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export {
  getNutritionAggregates,
  getExerciseAggregates,
  getLatestWeightInRange,
  getWaterIntakeTotal,
  getWeightSeries,
  getDailyCalorieSeries,
  get30DayFoodAggregates,
  get30DayExerciseAggregates,
  get30DayMoodAggregates,
  get30DaySleepAggregates,
  get30DayWeightSeries,
  getDailyCorrelationRows,
  getFrequentHighProteinFoods,
};
export default {
  getNutritionAggregates,
  getExerciseAggregates,
  getLatestWeightInRange,
  getWaterIntakeTotal,
  getWeightSeries,
  getDailyCalorieSeries,
  get30DayFoodAggregates,
  get30DayExerciseAggregates,
  get30DayMoodAggregates,
  get30DaySleepAggregates,
  get30DayWeightSeries,
  getDailyCorrelationRows,
  getFrequentHighProteinFoods,
};
