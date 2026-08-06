import { getClient } from '../db/poolManager.js';
import {
  HealthMetric,
  HealthMetricSamples,
  HealthMetricSamplesInitializer,
  VitalsEntries,
  VitalsEntriesInitializer,
  DailyHealthMetrics,
  DailyHealthMetricsInitializer,
} from '@workspace/shared';

/** Minimal client surface needed to run a parameterised statement within a caller-owned transaction. */
export interface HealthMetricSamplesDbClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
}

/**
 * Repository for continuous intraday health telemetry and daily summary metrics.
 */

// 1. Health Metric Samples (heart_rate / hrv / respiration / spo2 / stress /
// body_battery) — one row per (user, metric, entry_date, source_provider),
// holding the whole day's readings as a JSONB array. Replaces the four former
// per-sample tables (heart_rate_entries, hrv_entries, respiration_entries,
// spo2_entries); see PLAN/telemetry_redesign_phase_1_database.md.
//
// The upsert REPLACES the day's array (samples = EXCLUDED.samples), not merges
// it. Correct for Garmin, which returns the full day on every sync, and keeps
// re-syncs idempotent. A future provider delivering partial-day increments
// would need merge-on-conflict instead of this replace semantics.
export async function upsertHealthMetricSamples(
  userId: string,
  actingUserId: string,
  row: HealthMetricSamplesInitializer
): Promise<HealthMetricSamples> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `INSERT INTO health_metric_samples
        (user_id, metric, entry_date, source_provider, device_name, samples)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT uq_health_metric_samples
       DO UPDATE SET
         samples = EXCLUDED.samples,
         device_name = COALESCE(EXCLUDED.device_name, health_metric_samples.device_name),
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        row.metric,
        row.entry_date,
        row.source_provider,
        row.device_name || null,
        JSON.stringify(row.samples),
      ]
    )) as { rows: HealthMetricSamples[] };
    return res.rows[0];
  } finally {
    if (client && typeof client.release === 'function') client.release();
  }
}

export async function getHealthMetricSamples(
  userId: string,
  actingUserId: string,
  metric: HealthMetric,
  startDate: string,
  endDate: string
): Promise<HealthMetricSamples[]> {
  const client = await getClient(actingUserId);
  try {
    const res = (await client.query(
      `SELECT * FROM health_metric_samples
       WHERE user_id = $1 AND metric = $2 AND entry_date BETWEEN $3 AND $4
       ORDER BY entry_date ASC`,
      [userId, metric, startDate, endDate]
    )) as { rows: HealthMetricSamples[] };
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Transaction-scoped advisory lock keyed to one (user, metric, day, provider)
 * slot, released automatically on COMMIT or ROLLBACK.
 *
 * SELECT ... FOR UPDATE (below) only serializes against a row that already
 * exists. The first write for a given key has no row to lock — two concurrent
 * "first writes" would both see no existing row, both merge onto an empty
 * baseline, and the later INSERT's `samples = EXCLUDED.samples` would silently
 * discard the earlier write's samples instead of merging with them. Callers
 * must acquire this lock before the FOR UPDATE read so the second transaction
 * blocks until the first commits, and then sees the row the first one just
 * inserted.
 */
export async function acquireHealthMetricSampleLockWithClient(
  client: HealthMetricSamplesDbClient,
  userId: string,
  metric: HealthMetric,
  entryDate: string,
  sourceProvider: string
): Promise<void> {
  const key = `${userId}:${metric}:${entryDate}:${sourceProvider}`;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

/**
 * Row-locking read for the merge-write path: FOR UPDATE blocks a concurrent
 * writer targeting the same (user, metric, day, provider) row until this
 * transaction commits, so it always merges onto the latest data rather than a
 * stale snapshot. Callers in a `merge` write must call
 * acquireHealthMetricSampleLockWithClient first — this alone does not cover
 * the case where no row exists yet (see that function's docs).
 */
export async function getHealthMetricSampleRowForUpdateWithClient(
  client: HealthMetricSamplesDbClient,
  userId: string,
  metric: HealthMetric,
  entryDate: string,
  sourceProvider: string
): Promise<HealthMetricSamples | null> {
  const res = (await client.query(
    `SELECT * FROM health_metric_samples
     WHERE user_id = $1 AND metric = $2 AND entry_date = $3 AND source_provider = $4
     FOR UPDATE`,
    [userId, metric, entryDate, sourceProvider]
  )) as { rows: HealthMetricSamples[] };
  return res.rows[0] ?? null;
}

/** Same upsert as upsertHealthMetricSamples, but on a caller-supplied (and caller-committed) client. */
export async function upsertHealthMetricSamplesWithClient(
  client: HealthMetricSamplesDbClient,
  userId: string,
  row: HealthMetricSamplesInitializer
): Promise<HealthMetricSamples> {
  const res = (await client.query(
    `INSERT INTO health_metric_samples
      (user_id, metric, entry_date, source_provider, device_name, samples)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT uq_health_metric_samples
     DO UPDATE SET
       samples = EXCLUDED.samples,
       device_name = COALESCE(EXCLUDED.device_name, health_metric_samples.device_name),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      row.metric,
      row.entry_date,
      row.source_provider,
      row.device_name || null,
      JSON.stringify(row.samples),
    ]
  )) as { rows: HealthMetricSamples[] };
  return res.rows[0];
}

// 2. Vitals Entries
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
         ON CONFLICT (user_id, source_provider, timestamp)
         DO UPDATE SET
           systolic_mmhg = COALESCE(EXCLUDED.systolic_mmhg, vitals_entries.systolic_mmhg),
           diastolic_mmhg = COALESCE(EXCLUDED.diastolic_mmhg, vitals_entries.diastolic_mmhg),
           blood_glucose_mgdl = COALESCE(EXCLUDED.blood_glucose_mgdl, vitals_entries.blood_glucose_mgdl),
           body_temperature_celsius = COALESCE(EXCLUDED.body_temperature_celsius, vitals_entries.body_temperature_celsius),
           meal_context = COALESCE(EXCLUDED.meal_context, vitals_entries.meal_context),
           device_name = COALESCE(EXCLUDED.device_name, vitals_entries.device_name),
           external_id = COALESCE(EXCLUDED.external_id, vitals_entries.external_id)
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

// 3. Daily Health Metrics (Wearable daily summaries & scores)
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
