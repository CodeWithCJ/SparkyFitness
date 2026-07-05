import measurementRepository from '../../models/measurementRepository.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import exerciseRepository from '../../models/exercise.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import sleepRepository from '../../models/sleepRepository.js';
import { log } from '../../config/logging.js';
import { todayInZone, instantToDay } from '@workspace/shared';
import {
  parseDurationToSeconds,
  googleTimeToIso,
} from './googleHealthService.js';

// ──────────────────────────────────────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────────────────────────────────────

type UserId = string;

interface GoogleDataResult {
  dataPoints: Record<string, unknown>[];
}

interface GoogleRollupResult {
  rollupDataPoints: Record<string, unknown>[];
}

interface CustomMeasurementInput {
  categoryName: string;
  value: number | string;
  unit: string;
  entryDate: string;
  entryHour: number;
  entryTimestamp: string;
  frequency: string;
}

type DateObj = { year?: number; month?: number; day?: number };
type CivilStartTimePoint = { date?: DateObj };

// ──────────────────────────────────────────────────────────────────────────────
// Shared helper
// ──────────────────────────────────────────────────────────────────────────────

// Auto-creates a custom measurement category if missing, then upserts the value.
// Mirrors the Fitbit version but uses 'Google Health' as source label.
async function upsertCustomMeasurementLogic(
  userId: UserId,
  createdByUserId: UserId,
  customMeasurement: CustomMeasurementInput
) {
  const {
    categoryName,
    value,
    unit,
    entryDate,
    entryHour,
    entryTimestamp,
    frequency,
  } = customMeasurement;
  const categories = await measurementRepository.getCustomCategories(userId);
  const category = categories.find(
    (cat: { name: string; id: string }) => cat.name === categoryName
  );
  let categoryId;
  if (!category) {
    const newCategory = await measurementRepository.createCustomCategory({
      user_id: userId,
      name: categoryName,
      display_name: categoryName,
      frequency,
      measurement_type: 'health',
      data_type: typeof value === 'number' ? 'numeric' : 'text',
      created_by_user_id: createdByUserId,
    });
    categoryId = newCategory.id;
  } else {
    categoryId = category.id;
  }
  await measurementRepository.upsertCustomMeasurement(
    userId,
    createdByUserId,
    categoryId,
    value,
    entryDate,
    entryHour,
    entryTimestamp,
    `Synced from Google Health. Unit: ${unit}`,
    frequency,
    'Google Health'
  );
}

// Extracts YYYY-MM-DD from the Google Health startTime field of a data point.
// Tries structured date object first, falls back to ISO string parsing.
// Google Health data point date extraction.
// The date/time lives INSIDE the payload key (camelCase of data type), not at point.startTime.
//   - Daily types: payload.date = { year, month, day }
//   - Sample types: payload.sampleTime.physicalTime = ISO string
//   - Interval/session types: top-level startTime or payload.interval.civilStartTime.date
function extractDate(
  dataPoint: Record<string, unknown>,
  tz: string
): string | null {
  // Interval/session types (exercise, some custom types) carry top-level startTime
  const st = dataPoint.startTime;
  if (st) {
    if (
      typeof st === 'object' &&
      st !== null &&
      (st as Record<string, unknown>).date
    ) {
      const d = (st as Record<string, unknown>).date as Record<string, unknown>;
      if (d?.year) {
        return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
      }
    }
    if (typeof st === 'string') return instantToDay(new Date(st), tz);
  }

  // For daily and sample types: look inside every non-timestamp top-level key
  const SKIP = new Set([
    'startTime',
    'endTime',
    'sampleTime',
    'createTime',
    'updateTime',
    'dataSource',
  ]);
  for (const key of Object.keys(dataPoint)) {
    if (SKIP.has(key)) continue;
    const payload = dataPoint[key];
    if (!payload || typeof payload !== 'object') continue;

    const p = payload as Record<string, unknown>;

    // Daily aggregate: payload.date = { year, month, day }
    if (
      p.date &&
      typeof p.date === 'object' &&
      (p.date as Record<string, unknown>).year
    ) {
      const d = p.date as Record<string, unknown>;
      return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }

    // Sample types: payload.sampleTime.physicalTime = "2026-06-07T..."
    const sampleTime = p.sampleTime as Record<string, unknown> | undefined;
    const physTime = sampleTime?.physicalTime ?? sampleTime?.physical_time;
    if (typeof physTime === 'string')
      return instantToDay(new Date(physTime), tz);

    // Session types inside payload: payload.interval.civilStartTime.date
    const interval = p.interval as Record<string, unknown> | undefined;
    const civilStart = interval?.civilStartTime ?? interval?.civil_start_time;
    const csd =
      civilStart && typeof civilStart === 'object'
        ? ((civilStart as Record<string, unknown>).date as
            | Record<string, unknown>
            | undefined)
        : undefined;
    if (csd?.year) {
      return `${csd.year}-${String(csd.month).padStart(2, '0')}-${String(csd.day).padStart(2, '0')}`;
    }
    // payload.interval.startTime as string
    const ist = interval?.startTime ?? interval?.start_time;
    if (typeof ist === 'string') return instantToDay(new Date(ist), tz);
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Resting Heart Rate
// Google data type: daily-resting-heart-rate
// Response: dataPoints[].dailyRestingHeartRate.beatsPerMinute
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleHeartRate(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health resting heart rate data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const hr = point.dailyRestingHeartRate as
      | { beatsPerMinute?: unknown }
      | undefined;
    const bpm = hr?.beatsPerMinute;
    if (bpm === null || bpm === undefined) continue;
    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Resting Heart Rate',
      value: bpm as number,
      unit: 'bpm',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health resting HR for user ${userId} on ${entryDate}: ${bpm} bpm.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Steps — daily rollup
// Response: rollupDataPoints[].steps.countSum
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleSteps(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleRollupResult,
  _tz = 'UTC'
) {
  const points = data?.rollupDataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health steps data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const stepsPayload = point.steps as { countSum?: unknown } | undefined;
    const countSum = stepsPayload?.countSum;
    if (countSum === null || countSum === undefined) continue;
    const steps = parseInt(countSum as string, 10);
    if (isNaN(steps)) continue;

    // Timestamp from civilStartTime
    const cs = point.civilStartTime as CivilStartTimePoint | undefined;
    let entryDate: string | null = null;
    if (cs?.date) {
      const d = cs.date;
      entryDate = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }
    if (!entryDate) continue;

    await measurementRepository.upsertStepData(
      userId,
      createdByUserId,
      steps,
      entryDate
    );
    log(
      'info',
      `Upserted Google Health steps for user ${userId} on ${entryDate}: ${steps}.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Weight
// Google data type: weight
// Response: dataPoints[].weight.weightGrams (convert to kg)
// BMI not available from Google Health — skipped (Withings covers this separately)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleWeight(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health weight data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const grams = (point.weight as { weightGrams?: unknown } | undefined)
      ?.weightGrams;
    const weight = parseFloat(grams as string);
    if (isNaN(weight)) continue;
    const weightKg = weight / 1000;
    await measurementRepository.upsertCheckInMeasurements(
      userId,
      createdByUserId,
      entryDate,
      { weight: weightKg }
    );
    log(
      'info',
      `Upserted Google Health weight for user ${userId} on ${entryDate}: ${weightKg} kg.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SpO2
// Google data type: oxygen-saturation
// Response: dataPoints[].oxygenSaturation.percentage
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleSpO2(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health SpO2 data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const pct = (point.oxygenSaturation as { percentage?: unknown } | undefined)
      ?.percentage;
    const pctVal = parseFloat(pct as string);
    if (isNaN(pctVal)) continue;
    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'SpO2',
      value: pctVal,
      unit: '%',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health SpO2 for user ${userId} on ${entryDate}: ${pct}%.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Skin Temperature Variation
// Google data type: daily-sleep-temperature-derivations
// Response: dataPoints[].dailySleepTemperatureDerivations.{nightlyTemperatureCelsius, baselineTemperatureCelsius}
// Relative value = nightly - baseline (same metric as Fitbit's nightlyRelative)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleTemperature(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health skin temperature data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const fields = point.dailySleepTemperatureDerivations as
      | {
          nightlyTemperatureCelsius?: unknown;
          baselineTemperatureCelsius?: unknown;
        }
      | undefined;
    if (!fields) continue;
    const nightly = fields.nightlyTemperatureCelsius;
    const baseline = fields.baselineTemperatureCelsius;
    if (
      nightly === null ||
      nightly === undefined ||
      baseline === null ||
      baseline === undefined
    )
      continue;
    const relative =
      Math.round(
        (parseFloat(nightly as string) - parseFloat(baseline as string)) * 1000
      ) / 1000;
    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Skin Temperature Variation',
      value: relative,
      unit: 'C',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health skin temp variation for user ${userId} on ${entryDate}: ${relative} C.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Height (used as profile proxy)
// Google data type: height
// Response: dataPoints[].height.heightMillimeters (convert to cm)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleProfile(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  date: string | null = null,
  timezone = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) return;
  // Use the most recent height entry
  let latestMm: number | null = null;
  for (const point of points) {
    const mm = (point.height as { heightMillimeters?: unknown } | undefined)
      ?.heightMillimeters;
    if (
      mm !== null &&
      mm !== undefined &&
      (latestMm === null || parseFloat(mm as string) > latestMm)
    ) {
      latestMm = parseFloat(mm as string);
    }
  }
  if (latestMm === null) return;
  const heightCm = latestMm / 10;
  const syncDate = date || todayInZone(timezone);
  await measurementRepository.upsertCheckInMeasurements(
    userId,
    createdByUserId,
    syncDate,
    { height: heightCm }
  );
  log(
    'info',
    `Upserted Google Health height for user ${userId}: ${heightCm} cm.`
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// HRV
// Google data type: daily-heart-rate-variability
// Response: dataPoints[].dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleHRV(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health HRV data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const rmssd = (
      point.dailyHeartRateVariability as
        | { averageHeartRateVariabilityMilliseconds?: unknown }
        | undefined
    )?.averageHeartRateVariabilityMilliseconds;
    if (rmssd === null || rmssd === undefined) continue;
    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'HRV',
      value: parseFloat(rmssd as string),
      unit: 'ms',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health HRV for user ${userId} on ${entryDate}: ${rmssd} ms.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Respiratory Rate
// Google data type: daily-respiratory-rate
// Response: dataPoints[].dailyRespiratoryRate.breathsPerMinute
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleRespiratoryRate(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health respiratory rate data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const br = (
      point.dailyRespiratoryRate as { breathsPerMinute?: unknown } | undefined
    )?.breathsPerMinute;
    if (br === null || br === undefined) continue;
    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Respiratory Rate',
      value: parseFloat(br as string),
      unit: 'brpm',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health respiratory rate for user ${userId} on ${entryDate}: ${br} brpm.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Active Zone Minutes — daily rollup
// Response: rollupDataPoints[].activeZoneMinutes.{sumInFatBurnHeartZone, sumInCardioHeartZone, sumInPeakHeartZone}
// Stored as total AZM = fat_burn + cardio + peak (matches Fitbit's activeZoneMinutes field)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleActiveZoneMinutes(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleRollupResult,
  _tz = 'UTC'
) {
  const points = data?.rollupDataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health AZM data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const azm = point.activeZoneMinutes as
      | {
          sumInFatBurnHeartZone?: unknown;
          sumInCardioHeartZone?: unknown;
          sumInPeakHeartZone?: unknown;
        }
      | undefined;
    if (!azm) continue;

    const cs = point.civilStartTime as CivilStartTimePoint | undefined;
    let entryDate: string | null = null;
    if (cs?.date) {
      const d = cs.date;
      entryDate = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }
    if (!entryDate) continue;

    const fatBurn = parseInt(azm.sumInFatBurnHeartZone as string, 10) || 0;
    const cardio = parseInt(azm.sumInCardioHeartZone as string, 10) || 0;
    const peak = parseInt(azm.sumInPeakHeartZone as string, 10) || 0;
    const total = fatBurn + cardio + peak;
    if (total === 0) continue;

    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Active Zone Minutes',
      value: total,
      unit: 'min',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health AZM for user ${userId} on ${entryDate}: ${total} min.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Sleep
// Google data type: sleep
// Response: dataPoints[].sleep.{summary, stages[], interval}
// Stages: AWAKE, LIGHT, DEEP, REM
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleSleep(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health sleep data for user ${userId}.`);
    return;
  }
  // Collect the longest session per anchor date (last-writer-wins produces wrong results
  // when a short false-positive doze has a later civil_start_time than the real main sleep).
  type SleepCandidate = {
    entryData: {
      entry_date: string;
      bedtime: string | null;
      wake_time: string | null;
      duration_in_seconds: number;
      time_asleep_in_seconds: number;
      sleep_score: number;
      source: string;
      deep_sleep_seconds: number;
      light_sleep_seconds: number;
      rem_sleep_seconds: number;
      awake_sleep_seconds: number;
    };
    stages: Record<string, unknown>[];
    minutesAsleep: number;
  };
  const bestPerDate = new Map<string, SleepCandidate>();

  for (const point of points) {
    const sleepPayload = point.sleep as
      | {
          summary?: Record<string, unknown>;
          interval?: Record<string, unknown>;
          stages?: Record<string, unknown>[];
        }
      | undefined;
    if (!sleepPayload) continue;

    const summary = sleepPayload.summary || {};
    const interval = sleepPayload.interval || {};
    const stages = sleepPayload.stages || [];

    const startIso = googleTimeToIso(
      (interval.startTime ?? point.startTime) as
        | string
        | Record<string, unknown>
        | undefined
    );
    const endIso = googleTimeToIso(
      (interval.endTime ?? point.endTime) as
        | string
        | Record<string, unknown>
        | undefined
    );
    if (!startIso) continue;

    // Anchor to the wake-up day, matching how Google Health / Fitbit file a
    // sleep session (it belongs to the day the session ends, not the day you
    // fell asleep). Fall back to the start day when there is no end time.
    const sleepDate = instantToDay(endIso ?? startIso, tz);

    const minutesAsleep = parseInt(summary.minutesAsleep as string, 10) || 0;
    const minutesInPeriod =
      parseInt(summary.minutesInSleepPeriod as string, 10) || 0;
    const minutesToFall =
      parseInt(summary.minutesToFallAsleep as string, 10) || 0;
    const efficiency =
      minutesInPeriod > 0
        ? Math.round((minutesAsleep / minutesInPeriod) * 100)
        : 0;

    let deepSec = 0,
      lightSec = 0,
      remSec = 0,
      awakeSec = 0;
    for (const stage of stages) {
      const stageStart = googleTimeToIso(
        stage.startTime as string | Record<string, unknown> | undefined
      );
      const stageEnd = googleTimeToIso(
        stage.endTime as string | Record<string, unknown> | undefined
      );
      if (!stageStart || !stageEnd) continue;
      const durationSec = Math.round(
        (new Date(stageEnd).getTime() - new Date(stageStart).getTime()) / 1000
      );
      switch (stage.type) {
        case 'DEEP':
          deepSec += durationSec;
          break;
        case 'LIGHT':
          lightSec += durationSec;
          break;
        case 'REM':
          remSec += durationSec;
          break;
        case 'AWAKE':
          awakeSec += durationSec;
          break;
      }
    }

    const durationSec = endIso
      ? Math.round(
          (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000
        )
      : minutesInPeriod * 60;

    const entryData = {
      entry_date: sleepDate,
      bedtime: startIso,
      wake_time: endIso,
      duration_in_seconds: durationSec,
      time_asleep_in_seconds: minutesAsleep * 60,
      sleep_score: efficiency,
      source: 'Google Health',
      deep_sleep_seconds: deepSec,
      light_sleep_seconds: lightSec,
      rem_sleep_seconds: remSec,
      awake_sleep_seconds: awakeSec || minutesToFall * 60,
    };

    const existing = bestPerDate.get(sleepDate);
    if (!existing || minutesAsleep > existing.minutesAsleep) {
      bestPerDate.set(sleepDate, { entryData, stages, minutesAsleep });
    }
  }

  for (const [sleepDate, { entryData, stages }] of bestPerDate) {
    const result = await sleepRepository.upsertSleepEntry(
      userId,
      createdByUserId,
      entryData
    );

    if (result?.id && stages.length > 0) {
      await sleepRepository.deleteSleepStageEventsByEntryId(userId, result.id);
      for (const stage of stages) {
        const stageStart = googleTimeToIso(
          stage.startTime as string | Record<string, unknown> | undefined
        );
        const stageEnd = googleTimeToIso(
          stage.endTime as string | Record<string, unknown> | undefined
        );
        if (!stageStart || !stageEnd) continue;
        const durationSec = Math.round(
          (new Date(stageEnd).getTime() - new Date(stageStart).getTime()) / 1000
        );
        const stageTypeMap: Record<string, string> = {
          AWAKE: 'awake',
          LIGHT: 'light',
          DEEP: 'deep',
          REM: 'rem',
          UNKNOWN: 'light',
        };
        const stageType = stageTypeMap[stage.type as string] || 'light';
        await sleepRepository.upsertSleepStageEvent(
          userId,
          result.id,
          {
            stage_type: stageType,
            start_time: stageStart,
            end_time: stageEnd,
            duration_in_seconds: durationSec,
          },
          createdByUserId
        );
      }
    }
    log(
      'info',
      `Upserted Google Health sleep for user ${userId} on ${sleepDate}.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Exercises / Activities
// Google data type: exercise
// Response: dataPoints[].exercise.{activeDuration, displayName, exerciseType, metricsSummary}
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleActivities(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  startDate: string | null = null,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) return;
  for (const point of points) {
    const exercise = point.exercise as
      | {
          displayName?: string;
          activeDuration?: string;
          exerciseType?: string;
          metricsSummary?: Record<string, unknown>;
        }
      | undefined;
    if (!exercise) continue;

    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    if (startDate && entryDate < startDate) continue;

    const durationSeconds = parseDurationToSeconds(exercise.activeDuration);
    if (!durationSeconds) continue;

    const metrics = exercise.metricsSummary || {};
    const exerciseName =
      exercise.displayName || exercise.exerciseType || 'Google Health Activity';

    let exerciseRecord = await exerciseRepository.findExerciseByNameAndUserId(
      exerciseName,
      userId
    );
    if (!exerciseRecord) {
      exerciseRecord = await exerciseRepository.createExercise({
        user_id: userId,
        name: exerciseName,
        category: 'Other',
        source: 'Google Health',
        is_custom: true,
        shared_with_public: false,
      });
    }
    if (!exerciseRecord) {
      log(
        'error',
        `Failed to find or create exercise record for ${exerciseName}`
      );
      continue;
    }

    const avgHR = metrics.averageHeartRateBeatsPerMinute
      ? parseInt(metrics.averageHeartRateBeatsPerMinute as string, 10)
      : null;
    const calories = metrics.caloriesKcal
      ? Math.round(parseFloat(metrics.caloriesKcal as string))
      : 0;
    // API returns distanceMillimeters; fall back to distanceMeters for forward-compat
    const distanceKm = metrics.distanceMillimeters
      ? parseFloat(metrics.distanceMillimeters as string) / 1_000_000
      : metrics.distanceMeters
        ? parseFloat(metrics.distanceMeters as string) / 1000
        : undefined;
    const steps = metrics.steps ? parseInt(metrics.steps as string, 10) : 0;

    // Extract the numeric ID from the data point name ("users/.../dataPoints/<id>")
    const pointName = typeof point.name === 'string' ? point.name : null;
    const nameId = pointName?.split('/').pop() ?? null;
    const sourceId =
      (point.dataPointId as string | undefined) ?? nameId ?? null;

    const entryData = {
      exercise_id: exerciseRecord.id,
      entry_date: entryDate,
      duration_minutes: Math.round(durationSeconds / 60),
      calories_burned: calories,
      distance: distanceKm,
      avg_heart_rate: avgHR,
      steps: steps || undefined,
      notes: 'Synced from Google Health.',
      entry_source: 'Google Health',
      source_id: sourceId,
      sets: [
        {
          set_number: 1,
          set_type: 'Working Set',
          duration: Math.round(durationSeconds / 60),
          notes: 'Automatically created from Google Health sync',
        },
      ],
    };

    const newEntry = await exerciseEntryRepository.createExerciseEntry(
      userId,
      entryData,
      createdByUserId,
      'Google Health'
    );
    if (newEntry?.id) {
      await activityDetailsRepository.createActivityDetail(userId, {
        exercise_entry_id: newEntry.id,
        provider_name: 'Google Health',
        detail_type: 'full_activity_data',
        detail_data: point,
        created_by_user_id: createdByUserId,
      });
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Body Fat
// Google data type: body-fat
// Response: dataPoints[].bodyFat.percentage (0-100)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleBodyFat(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health body fat data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const pct = (point.bodyFat as { percentage?: unknown } | undefined)
      ?.percentage;
    const bodyFatPct = parseFloat(pct as string);
    if (isNaN(bodyFatPct)) continue;
    await measurementRepository.upsertCheckInMeasurements(
      userId,
      createdByUserId,
      entryDate,
      { body_fat_percentage: bodyFatPct }
    );
    log(
      'info',
      `Upserted Google Health body fat for user ${userId} on ${entryDate}: ${pct}%.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Hydration / Water
// Google data type: hydration-log (dailyRollUp)
// Response: rollupDataPoints[].amountConsumed.millilitersSum
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleWater(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleRollupResult,
  _tz = 'UTC'
) {
  const points = data?.rollupDataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health hydration data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const ml = (
      point.amountConsumed as { millilitersSum?: unknown } | undefined
    )?.millilitersSum;
    if (ml === null || ml === undefined) continue;
    const water = Math.round(parseFloat(ml as string));
    if (water <= 0) continue;

    const cs = point.civilStartTime as CivilStartTimePoint | undefined;
    let entryDate: string | null = null;
    if (cs?.date) {
      const d = cs.date;
      entryDate = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }
    if (!entryDate) continue;

    await measurementRepository.upsertWaterData(
      userId,
      createdByUserId,
      water,
      entryDate,
      'googlehealth'
    );
    log(
      'info',
      `Upserted Google Health water for user ${userId} on ${entryDate}: ${water} ml.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core Body Temperature
// Google data type: core-body-temperature
// Response: dataPoints[].coreBodyTemperature.temperature (Celsius)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleCoreTemperature(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log(
      'info',
      `No Google Health core body temperature data for user ${userId}.`
    );
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const temp = (
      point.coreBodyTemperature as { temperature?: unknown } | undefined
    )?.temperature;
    if (temp === null || temp === undefined) continue;
    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Core Temperature',
      value: parseFloat(temp as string),
      unit: 'C',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health core temp for user ${userId} on ${entryDate}: ${temp} C.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// VO2 Max — matches Fitbit's cardioFitnessScore
// Google data type: daily-vo2-max
// Response: dataPoints[].dailyVo2Max.vo2MaxMillilitersPerKilogramPerMinute
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleVO2Max(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health VO2 Max data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;
    const payload = point.dailyVo2Max as
      | { vo2MaxMillilitersPerKilogramPerMinute?: unknown; vo2Max?: unknown }
      | undefined;
    if (!payload) continue;
    // Field name varies; try the documented long form then a short alias
    const vo2 =
      payload.vo2MaxMillilitersPerKilogramPerMinute ?? payload.vo2Max ?? null;
    if (vo2 === null || vo2 === undefined) continue;
    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'VO2 Max',
      value: parseFloat(vo2 as string),
      unit: 'ml/kg/min',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health VO2 Max for user ${userId} on ${entryDate}: ${vo2} ml/kg/min.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Activity Minutes breakdown — matches Fitbit's minutesSedentary/LightlyActive/FairlyActive/VeryActive
// Google data type: activity-level
// Response: dataPoints[].activityLevel.{type, duration, interval}
// Types: SEDENTARY, LIGHTLY_ACTIVE, MODERATELY_ACTIVE, VERY_ACTIVE
// Aggregated per day; stored as 4 separate custom measurements.
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleActivityMinutes(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleDataResult,
  tz = 'UTC'
) {
  const points = data?.dataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health activity level data for user ${userId}.`);
    return;
  }

  type DayBuckets = {
    sedentary: number;
    light: number;
    moderate: number;
    veryActive: number;
  };
  const byDate = new Map<string, DayBuckets>();

  for (const point of points) {
    const payload = point.activityLevel as
      | {
          type?: string;
          duration?: unknown;
          interval?: Record<string, unknown>;
        }
      | undefined;
    if (!payload) continue;

    // Determine which date this segment belongs to
    const entryDate = extractDate(point as Record<string, unknown>, tz);
    if (!entryDate) continue;

    // Duration: may be explicit "duration" field or derivable from interval
    let durationSec = 0;
    if (payload.duration) {
      const plain = String(payload.duration).match(/^(\d+(?:\.\d+)?)s$/i);
      durationSec = plain ? Math.round(parseFloat(plain[1])) : 0;
    } else if (payload.interval?.startTime && payload.interval?.endTime) {
      const s = googleTimeToIso(payload.interval.startTime);
      const e = googleTimeToIso(payload.interval.endTime);
      if (s && e) {
        durationSec = Math.round(
          (new Date(e).getTime() - new Date(s).getTime()) / 1000
        );
      }
    }
    if (durationSec <= 0) continue;

    const durationMin = durationSec / 60;
    const type: string = payload.type || '';

    if (!byDate.has(entryDate)) {
      byDate.set(entryDate, {
        sedentary: 0,
        light: 0,
        moderate: 0,
        veryActive: 0,
      });
    }
    const buckets = byDate.get(entryDate)!;
    if (type === 'SEDENTARY') buckets.sedentary += durationMin;
    else if (type === 'LIGHTLY_ACTIVE') buckets.light += durationMin;
    else if (type === 'MODERATELY_ACTIVE' || type === 'FAIRLY_ACTIVE')
      buckets.moderate += durationMin;
    else if (type === 'VERY_ACTIVE') buckets.veryActive += durationMin;
  }

  const categoryMap: Array<[keyof DayBuckets, string]> = [
    ['sedentary', 'Minutes Sedentary'],
    ['light', 'Minutes Lightly Active'],
    ['moderate', 'Minutes Fairly Active'],
    ['veryActive', 'Minutes Very Active'],
  ];

  for (const [entryDate, buckets] of byDate) {
    for (const [key, categoryName] of categoryMap) {
      const value = Math.round(buckets[key]);
      if (value <= 0) continue;
      await upsertCustomMeasurementLogic(userId, createdByUserId, {
        categoryName,
        value,
        unit: 'min',
        entryDate,
        entryHour: 0,
        entryTimestamp: new Date(entryDate).toISOString(),
        frequency: 'Daily',
      });
    }
    log(
      'info',
      `Upserted Google Health activity minutes for user ${userId} on ${entryDate}.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Distance — new metric (no Fitbit equivalent in existing integration)
// Google data type: distance (dailyRollup)
// Response: rollupDataPoints[].distance.distanceMeters (sum in metres → stored as km)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleDistance(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleRollupResult,
  _tz = 'UTC'
) {
  const points = data?.rollupDataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health distance data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const payload = point.distance as
      | { millimetersSum?: unknown; distanceMillimeters?: unknown }
      | undefined;
    if (!payload) continue;
    // Confirmed field name from Fitbit_Fetch.py: millimetersSum (mm → km = /1,000,000)
    const mm = payload.millimetersSum ?? payload.distanceMillimeters ?? null;
    if (mm === null) continue;
    const distanceKm =
      Math.round((parseFloat(mm as string) / 1_000_000) * 100) / 100;
    if (distanceKm <= 0) continue;

    const cs = point.civilStartTime as CivilStartTimePoint | undefined;
    let entryDate: string | null = null;
    if (cs?.date) {
      const d = cs.date;
      entryDate = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }
    if (!entryDate) continue;

    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Distance',
      value: distanceKm,
      unit: 'km',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health distance for user ${userId} on ${entryDate}: ${distanceKm} km.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Floors — new metric (no Fitbit equivalent in existing integration)
// Google data type: floors (dailyRollup)
// Response: rollupDataPoints[].floors.countSum (confirmed via diagnostic 2026-06-08)
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleFloors(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleRollupResult,
  _tz = 'UTC'
) {
  const points = data?.rollupDataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health floors data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const payload = point.floors as
      | { countSum?: unknown; floorCountSum?: unknown; floorsSum?: unknown }
      | undefined;
    if (!payload) {
      log(
        'warn',
        `[floors] point has no 'floors' key — keys: ${Object.keys(point).join(', ')}`
      );
      continue;
    }
    // Confirmed field name from diagnostic: countSum (not floorCountSum)
    const raw =
      payload.countSum ?? payload.floorCountSum ?? payload.floorsSum ?? null;
    if (raw === null) {
      log(
        'warn',
        `[floors] no known sum field — payload keys: ${Object.keys(payload).join(', ')}`
      );
      continue;
    }
    const floors = Math.round(parseFloat(raw as string));
    if (floors <= 0) continue;

    const cs = point.civilStartTime as CivilStartTimePoint | undefined;
    let entryDate: string | null = null;
    if (cs?.date) {
      const d = cs.date;
      entryDate = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }
    if (!entryDate) continue;

    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Floors',
      value: floors,
      unit: 'floors',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health floors for user ${userId} on ${entryDate}: ${floors}.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Daily Calories — new metric (no Fitbit equivalent in existing integration)
// Google data type: total-calories (dailyRollup)
// Response: rollupDataPoints[].totalCalories.kilocaloriesSum
// ──────────────────────────────────────────────────────────────────────────────
async function processGoogleCalories(
  userId: UserId,
  createdByUserId: UserId,
  data: GoogleRollupResult,
  _tz = 'UTC'
) {
  const points = data?.rollupDataPoints;
  if (!points || points.length === 0) {
    log('info', `No Google Health daily calories data for user ${userId}.`);
    return;
  }
  for (const point of points) {
    const payload = point.totalCalories as
      | {
          kcalSum?: unknown;
          kilocaloriesSum?: unknown;
          energyKilocaloriesSum?: unknown;
        }
      | undefined;
    if (!payload) continue;
    // Confirmed field name from Fitbit_Fetch.py: kcalSum
    const raw =
      payload.kcalSum ??
      payload.kilocaloriesSum ??
      payload.energyKilocaloriesSum ??
      null;
    if (raw === null) continue;
    const kcal = Math.round(parseFloat(raw as string));
    if (kcal <= 0) continue;

    const cs = point.civilStartTime as CivilStartTimePoint | undefined;
    let entryDate: string | null = null;
    if (cs?.date) {
      const d = cs.date;
      entryDate = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }
    if (!entryDate) continue;

    await upsertCustomMeasurementLogic(userId, createdByUserId, {
      categoryName: 'Daily Calories',
      value: kcal,
      unit: 'kcal',
      entryDate,
      entryHour: 0,
      entryTimestamp: new Date(entryDate).toISOString(),
      frequency: 'Daily',
    });
    log(
      'info',
      `Upserted Google Health daily calories for user ${userId} on ${entryDate}: ${kcal} kcal.`
    );
  }
}

export { processGoogleHeartRate };
export { processGoogleSteps };
export { processGoogleWeight };
export { processGoogleSpO2 };
export { processGoogleTemperature };
export { processGoogleProfile };
export { processGoogleHRV };
export { processGoogleRespiratoryRate };
export { processGoogleActiveZoneMinutes };
export { processGoogleSleep };
export { processGoogleActivities };
export { processGoogleBodyFat };
export { processGoogleWater };
export { processGoogleCoreTemperature };
export { processGoogleVO2Max };
export { processGoogleActivityMinutes };
export { processGoogleDistance };
export { processGoogleFloors };
export { processGoogleCalories };
export default {
  processGoogleHeartRate,
  processGoogleSteps,
  processGoogleWeight,
  processGoogleSpO2,
  processGoogleTemperature,
  processGoogleProfile,
  processGoogleHRV,
  processGoogleRespiratoryRate,
  processGoogleActiveZoneMinutes,
  processGoogleSleep,
  processGoogleActivities,
  processGoogleBodyFat,
  processGoogleWater,
  processGoogleCoreTemperature,
  processGoogleVO2Max,
  processGoogleActivityMinutes,
  processGoogleDistance,
  processGoogleFloors,
  processGoogleCalories,
};
