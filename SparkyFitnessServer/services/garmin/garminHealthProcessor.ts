import { log } from '../../config/logging.js';
import measurementService from '../measurementService.js';
import moodRepository from '../../models/moodRepository.js';
import sleepRepository from '../../models/sleepRepository.js';
import foodRepository from '../../models/food.js';
import foodEntryRepository from '../../models/foodEntry.js';
import mealTypeRepository from '../../models/mealType.js';
import * as genericHealthRepo from '../../models/genericHealthRepository.js';
import { getClient } from '../../db/poolManager.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { num, str, toUtcInstant } from './garminTelemetryExtractors.js';
// Shared with the generic /api/health-data workout path; Garmin keeps the
// default 'replace' mode because it re-fetches the whole day on every sync.
import { upsertSamplesByDay } from '../healthMetricSampleWriter.js';
import { localDateTimeToUtc, instantToDay } from '@workspace/shared';

interface ActivityWindow {
  id: string;
  startMs: number;
  endMs: number;
}

/**
 * Loads this user's exercise and sleep windows for the given day range, as
 * absolute [startMs, endMs] instants, for tagging intraday wellness samples
 * with the exercise_entry/sleep_entry they fall inside (the `ex`/`sl` keys on
 * a health_metric_samples row). Exercise entries store a local wall-clock
 * entry_time, not an instant, so it's converted via the user's timezone;
 * entries missing entry_time (no known start clock time) are skipped rather
 * than guessed at. Sleep's bedtime/wake_time are already absolute instants.
 */
async function loadActivityWindows(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string
): Promise<{ exercise: ActivityWindow[]; sleep: ActivityWindow[] }> {
  const tz = await loadUserTimezone(userId);
  // Explicit (owner, actor) rather than a single argument. RLS keys off
  // app.authenticated_user_id — the second argument — which previously
  // resolved to the actor only via AsyncLocalStorage or the single-argument
  // fallback. Cron-driven syncs run outside a request and so have no ALS
  // context, and app.user_id should name the data owner regardless.
  const client = await getClient(userId, actingUserId);
  try {
    const exerciseRes = await client.query(
      `SELECT id, entry_date, entry_time, duration_minutes
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 AND entry_time IS NOT NULL`,
      [userId, startDate, endDate]
    );
    const exercise: ActivityWindow[] = [];
    for (const row of exerciseRes.rows as Array<{
      id: string;
      entry_date: string;
      entry_time: string;
      duration_minutes: number | null;
    }>) {
      const start = localDateTimeToUtc(
        `${row.entry_date}T${row.entry_time}`,
        tz
      );
      const startMs = start.getTime();
      if (Number.isNaN(startMs)) continue;
      const endMs = startMs + Math.max(0, row.duration_minutes ?? 0) * 60000;
      exercise.push({ id: row.id, startMs, endMs });
    }

    const sleepRes = await client.query(
      `SELECT id, bedtime, wake_time
       FROM sleep_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3`,
      [userId, startDate, endDate]
    );
    const sleep: ActivityWindow[] = (
      sleepRes.rows as Array<{
        id: string;
        bedtime: Date;
        wake_time: Date;
      }>
    ).map((row) => ({
      id: row.id,
      startMs: new Date(row.bedtime).getTime(),
      endMs: new Date(row.wake_time).getTime(),
    }));

    return { exercise, sleep };
  } finally {
    client.release();
  }
}

/**
 * Finds which window (if any) contains a timestamp. Deliberately NOT
 * findGroupForTimestamp from garminTelemetryExtractors.ts: that function falls
 * back to the first group when nothing matches, which is correct for
 * distributing a workout's own laps/GPS across its child exercises (some
 * exercise is always the right answer) but wrong here — a background reading
 * outside every window must stay unlinked, not get force-attached to the day's
 * first workout or sleep session.
 */
function matchActivityWindow(
  windows: ActivityWindow[],
  timestampMs: number
): string | undefined {
  return windows.find((w) => timestampMs >= w.startMs && timestampMs <= w.endMs)
    ?.id;
}

interface ProcessedResult {
  type: string;
  status: string;
  count?: number;
  buckets?: number;
  date?: string;
  message?: string;
}

interface ProcessError {
  type: string;
  status: string;
  date?: string;
  message: string;
}

export async function processGarminHealthAndWellnessData(
  userId: string,
  actingUserId: string,
  healthData: Record<string, any>,
  startDate: string,
  endDate: string
) {
  log(
    'info',
    `[garminHealthProcessor] Processing Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}.`
  );
  const processedResults: ProcessedResult[] = [];
  const errors: ProcessError[] = [];
  // Used to bucket sample instants onto the user's calendar day. UTC slicing
  // puts a late-evening reading on the following day for any timezone ahead of
  // UTC (and the previous day for those behind).
  const userTz = await loadUserTimezone(userId);

  try {
    // Process Stress Data
    if (healthData.stress && Array.isArray(healthData.stress)) {
      for (const stressEntry of healthData.stress) {
        const {
          date,
          raw_stress_data,
          derived_mood_value,
          derived_mood_notes,
        } = stressEntry;

        if (raw_stress_data) {
          try {
            const customCategory =
              await measurementService.getOrCreateCustomCategory(
                userId,
                actingUserId,
                'Raw Stress Data',
                'text',
                'JSON'
              );
            await measurementService.upsertCustomMeasurementEntry(
              userId,
              actingUserId,
              {
                category_id: customCategory.id,
                value: raw_stress_data,
                entry_date: date,
                notes: 'Source: Garmin',
                source: 'garmin',
              }
            );
            processedResults.push({
              type: 'raw_stress_data',
              status: 'success',
              date,
            });
          } catch (error: unknown) {
            log(
              'error',
              `Error storing raw stress data for user ${userId} on ${date}:`,
              error
            );
            errors.push({
              type: 'raw_stress_data',
              status: 'error',
              date,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (derived_mood_value !== null && derived_mood_value !== undefined) {
          try {
            await moodRepository.createOrUpdateMoodEntry(
              userId,
              derived_mood_value,
              derived_mood_notes,
              date
            );
            processedResults.push({
              type: 'derived_mood_value',
              status: 'success',
              date,
            });
          } catch (error: unknown) {
            log(
              'error',
              `Error storing derived mood value for user ${userId} on ${date}:`,
              error
            );
            errors.push({
              type: 'derived_mood_value',
              status: 'error',
              date,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    // 1. Consolidate & Process Daily Health Metrics
    const datesToProcess = new Set<string>();
    if (healthData.daily_summary)
      healthData.daily_summary.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    if (healthData.body_battery)
      healthData.body_battery.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    if (healthData.steps)
      healthData.steps.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    if (healthData.total_distance)
      healthData.total_distance.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    // Additional per-day metrics that may arrive without a matching daily_summary/
    // body_battery/steps/total_distance entry for the same date (e.g. a rest day still
    // has a training-readiness or recovery-time reading).
    const additionalDailyArrays = [
      'lactate_threshold',
      'race_predictions',
      'fitness_age',
      'hill_score',
      'endurance_score',
      'max_metrics',
      'training_readiness',
      'recovery_time',
      'intensity_minutes',
      'floors',
      'training_load',
      'acute_load',
    ];
    for (const key of additionalDailyArrays) {
      if (Array.isArray(healthData[key])) {
        healthData[key].forEach(
          (d: { date?: string }) => d.date && datesToProcess.add(d.date)
        );
      }
    }

    for (const dateStr of datesToProcess) {
      try {
        const bbItem = (healthData.body_battery || []).find(
          (b: { date: string }) => b.date === dateStr
        );
        const stepsItem = (healthData.steps || []).find(
          (s: { date: string }) => s.date === dateStr
        );
        const distItem = (healthData.total_distance || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const stressItem = (healthData.stress || []).find(
          (s: { date: string }) => s.date === dateStr
        );
        const summaryItem =
          (healthData.daily_summary || []).find(
            (s: { date: string }) => s.date === dateStr
          ) || {};
        const lactateItem = (healthData.lactate_threshold || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const raceItem = (healthData.race_predictions || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const fitnessAgeItem = (healthData.fitness_age || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const hillScoreItem = (healthData.hill_score || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const enduranceItem = (healthData.endurance_score || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const maxMetricsItem = (healthData.max_metrics || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const trainingReadinessItem = (
          healthData.training_readiness || []
        ).find((d: { date: string }) => d.date === dateStr);
        const recoveryTimeItem = (healthData.recovery_time || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const intensityItem = (healthData.intensity_minutes || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const floorsItem = (healthData.floors || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const trainingLoadItem = (healthData.training_load || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const acuteLoadItem = (healthData.acute_load || []).find(
          (d: { date: string }) => d.date === dateStr
        );

        const totalSteps =
          stepsItem?.value ??
          stepsItem?.steps ??
          summaryItem?.total_steps ??
          null;
        const distKm = distItem?.value ?? summaryItem?.total_distance ?? null;

        const acuteLoad =
          trainingLoadItem?.daily_acute_training_load ??
          acuteLoadItem?.value ??
          null;
        const chronicLoad =
          trainingLoadItem?.daily_chronic_training_load ?? null;
        const acwrRatio =
          acuteLoad !== null && chronicLoad !== null && Number(chronicLoad) > 0
            ? Number(acuteLoad) / Number(chronicLoad)
            : null;

        await genericHealthRepo.upsertDailyHealthMetrics(userId, actingUserId, {
          user_id: userId,
          entry_date: dateStr,
          source_provider: 'garmin',
          total_steps:
            totalSteps !== null && totalSteps !== undefined
              ? Number(totalSteps)
              : null,
          total_distance_meters:
            distKm !== null && distKm !== undefined
              ? Math.round(Number(distKm) * 1000)
              : null,
          floors_ascended: floorsItem?.floors_ascended ?? null,
          floors_descended: floorsItem?.floors_descended ?? null,
          active_calories: summaryItem.active_calories ?? null,
          bmr_calories: summaryItem.bmr_calories ?? null,
          resting_heart_rate: summaryItem.resting_heart_rate ?? null,
          exercise_minutes: intensityItem?.total_intensity_minutes ?? null,
          body_battery_highest:
            bbItem?.body_battery_highest ??
            summaryItem.body_battery_highest ??
            null,
          body_battery_lowest:
            bbItem?.body_battery_lowest ??
            summaryItem.body_battery_lowest ??
            null,
          body_battery_charged:
            bbItem?.body_battery_charged ??
            summaryItem.body_battery_charged ??
            null,
          body_battery_drained:
            bbItem?.body_battery_drained ??
            summaryItem.body_battery_drained ??
            null,
          // NOT stressItem?.derived_mood_value — that's an inverted 0-100 mood
          // score for a different feature (mood tracking), not a stress
          // percentage; using it here would mislabel mood data as stress.
          avg_stress_level:
            summaryItem.avg_stress_level ??
            stressItem?.average_stress_level ??
            null,
          max_stress_level: summaryItem.max_stress_level ?? null,
          vo2_max: maxMetricsItem?.vo2_max ?? summaryItem.vo2_max ?? null,
          fitness_age: fitnessAgeItem?.fitness_age ?? null,
          lactate_threshold_bpm: lactateItem?.lactate_threshold_hr ?? null,
          hill_score: hillScoreItem?.hill_score ?? null,
          endurance_score: enduranceItem?.endurance_score ?? null,
          race_prediction_5k_seconds: raceItem?.race_prediction_5k ?? null,
          race_prediction_10k_seconds: raceItem?.race_prediction_10k ?? null,
          race_prediction_half_marathon_seconds:
            raceItem?.race_prediction_half_marathon ?? null,
          race_prediction_marathon_seconds:
            raceItem?.race_prediction_marathon ?? null,
          training_readiness_score:
            trainingReadinessItem?.training_readiness_score ??
            summaryItem.training_readiness_score ??
            null,
          recovery_time_hours:
            recoveryTimeItem?.value ?? summaryItem.recovery_time_hours ?? null,
          weekly_training_load: trainingLoadItem?.weekly_training_load ?? null,
          acute_training_load: acuteLoad,
          chronic_training_load: chronicLoad,
          acwr_ratio: acwrRatio,
        });
        processedResults.push({
          type: 'daily_health_metrics',
          status: 'success',
          date: dateStr,
        });
      } catch (err) {
        log(
          'error',
          `Error storing daily health metrics for user ${userId} on ${dateStr}:`,
          err
        );
        errors.push({
          type: 'daily_health_metrics',
          status: 'error',
          date: dateStr,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Load this sync's exercise/sleep windows once, for tagging every intraday
    // sample below with the ex/sl activity it falls inside (see
    // loadActivityWindows / matchActivityWindow above).
    const activityWindows = await loadActivityWindows(
      userId,
      actingUserId,
      startDate,
      endDate
    );
    const tagActivity = (timestamp: Date) => {
      const ms = timestamp.getTime();
      return {
        ex: matchActivityWindow(activityWindows.exercise, ms),
        sl: matchActivityWindow(activityWindows.sleep, ms),
      };
    };

    // 2. Intraday Heart Rate -> health_metric_samples (metric: 'heart_rate')
    const rawHrPayload = healthData.heart_rates || healthData.heart_rate || [];
    const hrSamples: Array<{
      entry_date: string;
      timestamp: Date;
      ex?: string;
      sl?: string;
      device_name: string;
      bpm: number;
      context: string;
    }> = [];

    if (Array.isArray(rawHrPayload)) {
      for (const item of rawHrPayload) {
        if (item.HeartRate && Array.isArray(item.HeartRate)) {
          for (const sample of item.HeartRate) {
            if (sample.time && sample.data) {
              const timestamp = new Date(sample.time);
              hrSamples.push({
                entry_date: item.date || sample.time.substring(0, 10),
                timestamp,
                ...tagActivity(timestamp),
                device_name: 'Garmin Device',
                bpm: Number(sample.data),
                context: 'unspecified',
              });
            }
          }
        } else if (item.date && item.timestamp && item.value) {
          const timestamp = new Date(item.timestamp);
          hrSamples.push({
            entry_date: item.date,
            timestamp,
            ...tagActivity(timestamp),
            device_name: item.device_name || 'Garmin Device',
            bpm: Number(item.value),
            context: item.context || 'unspecified',
          });
        }
      }
    }
    const hrBuckets = await upsertSamplesByDay(
      userId,
      actingUserId,
      'heart_rate',
      'garmin',
      hrSamples
    );
    if (hrBuckets > 0) {
      processedResults.push({
        type: 'health_metric_samples:heart_rate',
        status: 'success',
        count: hrSamples.length,
        buckets: hrBuckets,
      });
    }

    // 3. HRV -> health_metric_samples (metric: 'hrv')
    const hrvSamples: Array<{
      entry_date: string;
      timestamp: Date;
      ex?: string;
      sl?: string;
      device_name: string;
      rmssd_ms?: number;
      sdnn_ms?: number;
      status?: string;
    }> = [];
    if (healthData.hrv && Array.isArray(healthData.hrv)) {
      for (const item of healthData.hrv) {
        // The Python service (SparkyFitnessGarmin/routes.py, the "# HRV" block)
        // sends a per-day object shaped:
        //   { date, hrvValue: [{ time, data }], last_night_avg, weekly_avg,
        //     status, average_overnight_hrv, ... }
        // It never sends a nested `hrvSummary` object nor flat
        // timestamp/rmssd keys, so neither branch below used to match and no
        // hrv row was ever written — while the per-reading overnight series in
        // `hrvValue` was fetched and then dropped on the floor. Both are handled
        // here: the readings first, then the nightly summary.
        const readings = Array.isArray(item.hrvValue) ? item.hrvValue : [];
        for (const reading of readings) {
          const rawTime = reading?.time ?? reading?.t;
          const rmssd = Number(reading?.data ?? reading?.value);
          if (!rawTime || !Number.isFinite(rmssd)) continue;
          const timestamp = new Date(rawTime);
          if (Number.isNaN(timestamp.getTime())) continue;
          hrvSamples.push({
            entry_date: item.date || instantToDay(timestamp, userTz),
            timestamp,
            ...tagActivity(timestamp),
            device_name: item.device_name || 'Garmin Device',
            // Garmin's hrvReadings are 5-minute RMSSD averages in ms.
            rmssd_ms: rmssd,
          });
        }

        // Nightly summary, sent as flat keys alongside the readings above.
        // Garmin's weekly_avg / hrvSummary.weeklyAvg is a weekly RMSSD
        // average, not an SDNN value, so it is deliberately not stored:
        // writing it to sdnn_ms would present one HRV metric as another.
        const lastNightAvg = num(
          item.last_night_avg ?? item.average_overnight_hrv
        );
        const summaryStatus = str(item.status ?? item.hrv_status);
        if (item.date && (lastNightAvg !== null || summaryStatus !== null)) {
          // Garmin's nightly HRV summary has no intraday timestamp; anchor at
          // 05:00 UTC, matching this ingest's prior behavior, so it sorts with
          // the overnight sleep window rather than the following day.
          const timestamp = new Date(`${item.date}T05:00:00Z`);
          hrvSamples.push({
            entry_date: item.date,
            timestamp,
            ...tagActivity(timestamp),
            device_name: item.device_name || 'Garmin Device',
            rmssd_ms: lastNightAvg ?? undefined,
            status: summaryStatus ?? 'balanced',
          });
        } else if (item.hrvSummary && item.date) {
          // Garmin's nightly HRV summary has no intraday timestamp; anchor at
          // 05:00 UTC, matching this ingest's prior behavior, so it sorts with
          // the overnight sleep window rather than the following day.
          const timestamp = new Date(`${item.date}T05:00:00Z`);
          hrvSamples.push({
            entry_date: item.date,
            timestamp,
            ...tagActivity(timestamp),
            device_name: 'Garmin Device',
            rmssd_ms: item.hrvSummary.lastNightAvg ?? undefined,
            status: item.hrvSummary.status || 'balanced',
          });
        } else if (item.date && item.timestamp) {
          const timestamp = new Date(item.timestamp);
          hrvSamples.push({
            entry_date: item.date,
            timestamp,
            ...tagActivity(timestamp),
            device_name: item.device_name || 'Garmin Device',
            rmssd_ms: item.rmssd ?? undefined,
            sdnn_ms: item.sdnn ?? undefined,
            status: item.status || 'balanced',
          });
        }
      }
    }
    const hrvBuckets = await upsertSamplesByDay(
      userId,
      actingUserId,
      'hrv',
      'garmin',
      hrvSamples
    );
    if (hrvBuckets > 0) {
      processedResults.push({
        type: 'health_metric_samples:hrv',
        status: 'success',
        count: hrvSamples.length,
        buckets: hrvBuckets,
      });
    }

    // 4. Respiration -> health_metric_samples (metric: 'respiration')
    const respSamples: Array<{
      entry_date: string;
      timestamp: Date;
      ex?: string;
      sl?: string;
      device_name: string;
      brpm: number;
      context: string;
    }> = [];
    if (healthData.respiration && Array.isArray(healthData.respiration)) {
      for (const item of healthData.respiration) {
        if (
          item.respirationValuesArray &&
          Array.isArray(item.respirationValuesArray)
        ) {
          for (const sample of item.respirationValuesArray) {
            if (sample[0] && sample[1]) {
              const timestamp = new Date(sample[0]);
              respSamples.push({
                entry_date: item.date || instantToDay(timestamp, userTz),
                timestamp,
                ...tagActivity(timestamp),
                device_name: 'Garmin Device',
                brpm: Number(sample[1]),
                context: 'unspecified',
              });
            }
          }
        } else if (item.date && item.timestamp && item.breaths_per_minute) {
          const timestamp = new Date(item.timestamp);
          respSamples.push({
            entry_date: item.date,
            timestamp,
            ...tagActivity(timestamp),
            device_name: item.device_name || 'Garmin Device',
            brpm: item.breaths_per_minute,
            context: item.context || 'unspecified',
          });
        } else if (item.date) {
          // What the Python service actually sends (routes.py, the
          // "# Respiration" block): daily averages, no intraday series and no
          // respirationValuesArray. Neither branch above matched it, so Garmin
          // respiration never produced a row. Each average is stored as its own
          // sample, distinguished by `context`, anchored at a fixed hour so the
          // day's samples keep a stable order.
          const dailyAverages: Array<{
            key: string;
            context: string;
            hour: string;
          }> = [
            {
              key: 'sleep_respiration_avg',
              context: 'sleep',
              hour: '05:00:00',
            },
            {
              key: 'awake_respiration_avg',
              context: 'awake',
              hour: '12:00:00',
            },
            {
              key: 'average_respiration_rate',
              context: 'daily_average',
              hour: '23:59:00',
            },
          ];
          for (const { key, context, hour } of dailyAverages) {
            const brpm = num(item[key]);
            if (brpm === null) continue;
            const timestamp = new Date(`${item.date}T${hour}Z`);
            respSamples.push({
              entry_date: item.date,
              timestamp,
              ...tagActivity(timestamp),
              device_name: item.device_name || 'Garmin Device',
              brpm,
              context,
            });
          }
        }
      }
    }
    const respBuckets = await upsertSamplesByDay(
      userId,
      actingUserId,
      'respiration',
      'garmin',
      respSamples
    );
    if (respBuckets > 0) {
      processedResults.push({
        type: 'health_metric_samples:respiration',
        status: 'success',
        count: respSamples.length,
        buckets: respBuckets,
      });
    }

    // 5. SpO2 -> health_metric_samples (metric: 'spo2')
    const spo2Samples: Array<{
      entry_date: string;
      timestamp: Date;
      ex?: string;
      sl?: string;
      device_name: string;
      percentage: number;
    }> = [];
    if (healthData.spo2 && Array.isArray(healthData.spo2)) {
      for (const item of healthData.spo2) {
        if (
          item.date &&
          item.average_spo2 !== undefined &&
          item.average_spo2 !== null
        ) {
          // Garmin's daily SpO2 average has no intraday timestamp; anchor at
          // midday so it sorts sensibly alongside intraday readings.
          const timestamp = new Date(`${item.date}T12:00:00Z`);
          spo2Samples.push({
            entry_date: item.date,
            timestamp,
            ...tagActivity(timestamp),
            device_name: 'Garmin Device',
            percentage: Number(item.average_spo2),
          });
        }
      }
    }
    const spo2Buckets = await upsertSamplesByDay(
      userId,
      actingUserId,
      'spo2',
      'garmin',
      spo2Samples
    );
    if (spo2Buckets > 0) {
      processedResults.push({
        type: 'health_metric_samples:spo2',
        status: 'success',
        count: spo2Samples.length,
        buckets: spo2Buckets,
      });
    }

    // 5b. Stress & Body Battery (intraday) -> health_metric_samples
    // ('stress' / 'body_battery'). Both arrays already arrive on
    // healthData.stress[i].stressLevel / .BodyBatteryLevel (see the mood-derivation
    // block above, which uses the SAME per-day stress_data_entry object for a
    // different purpose — raw_stress_data/derived_mood_value — and is untouched).
    // Previously fetched by SparkyFitnessGarmin but discarded here entirely.
    const stressSamples: Array<{
      entry_date: string;
      timestamp: Date;
      ex?: string;
      sl?: string;
      device_name: string;
      level: number;
    }> = [];
    const bodyBatterySamples: Array<{
      entry_date: string;
      timestamp: Date;
      ex?: string;
      sl?: string;
      device_name: string;
      level: number;
    }> = [];
    if (healthData.stress && Array.isArray(healthData.stress)) {
      for (const item of healthData.stress) {
        const entryDate: string | undefined = item.date;
        if (!entryDate) continue;
        if (Array.isArray(item.stressLevel)) {
          for (const sample of item.stressLevel) {
            if (
              !sample?.time ||
              sample.stress_level === null ||
              sample.stress_level === undefined
            )
              continue;
            const timestamp = new Date(sample.time);
            stressSamples.push({
              entry_date: entryDate,
              timestamp,
              ...tagActivity(timestamp),
              device_name: 'Garmin Device',
              level: Number(sample.stress_level),
            });
          }
        }
        if (Array.isArray(item.BodyBatteryLevel)) {
          for (const sample of item.BodyBatteryLevel) {
            if (
              !sample?.time ||
              sample.stress_level === null ||
              sample.stress_level === undefined
            )
              continue;
            const timestamp = new Date(sample.time);
            bodyBatterySamples.push({
              entry_date: entryDate,
              timestamp,
              ...tagActivity(timestamp),
              device_name: 'Garmin Device',
              level: Number(sample.stress_level),
            });
          }
        }
      }
    }
    const stressBuckets = await upsertSamplesByDay(
      userId,
      actingUserId,
      'stress',
      'garmin',
      stressSamples
    );
    if (stressBuckets > 0) {
      processedResults.push({
        type: 'health_metric_samples:stress',
        status: 'success',
        count: stressSamples.length,
        buckets: stressBuckets,
      });
    }
    const bodyBatteryBuckets = await upsertSamplesByDay(
      userId,
      actingUserId,
      'body_battery',
      'garmin',
      bodyBatterySamples
    );
    if (bodyBatteryBuckets > 0) {
      processedResults.push({
        type: 'health_metric_samples:body_battery',
        status: 'success',
        count: bodyBatterySamples.length,
        buckets: bodyBatteryBuckets,
      });
    }

    // 6. Process Vitals (Blood Pressure) Entries
    if (healthData.blood_pressure && Array.isArray(healthData.blood_pressure)) {
      const vitalsEntriesToInsert: Array<{
        user_id: string;
        entry_date: string;
        timestamp: Date;
        systolic_mmhg: number | null;
        diastolic_mmhg: number | null;
        source_provider: string;
        device_name: string;
      }> = [];
      // routes.py formats each reading as "systolic/diastolic" or "systolic/diastolic, pulse bpm".
      const bpPattern = /^(\d+)\/(\d+)/;
      for (const item of healthData.blood_pressure) {
        if (!item.date || typeof item.value !== 'string') continue;
        const match = bpPattern.exec(item.value);
        if (!match) continue;
        // Prefer the reading's own instant (routes.py sends it as
        // `timestamp`, sourced from measurementTimestampGMT — a naive string
        // that toUtcInstant pins to UTC so a non-UTC server can't shift it);
        // without it, two same-day readings both stamped T12:00:00Z would
        // upsert onto the same (user, provider, timestamp) row and one would
        // be lost. Fall back to the noon anchor only for older payloads that
        // lack it.
        const timestamp =
          toUtcInstant(item.timestamp) ?? new Date(`${item.date}T12:00:00Z`);
        vitalsEntriesToInsert.push({
          user_id: userId,
          entry_date: item.date,
          timestamp,
          systolic_mmhg: Number(match[1]),
          diastolic_mmhg: Number(match[2]),
          source_provider: 'garmin',
          device_name: 'Garmin Device',
        });
      }

      if (vitalsEntriesToInsert.length > 0) {
        await genericHealthRepo.bulkUpsertVitals(
          userId,
          actingUserId,
          vitalsEntriesToInsert
        );
        processedResults.push({
          type: 'vitals_entries',
          status: 'success',
          count: vitalsEntriesToInsert.length,
        });
      }
    }
  } catch (error: unknown) {
    log(
      'error',
      `[garminHealthProcessor] Unexpected error in processGarminHealthAndWellnessData for user ${userId}:`,
      error
    );
    errors.push({
      type: 'general',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (errors.length > 0) {
    throw new Error(
      JSON.stringify({
        message:
          'Some Garmin health and wellness data entries could not be processed.',
        processed: processedResults,
        errors: errors,
      })
    );
  } else {
    return {
      message: 'All Garmin health and wellness data successfully processed.',
      processed: processedResults,
    };
  }
}

export async function processGarminSleepData(
  userId: string,
  actingUserId: string,
  sleepDataArray: Array<Record<string, unknown>>,
  startDate: string,
  endDate: string
) {
  const processedResults: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  log(
    'info',
    `[garminHealthProcessor] Performing comprehensive cleanup for Garmin sleep data for user ${userId} from ${startDate} to ${endDate}.`
  );
  await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
    userId,
    'garmin',
    startDate,
    endDate
  );

  for (const sleepEntry of sleepDataArray) {
    try {
      const result = await measurementService.processSleepEntry(
        userId,
        actingUserId,
        sleepEntry
      );
      processedResults.push({ status: 'success', data: result });
    } catch (error: unknown) {
      log(
        'error',
        `Error processing Garmin sleep entry for user ${userId}:`,
        error
      );
      errors.push({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        entry: sleepEntry,
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(
      JSON.stringify({
        message: 'Some Garmin sleep entries could not be processed.',
        processed: processedResults,
        errors: errors,
      })
    );
  } else {
    return {
      message: 'All Garmin sleep data successfully processed.',
      processed: processedResults,
    };
  }
}

const GARMIN_MEAL_TYPE_MAP: Record<string, string> = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACKS: 'snacks',
};

function mapGarminNutrition(
  nutritionContent: Record<string, number | null | undefined>
) {
  return {
    calories: nutritionContent.calories ?? null,
    protein: nutritionContent.protein ?? null,
    carbs: nutritionContent.carbs ?? null,
    fat: nutritionContent.fat ?? null,
    saturated_fat: nutritionContent.saturatedFat ?? null,
    polyunsaturated_fat: nutritionContent.polyunsaturatedFat ?? null,
    monounsaturated_fat: nutritionContent.monounsaturatedFat ?? null,
    trans_fat: null,
    cholesterol: nutritionContent.cholesterol ?? null,
    sodium: nutritionContent.sodium ?? null,
    potassium: nutritionContent.potassium ?? null,
    dietary_fiber: nutritionContent.fiber ?? null,
    sugars: nutritionContent.sugar ?? null,
    vitamin_a: nutritionContent.vitaminA ?? null,
    vitamin_c: nutritionContent.vitaminC ?? null,
    calcium: nutritionContent.calcium ?? null,
    iron: nutritionContent.iron ?? null,
  };
}

export async function processGarminNutritionData(
  userId: string,
  nutritionData: Array<Record<string, unknown>>,
  startDate: string,
  endDate: string
) {
  log(
    'info',
    `[garminHealthProcessor] Processing Garmin nutrition data for user ${userId} from ${startDate} to ${endDate}. Days: ${nutritionData.length}`
  );

  const allMealTypes = await mealTypeRepository.getAllMealTypes(userId);
  const mealTypeIdMap: Record<string, string> = {};
  for (const mt of allMealTypes) {
    mealTypeIdMap[mt.name.toLowerCase()] = mt.id;
  }

  let processedFoods = 0;
  let processedEntries = 0;
  const errors: string[] = [];
  const syncedSourceIds: string[] = [];

  for (const dayLog of nutritionData) {
    // dayLog comes from an untyped Garmin payload; narrow before use so the
    // entry's calendar-day string keeps its contract downstream.
    const mealDate =
      typeof dayLog.mealDate === 'string' ? dayLog.mealDate : null;
    if (!mealDate) continue;

    const mealDetails = dayLog.mealDetails;
    if (!Array.isArray(mealDetails)) continue;

    for (const mealDetail of mealDetails) {
      const garminMealName = mealDetail.meal?.mealName;
      const mappedMealType = GARMIN_MEAL_TYPE_MAP[garminMealName] || 'snacks';
      const mealTypeId = mealTypeIdMap[mappedMealType];

      if (!mealTypeId) {
        log(
          'warn',
          `[garminHealthProcessor] Could not resolve meal type '${mappedMealType}' for user ${userId}. Skipping meal.`
        );
        continue;
      }

      if (garminMealName && !GARMIN_MEAL_TYPE_MAP[garminMealName]) {
        log(
          'warn',
          `[garminHealthProcessor] Unrecognized Garmin meal name '${garminMealName}', defaulting to snacks.`
        );
      }

      const loggedFoods = mealDetail.loggedFoods;
      if (!Array.isArray(loggedFoods)) continue;

      for (let foodIdx = 0; foodIdx < loggedFoods.length; foodIdx++) {
        const loggedFood = loggedFoods[foodIdx];
        try {
          const foodMeta = loggedFood.foodMetaData;
          const nutritionContent = loggedFood.nutritionContent;
          if (!foodMeta || !nutritionContent) continue;

          const garminFoodId = String(foodMeta.foodId);
          const mappedNutrition = mapGarminNutrition(nutritionContent);

          let food = await foodRepository.findFoodByProviderExternalId(
            userId,
            garminFoodId,
            'garmin'
          );

          if (food) {
            if (food.default_variant_id) {
              await foodRepository.updateFoodVariantNutrition(
                food.default_variant_id,
                userId,
                {
                  serving_size: 1,
                  serving_unit: String(
                    nutritionContent.servingUnit || 'serving'
                  ),
                  ...mappedNutrition,
                }
              );
            }
          } else {
            food = await foodRepository.createFood({
              name: foodMeta.foodName,
              brand: foodMeta.brandName || null,
              is_custom: false,
              user_id: userId,
              provider_external_id: garminFoodId,
              provider_type: 'garmin',
              shared_with_public: false,
              serving_size: 1,
              serving_unit: String(nutritionContent.servingUnit || 'serving'),
              source: 'imported',
              ...mappedNutrition,
            });
            processedFoods++;
          }

          const foodId = food.id;
          const variantId = food.default_variant_id || food.default_variant?.id;
          const sourceId = `${mealDate}:${mappedMealType}:${garminFoodId}:${foodIdx}`;

          await foodEntryRepository.createFoodEntry(
            {
              user_id: userId,
              food_id: foodId,
              variant_id: variantId,
              meal_type_id: mealTypeId,
              quantity: loggedFood.servingQty ?? 1,
              unit: String(nutritionContent.servingUnit || 'serving'),
              entry_date: mealDate,
              serving_size: 1,
              serving_unit: String(nutritionContent.servingUnit || 'serving'),
              food_name: foodMeta.foodName,
              brand_name: foodMeta.brandName || null,
              ...mappedNutrition,
              source: 'garmin',
              source_id: sourceId,
            },
            userId
          );
          syncedSourceIds.push(sourceId);
          processedEntries++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          log(
            'warn',
            `[garminHealthProcessor] Failed to process food entry on ${mealDate}: ${msg}`
          );
          errors.push(`${mealDate}: ${msg}`);
        }
      }
    }
  }

  let removedStale = 0;
  if (syncedSourceIds.length > 0) {
    removedStale = await foodEntryRepository.deleteStaleProviderEntries(
      userId,
      'garmin',
      startDate,
      endDate,
      syncedSourceIds
    );
    if (removedStale > 0) {
      log(
        'info',
        `[garminHealthProcessor] Removed ${removedStale} stale Garmin entries no longer in payload.`
      );
    }
  }

  log(
    'info',
    `[garminHealthProcessor] Nutrition sync complete. Foods created: ${processedFoods}, Entries created: ${processedEntries}, Removed: ${removedStale}, Errors: ${errors.length}`
  );

  return {
    message: 'Garmin nutrition diary sync completed.',
    processedFoods,
    processedEntries,
    removedStale,
    errors,
  };
}
