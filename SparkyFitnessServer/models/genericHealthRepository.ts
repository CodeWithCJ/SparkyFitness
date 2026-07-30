import { getClient } from '../db/poolManager.js';
import {
  HeartRateEntries,
  HeartRateEntriesInitializer,
  HrvEntries,
  HrvEntriesInitializer,
  RespirationEntries,
  RespirationEntriesInitializer,
  Spo2Entries,
  Spo2EntriesInitializer,
  VitalsEntries,
  VitalsEntriesInitializer,
  DailyHealthMetrics,
  DailyHealthMetricsInitializer,
} from '@workspace/shared';

/**
 * Repository for continuous intraday health telemetry and daily summary metrics.
 */

// 1. Heart Rate Entries
export async function bulkUpsertHeartRate(
  userId: string,
  actingUserId: string,
  entries: HeartRateEntriesInitializer[]
): Promise<HeartRateEntries[]> {
  if (!entries || entries.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const results: HeartRateEntries[] = [];

    for (const entry of entries) {
      const res = (await client.query(
        `INSERT INTO heart_rate_entries 
          (user_id, entry_date, timestamp, heart_rate_bpm, context, sleep_entry_id, exercise_entry_id, source_provider, device_name, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, source_provider, timestamp) 
         DO UPDATE SET 
           heart_rate_bpm = EXCLUDED.heart_rate_bpm,
           context = COALESCE(EXCLUDED.context, heart_rate_entries.context),
           sleep_entry_id = COALESCE(EXCLUDED.sleep_entry_id, heart_rate_entries.sleep_entry_id),
           exercise_entry_id = COALESCE(EXCLUDED.exercise_entry_id, heart_rate_entries.exercise_entry_id),
           device_name = COALESCE(EXCLUDED.device_name, heart_rate_entries.device_name),
           external_id = COALESCE(EXCLUDED.external_id, heart_rate_entries.external_id)
         RETURNING *`,
        [
          userId,
          entry.entry_date,
          entry.timestamp,
          entry.heart_rate_bpm,
          entry.context || 'unspecified',
          entry.sleep_entry_id || null,
          entry.exercise_entry_id || null,
          entry.source_provider,
          entry.device_name || null,
          entry.external_id || null,
        ]
      )) as { rows: HeartRateEntries[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function getHeartRateEntries(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<HeartRateEntries[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM heart_rate_entries 
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY timestamp ASC`,
      [userId, startDate, endDate]
    )) as { rows: HeartRateEntries[] };
    return res.rows;
  } finally {
    client.release();
  }
}

// 2. HRV Entries
export async function bulkUpsertHrv(
  userId: string,
  actingUserId: string,
  entries: HrvEntriesInitializer[]
): Promise<HrvEntries[]> {
  if (!entries || entries.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const results: HrvEntries[] = [];

    for (const entry of entries) {
      const res = (await client.query(
        `INSERT INTO hrv_entries 
          (user_id, entry_date, timestamp, hrv_rmssd_ms, hrv_sdnn_ms, status, sleep_entry_id, exercise_entry_id, source_provider, device_name, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (user_id, source_provider, timestamp) 
         DO UPDATE SET 
           hrv_rmssd_ms = COALESCE(EXCLUDED.hrv_rmssd_ms, hrv_entries.hrv_rmssd_ms),
           hrv_sdnn_ms = COALESCE(EXCLUDED.hrv_sdnn_ms, hrv_entries.hrv_sdnn_ms),
           status = COALESCE(EXCLUDED.status, hrv_entries.status),
           sleep_entry_id = COALESCE(EXCLUDED.sleep_entry_id, hrv_entries.sleep_entry_id),
           exercise_entry_id = COALESCE(EXCLUDED.exercise_entry_id, hrv_entries.exercise_entry_id),
           device_name = COALESCE(EXCLUDED.device_name, hrv_entries.device_name),
           external_id = COALESCE(EXCLUDED.external_id, hrv_entries.external_id)
         RETURNING *`,
        [
          userId,
          entry.entry_date,
          entry.timestamp,
          entry.hrv_rmssd_ms ?? null,
          entry.hrv_sdnn_ms ?? null,
          entry.status || null,
          entry.sleep_entry_id || null,
          entry.exercise_entry_id || null,
          entry.source_provider,
          entry.device_name || null,
          entry.external_id || null,
        ]
      )) as { rows: HrvEntries[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
  } finally {
    client.release();
  }
}

export async function getHrvEntries(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<HrvEntries[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM hrv_entries 
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY timestamp ASC`,
      [userId, startDate, endDate]
    )) as { rows: HrvEntries[] };
    return res.rows;
  } finally {
    client.release();
  }
}

// 3. Respiration Entries
export async function bulkUpsertRespiration(
  userId: string,
  actingUserId: string,
  entries: RespirationEntriesInitializer[]
): Promise<RespirationEntries[]> {
  if (!entries || entries.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const results: RespirationEntries[] = [];

    for (const entry of entries) {
      const res = (await client.query(
        `INSERT INTO respiration_entries 
          (user_id, entry_date, timestamp, breaths_per_minute, context, sleep_entry_id, exercise_entry_id, source_provider, device_name, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, source_provider, timestamp) 
         DO UPDATE SET 
           breaths_per_minute = EXCLUDED.breaths_per_minute,
           context = COALESCE(EXCLUDED.context, respiration_entries.context),
           sleep_entry_id = COALESCE(EXCLUDED.sleep_entry_id, respiration_entries.sleep_entry_id),
           exercise_entry_id = COALESCE(EXCLUDED.exercise_entry_id, respiration_entries.exercise_entry_id),
           device_name = COALESCE(EXCLUDED.device_name, respiration_entries.device_name),
           external_id = COALESCE(EXCLUDED.external_id, respiration_entries.external_id)
         RETURNING *`,
        [
          userId,
          entry.entry_date,
          entry.timestamp,
          entry.breaths_per_minute,
          entry.context || 'unspecified',
          entry.sleep_entry_id || null,
          entry.exercise_entry_id || null,
          entry.source_provider,
          entry.device_name || null,
          entry.external_id || null,
        ]
      )) as { rows: RespirationEntries[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
  } finally {
    client.release();
  }
}

export async function getRespirationEntries(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<RespirationEntries[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM respiration_entries 
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY timestamp ASC`,
      [userId, startDate, endDate]
    )) as { rows: RespirationEntries[] };
    return res.rows;
  } finally {
    client.release();
  }
}

// 4. SpO2 Entries
export async function bulkUpsertSpo2(
  userId: string,
  actingUserId: string,
  entries: Spo2EntriesInitializer[]
): Promise<Spo2Entries[]> {
  if (!entries || entries.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const results: Spo2Entries[] = [];

    for (const entry of entries) {
      const res = (await client.query(
        `INSERT INTO spo2_entries 
          (user_id, entry_date, timestamp, spo2_percentage, sleep_entry_id, exercise_entry_id, source_provider, device_name, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, source_provider, timestamp) 
         DO UPDATE SET 
           spo2_percentage = EXCLUDED.spo2_percentage,
           sleep_entry_id = COALESCE(EXCLUDED.sleep_entry_id, spo2_entries.sleep_entry_id),
           exercise_entry_id = COALESCE(EXCLUDED.exercise_entry_id, spo2_entries.exercise_entry_id),
           device_name = COALESCE(EXCLUDED.device_name, spo2_entries.device_name),
           external_id = COALESCE(EXCLUDED.external_id, spo2_entries.external_id)
         RETURNING *`,
        [
          userId,
          entry.entry_date,
          entry.timestamp,
          entry.spo2_percentage,
          entry.sleep_entry_id || null,
          entry.exercise_entry_id || null,
          entry.source_provider,
          entry.device_name || null,
          entry.external_id || null,
        ]
      )) as { rows: Spo2Entries[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
  } finally {
    client.release();
  }
}

export async function getSpo2Entries(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<Spo2Entries[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM spo2_entries 
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY timestamp ASC`,
      [userId, startDate, endDate]
    )) as { rows: Spo2Entries[] };
    return res.rows;
  } finally {
    client.release();
  }
}

// 5. Vitals Entries
export async function bulkUpsertVitals(
  userId: string,
  actingUserId: string,
  entries: VitalsEntriesInitializer[]
): Promise<VitalsEntries[]> {
  if (!entries || entries.length === 0) return [];
  const client = await getClient(actingUserId);
  try {
    const results: VitalsEntries[] = [];

    for (const entry of entries) {
      const res = (await client.query(
        `INSERT INTO vitals_entries 
          (user_id, entry_date, timestamp, systolic_mmhg, diastolic_mmhg, blood_glucose_mgdl, body_temperature_celsius, meal_context, source_provider, device_name, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          userId,
          entry.entry_date,
          entry.timestamp,
          entry.systolic_mmhg ?? null,
          entry.diastolic_mmhg ?? null,
          entry.blood_glucose_mgdl ?? null,
          entry.body_temperature_celsius ?? null,
          entry.meal_context || null,
          entry.source_provider,
          entry.device_name || null,
          entry.external_id || null,
        ]
      )) as { rows: VitalsEntries[] };
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
  } finally {
    client.release();
  }
}

export async function getVitalsEntries(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<VitalsEntries[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM vitals_entries 
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY timestamp ASC`,
      [userId, startDate, endDate]
    )) as { rows: VitalsEntries[] };
    return res.rows;
  } finally {
    client.release();
  }
}

// 6. Daily Health Metrics (Wearable daily summaries & scores)
export async function upsertDailyHealthMetrics(
  userId: string,
  actingUserId: string,
  metric: DailyHealthMetricsInitializer
): Promise<DailyHealthMetrics> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `INSERT INTO daily_health_metrics 
        (user_id, entry_date, source_provider, device_name, total_steps, step_goal, total_distance_meters,
         floors_ascended, floors_descended, active_calories, bmr_calories, total_calories, highly_active_seconds,
         active_seconds, sedentary_seconds, moderate_intensity_minutes, vigorous_intensity_minutes, exercise_minutes,
         stand_hours, resting_heart_rate, heart_rate_recovery_1min, vo2_max, fitness_age, lactate_threshold_bpm,
         lactate_threshold_speed_mps, walking_asymmetry_percentage, hill_score, race_prediction_5k_seconds,
         race_prediction_10k_seconds, race_prediction_half_marathon_seconds, race_prediction_marathon_seconds,
         recovery_time_hours, training_readiness_score, endurance_score, weekly_training_load, acute_training_load,
         chronic_training_load, acwr_ratio, avg_stress_level, max_stress_level, body_battery_charged, body_battery_drained,
         body_battery_highest, body_battery_lowest, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, NOW())
       ON CONFLICT (user_id, entry_date, source_provider)
       DO UPDATE SET
         device_name = COALESCE(EXCLUDED.device_name, daily_health_metrics.device_name),
         total_steps = COALESCE(EXCLUDED.total_steps, daily_health_metrics.total_steps),
         step_goal = COALESCE(EXCLUDED.step_goal, daily_health_metrics.step_goal),
         total_distance_meters = COALESCE(EXCLUDED.total_distance_meters, daily_health_metrics.total_distance_meters),
         floors_ascended = COALESCE(EXCLUDED.floors_ascended, daily_health_metrics.floors_ascended),
         floors_descended = COALESCE(EXCLUDED.floors_descended, daily_health_metrics.floors_descended),
         active_calories = COALESCE(EXCLUDED.active_calories, daily_health_metrics.active_calories),
         bmr_calories = COALESCE(EXCLUDED.bmr_calories, daily_health_metrics.bmr_calories),
         total_calories = COALESCE(EXCLUDED.total_calories, daily_health_metrics.total_calories),
         highly_active_seconds = COALESCE(EXCLUDED.highly_active_seconds, daily_health_metrics.highly_active_seconds),
         active_seconds = COALESCE(EXCLUDED.active_seconds, daily_health_metrics.active_seconds),
         sedentary_seconds = COALESCE(EXCLUDED.sedentary_seconds, daily_health_metrics.sedentary_seconds),
         moderate_intensity_minutes = COALESCE(EXCLUDED.moderate_intensity_minutes, daily_health_metrics.moderate_intensity_minutes),
         vigorous_intensity_minutes = COALESCE(EXCLUDED.vigorous_intensity_minutes, daily_health_metrics.vigorous_intensity_minutes),
         exercise_minutes = COALESCE(EXCLUDED.exercise_minutes, daily_health_metrics.exercise_minutes),
         stand_hours = COALESCE(EXCLUDED.stand_hours, daily_health_metrics.stand_hours),
         resting_heart_rate = COALESCE(EXCLUDED.resting_heart_rate, daily_health_metrics.resting_heart_rate),
         heart_rate_recovery_1min = COALESCE(EXCLUDED.heart_rate_recovery_1min, daily_health_metrics.heart_rate_recovery_1min),
         vo2_max = COALESCE(EXCLUDED.vo2_max, daily_health_metrics.vo2_max),
         fitness_age = COALESCE(EXCLUDED.fitness_age, daily_health_metrics.fitness_age),
         lactate_threshold_bpm = COALESCE(EXCLUDED.lactate_threshold_bpm, daily_health_metrics.lactate_threshold_bpm),
         lactate_threshold_speed_mps = COALESCE(EXCLUDED.lactate_threshold_speed_mps, daily_health_metrics.lactate_threshold_speed_mps),
         walking_asymmetry_percentage = COALESCE(EXCLUDED.walking_asymmetry_percentage, daily_health_metrics.walking_asymmetry_percentage),
         hill_score = COALESCE(EXCLUDED.hill_score, daily_health_metrics.hill_score),
         race_prediction_5k_seconds = COALESCE(EXCLUDED.race_prediction_5k_seconds, daily_health_metrics.race_prediction_5k_seconds),
         race_prediction_10k_seconds = COALESCE(EXCLUDED.race_prediction_10k_seconds, daily_health_metrics.race_prediction_10k_seconds),
         race_prediction_half_marathon_seconds = COALESCE(EXCLUDED.race_prediction_half_marathon_seconds, daily_health_metrics.race_prediction_half_marathon_seconds),
         race_prediction_marathon_seconds = COALESCE(EXCLUDED.race_prediction_marathon_seconds, daily_health_metrics.race_prediction_marathon_seconds),
         recovery_time_hours = COALESCE(EXCLUDED.recovery_time_hours, daily_health_metrics.recovery_time_hours),
         training_readiness_score = COALESCE(EXCLUDED.training_readiness_score, daily_health_metrics.training_readiness_score),
         endurance_score = COALESCE(EXCLUDED.endurance_score, daily_health_metrics.endurance_score),
         weekly_training_load = COALESCE(EXCLUDED.weekly_training_load, daily_health_metrics.weekly_training_load),
         acute_training_load = COALESCE(EXCLUDED.acute_training_load, daily_health_metrics.acute_training_load),
         chronic_training_load = COALESCE(EXCLUDED.chronic_training_load, daily_health_metrics.chronic_training_load),
         acwr_ratio = COALESCE(EXCLUDED.acwr_ratio, daily_health_metrics.acwr_ratio),
         avg_stress_level = COALESCE(EXCLUDED.avg_stress_level, daily_health_metrics.avg_stress_level),
         max_stress_level = COALESCE(EXCLUDED.max_stress_level, daily_health_metrics.max_stress_level),
         body_battery_charged = COALESCE(EXCLUDED.body_battery_charged, daily_health_metrics.body_battery_charged),
         body_battery_drained = COALESCE(EXCLUDED.body_battery_drained, daily_health_metrics.body_battery_drained),
         body_battery_highest = COALESCE(EXCLUDED.body_battery_highest, daily_health_metrics.body_battery_highest),
         body_battery_lowest = COALESCE(EXCLUDED.body_battery_lowest, daily_health_metrics.body_battery_lowest),
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        metric.entry_date,
        metric.source_provider,
        metric.device_name || null,
        metric.total_steps ?? null,
        metric.step_goal ?? null,
        metric.total_distance_meters ?? null,
        metric.floors_ascended ?? null,
        metric.floors_descended ?? null,
        metric.active_calories ?? null,
        metric.bmr_calories ?? null,
        metric.total_calories ?? null,
        metric.highly_active_seconds ?? null,
        metric.active_seconds ?? null,
        metric.sedentary_seconds ?? null,
        metric.moderate_intensity_minutes ?? null,
        metric.vigorous_intensity_minutes ?? null,
        metric.exercise_minutes ?? null,
        metric.stand_hours ?? null,
        metric.resting_heart_rate ?? null,
        metric.heart_rate_recovery_1min ?? null,
        metric.vo2_max ?? null,
        metric.fitness_age ?? null,
        metric.lactate_threshold_bpm ?? null,
        metric.lactate_threshold_speed_mps ?? null,
        metric.walking_asymmetry_percentage ?? null,
        metric.hill_score ?? null,
        metric.race_prediction_5k_seconds ?? null,
        metric.race_prediction_10k_seconds ?? null,
        metric.race_prediction_half_marathon_seconds ?? null,
        metric.race_prediction_marathon_seconds ?? null,
        metric.recovery_time_hours ?? null,
        metric.training_readiness_score ?? null,
        metric.endurance_score ?? null,
        metric.weekly_training_load ?? null,
        metric.acute_training_load ?? null,
        metric.chronic_training_load ?? null,
        metric.acwr_ratio ?? null,
        metric.avg_stress_level ?? null,
        metric.max_stress_level ?? null,
        metric.body_battery_charged ?? null,
        metric.body_battery_drained ?? null,
        metric.body_battery_highest ?? null,
        metric.body_battery_lowest ?? null,
      ]
    )) as { rows: DailyHealthMetrics[] };
    return res.rows[0];
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function getDailyHealthMetrics(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<DailyHealthMetrics[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM daily_health_metrics 
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    )) as { rows: DailyHealthMetrics[] };
    return res.rows;
  } finally {
    client.release();
  }
}
