import { getClient } from '../db/poolManager.js';
import {
  bodyWeightJoinSql,
  cardioPredicateSql,
  setLoadSql,
} from '../utils/exerciseLoadSql.js';
import { MAIN_SLEEP_ORDER_SQL } from './sleepRepository.js';

// Raw per-day values the compare report pairs up. Every query is user-scoped
// (RLS via getClient) and dates stay calendar-day strings.

type Numeric = string | number;
const num = (v: Numeric): number => Number(v);
const numOrNull = (v: Numeric | null): number | null =>
  v === null || v === undefined ? null : Number(v);

async function query<Row>(
  userId: string,
  sql: string,
  params: unknown[]
): Promise<Row[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(sql, params);
    return result.rows as Row[];
  } finally {
    client.release();
  }
}

/** Manual check-ins only: the day's mood rounded, energy and focus to 1 dp. */
async function getManualMoodDays(userId: string, from: string, to: string) {
  const rows = await query<{
    day: string;
    mood: Numeric | null;
    energy: Numeric | null;
    focus: Numeric | null;
  }>(
    userId,
    `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS day,
            ROUND(AVG(mood_value))::int AS mood,
            ROUND(AVG(energy_value), 1) AS energy,
            ROUND(AVG(focus_value), 1) AS focus
       FROM mood_entries
      WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
        AND source = 'manual'
      GROUP BY entry_date
      ORDER BY entry_date ASC`,
    [userId, from, to]
  );
  return rows.map((r) => ({
    day: r.day,
    mood: numOrNull(r.mood),
    energy: numOrNull(r.energy),
    focus: numOrNull(r.focus),
  }));
}

/** The main sleep of each day: its longest record (earlier bedtime on a tie), with time asleep null when the record has none, as the mobile app shows it. A day's records are never summed. */
async function getMainSleepDays(userId: string, from: string, to: string) {
  const rows = await query<{
    day: string;
    time_asleep_seconds: Numeric | null;
    sleep_score: Numeric | null;
    overnight_hrv: Numeric | null;
    resting_heart_rate: Numeric | null;
    bedtime: Date | string | null;
    record_timezone: string | null;
    record_utc_offset_minutes: Numeric | null;
  }>(
    userId,
    `SELECT DISTINCT ON (entry_date)
            TO_CHAR(entry_date, 'YYYY-MM-DD') AS day,
            time_asleep_in_seconds AS time_asleep_seconds,
            sleep_score,
            avg_overnight_hrv AS overnight_hrv,
            resting_heart_rate,
            bedtime,
            record_timezone,
            record_utc_offset_minutes
       FROM sleep_entries
      WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
      ORDER BY ${MAIN_SLEEP_ORDER_SQL}`,
    [userId, from, to]
  );
  return rows.map((r) => ({
    day: r.day,
    timeAsleepSeconds: numOrNull(r.time_asleep_seconds),
    sleepScore: numOrNull(r.sleep_score),
    overnightHrv: numOrNull(r.overnight_hrv),
    restingHeartRate: numOrNull(r.resting_heart_rate),
    bedtime:
      r.bedtime === null
        ? null
        : r.bedtime instanceof Date
          ? r.bedtime.toISOString()
          : r.bedtime,
    recordTimezone: r.record_timezone,
    recordUtcOffsetMinutes: numOrNull(r.record_utc_offset_minutes),
  }));
}

async function getMeditationDays(userId: string, from: string, to: string) {
  const rows = await query<{
    day: string;
    minutes: Numeric;
    sessions: Numeric;
  }>(
    userId,
    `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS day,
            SUM(duration_seconds) / 60.0 AS minutes,
            COUNT(*) AS sessions
       FROM mindfulness_sessions
      WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
      GROUP BY entry_date
      ORDER BY entry_date ASC`,
    [userId, from, to]
  );
  return rows.map((r) => ({
    day: r.day,
    minutes: num(r.minutes),
    sessions: num(r.sessions),
  }));
}

/** The earliest day with a meditation session, or null. Takes no range: it anchors "no record means 0". */
async function getMeditationFirstDay(userId: string) {
  const rows = await query<{ day: string | null }>(
    userId,
    `SELECT TO_CHAR(MIN(entry_date), 'YYYY-MM-DD') AS day
       FROM mindfulness_sessions
      WHERE user_id = $1`,
    [userId]
  );
  return rows[0]?.day ?? null;
}

async function getCardioMinuteDays(userId: string, from: string, to: string) {
  const rows = await query<{ day: string; minutes: Numeric }>(
    userId,
    `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS day,
            SUM(duration_minutes) AS minutes
       FROM exercise_entries
      WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
        AND exercise_name != 'Active Calories'
        AND ${cardioPredicateSql()}
      GROUP BY entry_date
      ORDER BY entry_date ASC`,
    [userId, from, to]
  );
  return rows.map((r) => ({ day: r.day, minutes: num(r.minutes) }));
}

async function getStrengthVolumeDays(userId: string, from: string, to: string) {
  const rows = await query<{ day: string; volume_kg: Numeric }>(
    userId,
    `SELECT TO_CHAR(e.entry_date, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(${setLoadSql('e', 's')} * s.reps), 0) AS volume_kg
       FROM public.exercise_entry_sets s
       JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
       ${bodyWeightJoinSql('e')}
      WHERE e.user_id = $1 AND e.entry_date BETWEEN $2 AND $3
        AND e.exercise_name != 'Active Calories'
      GROUP BY e.entry_date
      ORDER BY e.entry_date ASC`,
    [userId, from, to]
  );
  return rows.map((r) => ({ day: r.day, volumeKg: num(r.volume_kg) }));
}

/** The earliest day with any logged exercise, or null. Takes no range. */
async function getExerciseFirstDay(userId: string) {
  const rows = await query<{ day: string | null }>(
    userId,
    `SELECT TO_CHAR(MIN(entry_date), 'YYYY-MM-DD') AS day
       FROM exercise_entries
      WHERE user_id = $1
        AND exercise_name != 'Active Calories'`,
    [userId]
  );
  return rows[0]?.day ?? null;
}

async function getCheckInDays(userId: string, from: string, to: string) {
  const rows = await query<{
    day: string;
    weight: Numeric | null;
    steps: Numeric | null;
  }>(
    userId,
    `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS day, weight, steps
       FROM check_in_measurements
      WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
      ORDER BY entry_date ASC`,
    [userId, from, to]
  );
  return rows.map((r) => ({
    day: r.day,
    weight: numOrNull(r.weight),
    steps: numOrNull(r.steps),
  }));
}

/** Days with at least one food entry. Supplements alone do not make a food day: a vitamin-only day would read as a near-zero intake. */
async function getFoodLoggedDays(
  userId: string,
  from: string,
  to: string
): Promise<string[]> {
  const rows = await query<{ day: string }>(
    userId,
    `SELECT DISTINCT TO_CHAR(entry_date, 'YYYY-MM-DD') AS day
       FROM food_entries
      WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
      ORDER BY day ASC`,
    [userId, from, to]
  );
  return rows.map((r) => r.day);
}

export {
  getManualMoodDays,
  getMainSleepDays,
  getMeditationDays,
  getMeditationFirstDay,
  getCardioMinuteDays,
  getStrengthVolumeDays,
  getExerciseFirstDay,
  getCheckInDays,
  getFoodLoggedDays,
};
export default {
  getManualMoodDays,
  getMainSleepDays,
  getMeditationDays,
  getMeditationFirstDay,
  getCardioMinuteDays,
  getStrengthVolumeDays,
  getExerciseFirstDay,
  getCheckInDays,
  getFoodLoggedDays,
};
