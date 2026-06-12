import { getClient } from '../db/poolManager.js';

// Queries backing the chatbot engagement tools (sparky_check_engagement,
// sparky_get_logging_streak, sparky_get_contextual_nudge). Streak counting and
// nudge selection live in ai/tools/engagementTools.ts; this file only holds
// the SQL.

// pg returns DATE columns as Date objects; string covers custom type parsers.
async function getLastExerciseDate(
  userId: string
): Promise<Date | string | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT entry_date FROM exercise_entries
       WHERE user_id = $1
       ORDER BY entry_date DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.entry_date ?? null;
  } finally {
    client.release();
  }
}

async function getRecentWeights(userId: string, limit = 7) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT weight, entry_date FROM check_in_measurements
       WHERE user_id = $1 AND weight IS NOT NULL
       ORDER BY entry_date DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Distinct days with any food/exercise/check-in entry in the 7 days before
// `today`, the caller's user-timezone day string.
async function getWeeklyLoggedDayCount(
  userId: string,
  today: string
): Promise<number> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT COUNT(DISTINCT d.entry_date)::int AS streak_days
       FROM (
         SELECT entry_date FROM food_entries WHERE user_id = $1 AND entry_date >= ($2::date - 7)
         UNION
         SELECT entry_date FROM exercise_entries WHERE user_id = $1 AND entry_date >= ($2::date - 7)
         UNION
         SELECT entry_date FROM check_in_measurements WHERE user_id = $1 AND entry_date >= ($2::date - 7)
       ) d`,
      [userId, today]
    );
    return result.rows[0]?.streak_days ?? 0;
  } finally {
    client.release();
  }
}

// All distinct days with any logged data, newest first. The streak walk over
// these dates happens in the tool layer.
async function getLoggedDates(userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT DISTINCT entry_date
       FROM (
         SELECT entry_date FROM food_entries WHERE user_id = $1
         UNION
         SELECT entry_date FROM exercise_entries WHERE user_id = $1
         UNION
         SELECT entry_date FROM check_in_measurements WHERE user_id = $1
       ) all_entries
       ORDER BY entry_date DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Counts for `today`, the caller's user-timezone day string. The fasting
// branch counts fasts *started* today, bucketing start_time in the user's
// timezone.
async function getTodayActivityCounts(
  userId: string,
  today: string,
  tz: string
) {
  const client = await getClient(userId);
  try {
    const foodResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM food_entries WHERE user_id = $1 AND entry_date = $2::date',
      [userId, today]
    );
    const exerciseResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM exercise_entries WHERE user_id = $1 AND entry_date = $2::date',
      [userId, today]
    );
    const checkinResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT id FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2::date
         UNION ALL
         SELECT id FROM mood_entries WHERE user_id = $1 AND entry_date = $2::date
         UNION ALL
         SELECT id FROM sleep_entries WHERE user_id = $1 AND entry_date = $2::date
         UNION ALL
         SELECT id FROM fasting_logs WHERE user_id = $1 AND (start_time AT TIME ZONE $3)::date = $2::date
       ) all_checkins`,
      [userId, today, tz]
    );

    return {
      food_count: foodResult.rows[0]?.count ?? 0,
      exercise_count: exerciseResult.rows[0]?.count ?? 0,
      checkin_count: checkinResult.rows[0]?.count ?? 0,
    };
  } finally {
    client.release();
  }
}

export {
  getLastExerciseDate,
  getRecentWeights,
  getWeeklyLoggedDayCount,
  getLoggedDates,
  getTodayActivityCounts,
};
export default {
  getLastExerciseDate,
  getRecentWeights,
  getWeeklyLoggedDayCount,
  getLoggedDates,
  getTodayActivityCounts,
};
