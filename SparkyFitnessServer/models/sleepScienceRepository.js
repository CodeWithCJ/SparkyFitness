const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");

/**
 * Get sleep history for calculations
 * @param {string} userId
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} Sleep entries with timestamps and durations
 */
async function getSleepHistory(userId, days = 90) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        se.entry_date AS date,
        se.duration_in_seconds,
        se.bedtime,
        se.wake_time,
        COALESCE(
          (SELECT SUM(ss.duration_in_seconds) FROM sleep_entry_stages ss WHERE ss.entry_id = se.id AND ss.stage_type = 'deep'), 0
        ) / 60.0 AS "deepSleepMinutes",
        COALESCE(
          (SELECT SUM(ss.duration_in_seconds) FROM sleep_entry_stages ss WHERE ss.entry_id = se.id AND ss.stage_type = 'rem'), 0
        ) / 60.0 AS "remSleepMinutes",
        COALESCE(
          (SELECT SUM(ss.duration_in_seconds) FROM sleep_entry_stages ss WHERE ss.entry_id = se.id AND ss.stage_type = 'light'), 0
        ) / 60.0 AS "lightSleepMinutes",
        COALESCE(
          (SELECT SUM(ss.duration_in_seconds) FROM sleep_entry_stages ss WHERE ss.entry_id = se.id AND ss.stage_type = 'awake'), 0
        ) / 60.0 AS "awakeMinutes",
        se.duration_in_seconds / 3600.0 AS "sleepDurationHours",
        EXTRACT(EPOCH FROM se.bedtime) * 1000 AS "sleepStartTimestampGMT",
        EXTRACT(EPOCH FROM se.wake_time) * 1000 AS "sleepEndTimestampGMT",
        se.sleep_score AS "sleepScore"
      FROM sleep_entries se
      WHERE se.user_id = $1
        AND se.entry_date >= CURRENT_DATE - INTERVAL '1 day' * $2
        AND se.duration_in_seconds > 0
      ORDER BY se.entry_date DESC`,
      [userId, days]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get user's sleep science profile
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getSleepProfile(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        baseline_sleep_need,
        sleep_need_method,
        sleep_need_confidence,
        sleep_need_based_on_days,
        sleep_need_last_calculated,
        sd_workday_hours,
        sd_freeday_hours,
        social_jetlag_hours
      FROM profiles
      WHERE id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Update baseline sleep need in profile
 * @param {string} userId
 * @param {Object} params
 */
async function updateBaselineSleepNeed(userId, params) {
  const client = await getClient(userId);
  try {
    await client.query(
      `UPDATE profiles SET
        baseline_sleep_need = $1,
        sleep_need_method = 'mctq_corrected',
        sleep_need_confidence = $2,
        sleep_need_based_on_days = $3,
        sleep_need_last_calculated = NOW(),
        sd_workday_hours = $4,
        sd_freeday_hours = $5,
        social_jetlag_hours = $6
      WHERE id = $7`,
      [
        params.baselineNeed,
        params.confidence,
        params.basedOnDays,
        params.sdWorkday,
        params.sdFreeday,
        params.socialJetlag,
        userId,
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Save MCTQ calculation record
 * @param {string} userId
 * @param {Object} data
 */
async function saveCalculation(userId, data) {
  const client = await getClient(userId);
  try {
    await client.query(
      `INSERT INTO sleep_need_calculations (
        user_id, method, calculated_need, confidence, based_on_days,
        sd_workday, sd_freeday, sd_week, social_jetlag_hours,
        mid_sleep_workday, mid_sleep_freeday, mid_sleep_corrected,
        workdays_count, freedays_count, data_start_date, data_end_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        userId,
        data.method,
        data.calculatedNeed,
        data.confidence,
        data.basedOnDays,
        data.sdWorkday,
        data.sdFreeday,
        data.sdWeek,
        data.socialJetlag,
        data.midSleepWorkday,
        data.midSleepFreeday,
        data.midSleepCorrected,
        data.workdaysCount,
        data.freedaysCount,
        data.dataStartDate,
        data.dataEndDate,
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Upsert day classification cache
 * @param {string} userId
 * @param {number} dayOfWeek - 0-6 (Sun-Sat)
 * @param {Object} data
 */
async function upsertDayClassification(userId, dayOfWeek, data) {
  const client = await getClient(userId);
  try {
    await client.query(
      `INSERT INTO day_classification_cache
        (user_id, day_of_week, classified_as, mean_wake_hour, variance_minutes, sample_count)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, day_of_week) DO UPDATE SET
        classified_as = EXCLUDED.classified_as,
        mean_wake_hour = EXCLUDED.mean_wake_hour,
        variance_minutes = EXCLUDED.variance_minutes,
        sample_count = EXCLUDED.sample_count,
        last_updated = NOW()`,
      [
        userId,
        dayOfWeek,
        data.classifiedAs,
        data.meanWakeHour,
        data.varianceMinutes,
        data.sampleCount,
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Get day classifications for user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getDayClassifications(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT day_of_week, classified_as, mean_wake_hour, variance_minutes, sample_count
      FROM day_classification_cache
      WHERE user_id = $1
      ORDER BY day_of_week`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get MCTQ stats from view
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getMCTQStats(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM v_mctq_stats WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get latest calculation record
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getLatestCalculation(userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM sleep_need_calculations
      WHERE user_id = $1
      ORDER BY calculated_at DESC
      LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Upsert daily sleep need
 * @param {string} userId
 * @param {string} targetDate
 * @param {Object} breakdown
 */
async function upsertDailyNeed(userId, targetDate, breakdown) {
  const client = await getClient(userId);
  try {
    await client.query(
      `INSERT INTO daily_sleep_need
        (user_id, target_date, baseline_need, strain_addition, debt_addition,
         nap_subtraction, total_need, training_load_score, current_debt_hours,
         nap_minutes, recovery_score_yesterday)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id, target_date) DO UPDATE SET
        baseline_need = EXCLUDED.baseline_need,
        strain_addition = EXCLUDED.strain_addition,
        debt_addition = EXCLUDED.debt_addition,
        nap_subtraction = EXCLUDED.nap_subtraction,
        total_need = EXCLUDED.total_need,
        training_load_score = EXCLUDED.training_load_score,
        current_debt_hours = EXCLUDED.current_debt_hours,
        nap_minutes = EXCLUDED.nap_minutes,
        recovery_score_yesterday = EXCLUDED.recovery_score_yesterday,
        calculated_at = NOW()`,
      [
        userId,
        targetDate,
        breakdown.baseline,
        breakdown.strainAddition,
        breakdown.debtAddition,
        breakdown.napSubtraction,
        breakdown.totalNeed,
        breakdown.trainingLoadScore,
        breakdown.currentDebtHours,
        breakdown.napMinutes,
        breakdown.recoveryScoreYesterday,
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Get daily need for date
 * @param {string} userId
 * @param {string} targetDate
 * @returns {Promise<Object|null>}
 */
async function getDailyNeed(userId, targetDate) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT * FROM daily_sleep_need
      WHERE user_id = $1 AND target_date = $2`,
      [userId, targetDate]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

module.exports = {
  getSleepHistory,
  getSleepProfile,
  updateBaselineSleepNeed,
  saveCalculation,
  upsertDayClassification,
  getDayClassifications,
  getMCTQStats,
  getLatestCalculation,
  upsertDailyNeed,
  getDailyNeed,
};
