import measurementRepository from '../../models/measurementRepository.js';
import { log } from '../../config/logging.js';
import exerciseRepository from '../../models/exercise.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import sleepRepository from '../../models/sleepRepository.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import { instantToDay } from '@workspace/shared';
import type {
  OuraSleepPeriod,
  OuraDailySleep,
  OuraDailyActivity,
  OuraDailyReadiness,
  OuraDailySpo2,
  OuraDailyStress,
  OuraDailyCardiovascularAge,
  OuraVo2Max,
  OuraHeartRateSample,
  OuraWorkout,
} from './ouraService.js';

const OURA_SOURCE = 'Oura';
const OURA_NAP_SOURCE = 'Oura Nap';

const SLEEP_PHASE_MAPPING: Record<string, string> = {
  '1': 'deep',
  '2': 'light',
  '3': 'rem',
  '4': 'awake',
};
const SLEEP_PHASE_BLOCK_SECONDS = 300;

interface SleepStage {
  stage_type: string;
  start_time: string;
  end_time: string;
  duration_in_seconds: number;
}

interface CustomMeasurementInput {
  categoryName: string;
  value: number;
  unit: string;
  entryDate: string;
  entryHour: number;
  entryTimestamp: string;
  frequency: string;
}

/**
 * Parses Oura's sleep_phase_5_min string into stage segments, merging
 * consecutive blocks of the same phase into one segment.
 */
function parseSleepPhases(
  phaseString: string | null,
  bedtimeStart: string
): SleepStage[] {
  if (!phaseString) {
    return [];
  }
  const startMs = new Date(bedtimeStart).getTime();
  if (isNaN(startMs)) {
    return [];
  }
  const stages: SleepStage[] = [];
  let segmentStartIndex = 0;
  for (let i = 1; i <= phaseString.length; i++) {
    if (i === phaseString.length || phaseString[i] !== phaseString[i - 1]) {
      const stageType = SLEEP_PHASE_MAPPING[phaseString[segmentStartIndex]];
      if (stageType) {
        const segmentStartMs =
          startMs + segmentStartIndex * SLEEP_PHASE_BLOCK_SECONDS * 1000;
        const segmentEndMs = startMs + i * SLEEP_PHASE_BLOCK_SECONDS * 1000;
        stages.push({
          stage_type: stageType,
          start_time: new Date(segmentStartMs).toISOString(),
          end_time: new Date(segmentEndMs).toISOString(),
          duration_in_seconds:
            (i - segmentStartIndex) * SLEEP_PHASE_BLOCK_SECONDS,
        });
      }
      segmentStartIndex = i;
    }
  }
  return stages;
}

async function upsertCustomMeasurementLogic(
  userId: string,
  createdByUserId: string,
  customMeasurement: CustomMeasurementInput,
  source = 'manual'
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
    const newCategoryData = {
      user_id: userId,
      name: categoryName,
      frequency: frequency,
      measurement_type: unit || 'health',
      data_type: typeof value === 'number' ? 'numeric' : 'text',
      created_by_user_id: createdByUserId,
    };
    const newCategory =
      await measurementRepository.createCustomCategory(newCategoryData);
    categoryId = newCategory.id;
    log(
      'info',
      `Created new custom category '${categoryName}' for user ${userId}.`
    );
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
    null, // notes
    frequency,
    source
  );
}

/**
 * Persists Oura sleep periods and daily sleep scores.
 * Main sleep periods ('long_sleep') become Oura sleep entries. Naps
 * ('sleep' / 'late_nap') become 'Oura Nap' entries, aggregated per day.
 */
async function processOuraSleep(
  userId: string,
  createdByUserId: string,
  sleepPeriods: OuraSleepPeriod[] = [],
  dailySleep: OuraDailySleep[] = []
) {
  const periods = Array.isArray(sleepPeriods) ? sleepPeriods : [];
  const summaries = Array.isArray(dailySleep) ? dailySleep : [];
  if (periods.length === 0 && summaries.length === 0) {
    log('info', `No Oura sleep data to process for user ${userId}.`);
    return;
  }
  const scoreByDay = new Map<string, number>();
  for (const summary of summaries) {
    if (summary.day && summary.score !== null && summary.score !== undefined) {
      scoreByDay.set(summary.day, summary.score);
    }
  }
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const allDays = [
    ...periods.map((p) => p.day),
    ...summaries.map((s) => s.day),
  ].filter(Boolean);
  for (const day of allDays) {
    if (!minDate || day < minDate) minDate = day;
    if (!maxDate || day > maxDate) maxDate = day;
  }
  if (minDate && maxDate) {
    await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
      userId,
      OURA_SOURCE,
      minDate,
      maxDate
    );
    await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
      userId,
      OURA_NAP_SOURCE,
      minDate,
      maxDate
    );
    log(
      'info',
      `Deleted existing Oura sleep entries between ${minDate} and ${maxDate} for user ${userId}.`
    );
  }
  // Split periods into main sleep and naps. 'deleted' and 'rest' periods are skipped
  const nightsByDay = new Map<string, OuraSleepPeriod>();
  const napsByDay = new Map<string, OuraSleepPeriod[]>();
  for (const period of periods) {
    if (!period.day || !period.bedtime_start || !period.bedtime_end) {
      log(
        'warn',
        `Skipping Oura sleep period with missing fields: ${period.id}`
      );
      continue;
    }
    if (period.type === 'long_sleep') {
      const existing = nightsByDay.get(period.day);
      // Keep the longest main sleep period if Oura reports several for one day
      if (
        !existing ||
        (period.total_sleep_duration || 0) >
          (existing.total_sleep_duration || 0)
      ) {
        nightsByDay.set(period.day, period);
      }
    } else if (period.type === 'sleep' || period.type === 'late_nap') {
      const naps = napsByDay.get(period.day) || [];
      naps.push(period);
      napsByDay.set(period.day, naps);
    }
  }
  // 1. Main sleep entries
  for (const [day, period] of nightsByDay.entries()) {
    const stages = parseSleepPhases(
      period.sleep_phase_5_min,
      period.bedtime_start
    );
    const awakeCount = stages.filter((s) => s.stage_type === 'awake').length;
    const sleepEntryData = {
      entry_date: day,
      bedtime: new Date(period.bedtime_start).toISOString(),
      wake_time: new Date(period.bedtime_end).toISOString(),
      duration_in_seconds: period.time_in_bed || 0,
      time_asleep_in_seconds: period.total_sleep_duration || 0,
      sleep_score: scoreByDay.get(day) || 0,
      source: OURA_SOURCE,
      awake_count: awakeCount,
      deep_sleep_seconds: period.deep_sleep_duration || 0,
      light_sleep_seconds: period.light_sleep_duration || 0,
      rem_sleep_seconds: period.rem_sleep_duration || 0,
      awake_sleep_seconds: period.awake_time || 0,
      resting_heart_rate: period.lowest_heart_rate || null,
      avg_overnight_hrv: period.average_hrv || null,
      average_respiration_value: period.average_breath || null,
    };
    const createdEntry = await sleepRepository.upsertSleepEntry(
      userId,
      createdByUserId,
      sleepEntryData
    );
    for (const stage of stages) {
      await sleepRepository.upsertSleepStageEvent(
        userId,
        createdEntry.id,
        stage,
        createdByUserId
      );
    }
    log(
      'info',
      `Processed Oura sleep entry for ${day} for user ${userId} (${stages.length} stages).`
    );
  }
  // 2. Nap entries
  for (const [day, naps] of napsByDay.entries()) {
    naps.sort((a, b) => a.bedtime_start.localeCompare(b.bedtime_start));
    const allStages: SleepStage[] = [];
    let timeInBed = 0;
    let timeAsleep = 0;
    let deepSeconds = 0;
    let lightSeconds = 0;
    let remSeconds = 0;
    let awakeSeconds = 0;
    for (const nap of naps) {
      timeInBed += nap.time_in_bed || 0;
      timeAsleep += nap.total_sleep_duration || 0;
      deepSeconds += nap.deep_sleep_duration || 0;
      lightSeconds += nap.light_sleep_duration || 0;
      remSeconds += nap.rem_sleep_duration || 0;
      awakeSeconds += nap.awake_time || 0;
      allStages.push(
        ...parseSleepPhases(nap.sleep_phase_5_min, nap.bedtime_start)
      );
    }
    const napEntryData = {
      entry_date: day,
      bedtime: new Date(naps[0].bedtime_start).toISOString(),
      wake_time: new Date(naps[naps.length - 1].bedtime_end).toISOString(),
      duration_in_seconds: timeInBed,
      time_asleep_in_seconds: timeAsleep,
      sleep_score: 0,
      source: OURA_NAP_SOURCE,
      awake_count: allStages.filter((s) => s.stage_type === 'awake').length,
      deep_sleep_seconds: deepSeconds,
      light_sleep_seconds: lightSeconds,
      rem_sleep_seconds: remSeconds,
      awake_sleep_seconds: awakeSeconds,
      resting_heart_rate: null,
      avg_overnight_hrv: null,
      average_respiration_value: null,
    };
    const createdEntry = await sleepRepository.upsertSleepEntry(
      userId,
      createdByUserId,
      napEntryData
    );
    for (const stage of allStages) {
      await sleepRepository.upsertSleepStageEvent(
        userId,
        createdEntry.id,
        stage,
        createdByUserId
      );
    }
    log(
      'info',
      `Processed ${naps.length} Oura nap(s) for ${day} for user ${userId}.`
    );
  }
}

async function processOuraDailyActivity(
  userId: string,
  createdByUserId: string,
  activities: OuraDailyActivity[] = []
) {
  if (!Array.isArray(activities) || activities.length === 0) {
    log('info', `No Oura daily activity data to process for user ${userId}.`);
    return;
  }
  for (const activity of activities) {
    const entryDate = activity.day;
    if (!entryDate) continue;
    if (activity.steps !== undefined && activity.steps !== null) {
      await measurementRepository.upsertStepData(
        userId,
        createdByUserId,
        activity.steps,
        entryDate
      );
      log(
        'info',
        `Upserted Oura daily steps for user ${userId} on ${entryDate}: ${activity.steps}.`
      );
    }
    const dailyMetrics: Array<{
      categoryName: string;
      value: number | null;
      unit: string;
    }> = [
      {
        categoryName: 'Metabolism',
        value: activity.total_calories,
        unit: 'kcal',
      },
      {
        categoryName: 'Active Calories',
        value: activity.active_calories,
        unit: 'kcal',
      },
      { categoryName: 'Activity Score', value: activity.score, unit: 'score' },
    ];
    for (const metric of dailyMetrics) {
      if (metric.value === undefined || metric.value === null) continue;
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: metric.categoryName,
          value: metric.value,
          unit: metric.unit,
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        OURA_SOURCE
      );
    }
  }
}

async function processOuraDailyReadiness(
  userId: string,
  createdByUserId: string,
  readiness: OuraDailyReadiness[] = []
) {
  if (!Array.isArray(readiness) || readiness.length === 0) {
    log('info', `No Oura daily readiness data to process for user ${userId}.`);
    return;
  }
  for (const entry of readiness) {
    const entryDate = entry.day;
    if (!entryDate) continue;
    if (entry.score !== undefined && entry.score !== null) {
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: 'Readiness Score',
          value: entry.score,
          unit: 'score',
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        OURA_SOURCE
      );
    }
    if (
      entry.temperature_deviation !== undefined &&
      entry.temperature_deviation !== null
    ) {
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: 'Skin Temperature Variation',
          value: entry.temperature_deviation,
          unit: '°C',
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        OURA_SOURCE
      );
    }
  }
}

async function processOuraDailySpo2(
  userId: string,
  createdByUserId: string,
  spo2Entries: OuraDailySpo2[] = []
) {
  if (!Array.isArray(spo2Entries) || spo2Entries.length === 0) {
    log('info', `No Oura daily SpO2 data to process for user ${userId}.`);
    return;
  }
  for (const entry of spo2Entries) {
    const entryDate = entry.day;
    if (!entryDate) continue;
    const average = entry.spo2_percentage?.average;
    if (average !== undefined && average !== null) {
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: 'SpO2',
          value: average,
          unit: '%',
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        OURA_SOURCE
      );
    }
    if (
      entry.breathing_disturbance_index !== undefined &&
      entry.breathing_disturbance_index !== null
    ) {
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: 'Breathing Disturbance Index',
          value: entry.breathing_disturbance_index,
          unit: 'index',
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        OURA_SOURCE
      );
    }
  }
}

async function processOuraDailyStress(
  userId: string,
  createdByUserId: string,
  stressEntries: OuraDailyStress[] = []
) {
  if (!Array.isArray(stressEntries) || stressEntries.length === 0) {
    log('info', `No Oura daily stress data to process for user ${userId}.`);
    return;
  }
  for (const entry of stressEntries) {
    const entryDate = entry.day;
    if (!entryDate) continue;
    const stressMetrics: Array<{ categoryName: string; value: number | null }> =
      [
        { categoryName: 'Stress High Minutes', value: entry.stress_high },
        { categoryName: 'Recovery High Minutes', value: entry.recovery_high },
      ];
    for (const metric of stressMetrics) {
      if (metric.value === undefined || metric.value === null) continue;
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: metric.categoryName,
          value: Math.round(metric.value / 60),
          unit: 'minutes',
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        OURA_SOURCE
      );
    }
  }
}

async function processOuraCardioAge(
  userId: string,
  createdByUserId: string,
  cardioAgeEntries: OuraDailyCardiovascularAge[] = []
) {
  if (!Array.isArray(cardioAgeEntries) || cardioAgeEntries.length === 0) {
    log(
      'info',
      `No Oura cardiovascular age data to process for user ${userId}.`
    );
    return;
  }
  for (const entry of cardioAgeEntries) {
    const entryDate = entry.day;
    if (
      !entryDate ||
      entry.vascular_age === undefined ||
      entry.vascular_age === null
    ) {
      continue;
    }
    await upsertCustomMeasurementLogic(
      userId,
      createdByUserId,
      {
        categoryName: 'Vascular Age',
        value: entry.vascular_age,
        unit: 'years',
        entryDate: entryDate,
        entryHour: 0,
        entryTimestamp: new Date(entryDate).toISOString(),
        frequency: 'Daily',
      },
      OURA_SOURCE
    );
  }
}

async function processOuraVo2Max(
  userId: string,
  createdByUserId: string,
  vo2MaxEntries: OuraVo2Max[] = []
) {
  if (!Array.isArray(vo2MaxEntries) || vo2MaxEntries.length === 0) {
    log('info', `No Oura VO2 max data to process for user ${userId}.`);
    return;
  }
  for (const entry of vo2MaxEntries) {
    const entryDate = entry.day;
    if (!entryDate || entry.vo2_max === undefined || entry.vo2_max === null) {
      continue;
    }
    await upsertCustomMeasurementLogic(
      userId,
      createdByUserId,
      {
        categoryName: 'VO2 Max',
        value: entry.vo2_max,
        unit: 'ml/min/kg',
        entryDate: entryDate,
        entryHour: 0,
        entryTimestamp: new Date(entryDate).toISOString(),
        frequency: 'Daily',
      },
      OURA_SOURCE
    );
  }
}

async function processOuraHeartRate(
  userId: string,
  createdByUserId: string,
  samples: OuraHeartRateSample[] = [],
  timezone = 'UTC'
) {
  if (!Array.isArray(samples) || samples.length === 0) {
    log('info', `No Oura heart rate data to process for user ${userId}.`);
    return;
  }
  interface HourBucket {
    entryDate: string;
    entryHour: number;
    entryTimestamp: string;
    total: number;
    count: number;
  }
  const buckets = new Map<string, HourBucket>();
  for (const sample of samples) {
    if (!sample.timestamp || sample.bpm === null || sample.bpm === undefined)
      continue;
    const sampleMs = new Date(sample.timestamp).getTime();
    if (isNaN(sampleMs)) continue;
    const entryDate = instantToDay(sampleMs, timezone);
    const entryHour = new Date(sampleMs).getUTCHours();
    const key = `${entryDate}|${entryHour}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.total += sample.bpm;
      bucket.count += 1;
    } else {
      buckets.set(key, {
        entryDate,
        entryHour,
        entryTimestamp: new Date(sampleMs).toISOString(),
        total: sample.bpm,
        count: 1,
      });
    }
  }
  for (const bucket of buckets.values()) {
    await upsertCustomMeasurementLogic(
      userId,
      createdByUserId,
      {
        categoryName: 'Heart Rate',
        value: Math.round(bucket.total / bucket.count),
        unit: 'bpm',
        entryDate: bucket.entryDate,
        entryHour: bucket.entryHour,
        entryTimestamp: bucket.entryTimestamp,
        frequency: 'Hourly',
      },
      OURA_SOURCE
    );
  }
  log(
    'info',
    `Upserted ${buckets.size} hourly Oura heart rate averages for user ${userId}.`
  );
}

function titleCaseActivity(activity: string) {
  return activity
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function processOuraWorkouts(
  userId: string,
  createdByUserId: string,
  workouts: OuraWorkout[] = [],
  timezone = 'UTC'
) {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    log('info', `No Oura workout data to process for user ${userId}.`);
    return;
  }
  // Delete existing Oura exercise entries for the covered dates to prevent duplicates
  const processedDates = new Set<string>();
  for (const workout of workouts) {
    const startMs = new Date(workout.start_datetime).getTime();
    if (isNaN(startMs)) {
      log('warn', `Invalid start_datetime in Oura workout: ${workout.id}`);
      continue;
    }
    const entryDate = instantToDay(startMs, timezone);
    if (!processedDates.has(entryDate)) {
      await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(
        userId,
        entryDate,
        entryDate,
        OURA_SOURCE
      );
      processedDates.add(entryDate);
    }
  }
  for (const workout of workouts) {
    try {
      const startMs = new Date(workout.start_datetime).getTime();
      const endMs = new Date(workout.end_datetime).getTime();
      if (isNaN(startMs) || isNaN(endMs)) continue;
      const activityKey = workout.activity || 'other';
      const exerciseName = titleCaseActivity(activityKey);
      const exerciseSourceId = `oura-workout-${activityKey}`;
      let exercise = await exerciseRepository.getExerciseBySourceAndSourceId(
        OURA_SOURCE,
        exerciseSourceId,
        userId
      );
      if (!exercise) {
        // If not found by source and sourceId, try to find by name (for user-created exercises)
        const searchResults = await exerciseRepository.searchExercises(
          exerciseName,
          userId,
          null,
          null
        );
        if (searchResults && searchResults.length > 0) {
          exercise = searchResults[0];
          log(
            'info',
            `Found existing exercise by name for Oura workout activity '${activityKey}': ${exerciseName}`
          );
        }
      }
      const durationSeconds = Math.round((endMs - startMs) / 1000);
      if (!exercise) {
        const newExerciseData = {
          user_id: userId,
          name: exerciseName,
          category: 'Cardio',
          calories_per_hour:
            workout.calories && durationSeconds > 0
              ? Math.round(workout.calories / (durationSeconds / 3600))
              : 300,
          description: `Automatically created from Oura workout activity '${activityKey}'.`,
          is_custom: true,
          shared_with_public: false,
          source: OURA_SOURCE,
          source_id: exerciseSourceId,
        };
        exercise = await exerciseRepository.createExercise(newExerciseData);
        log(
          'info',
          `Created new exercise for Oura workout activity '${activityKey}': ${exercise.name}`
        );
      }
      const durationMinutes = Math.round(durationSeconds / 60);
      const entryDate = instantToDay(startMs, timezone);
      const caloriesBurned = workout.calories || 0;
      const noteParts = [`Logged from Oura workout: ${exerciseName}.`];
      if (workout.distance) {
        noteParts.push(`Distance: ${Math.round(workout.distance)}m.`);
      }
      if (workout.intensity) {
        noteParts.push(`Intensity: ${workout.intensity}.`);
      }
      if (workout.label) {
        noteParts.push(`Label: ${workout.label}.`);
      }
      const exerciseEntryData = {
        exercise_id: exercise.id,
        duration_minutes: durationMinutes,
        calories_burned: caloriesBurned,
        entry_date: entryDate,
        notes: noteParts.join(' '),
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            reps: 1,
            weight: 0,
            duration: durationMinutes,
            rest_time: 0,
            notes: '',
          },
        ],
      };
      const newEntry = await exerciseEntryRepository.createExerciseEntry(
        userId,
        exerciseEntryData,
        createdByUserId,
        OURA_SOURCE
      );
      log(
        'info',
        `Logged Oura workout entry for user ${userId}: ${exercise.name} on ${entryDate}.`
      );
      if (newEntry && newEntry.id) {
        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_entry_id: newEntry.id,
          provider_name: OURA_SOURCE,
          detail_type: 'workout_summary',
          detail_data: { ...workout },
          created_by_user_id: createdByUserId,
        });
      }
    } catch (error) {
      const err = error as Error;
      log(
        'error',
        `Error processing Oura workout for user ${userId}, activity '${workout.activity}': ${err.name}: ${err.message}`
      );
    }
  }
}

export { processOuraSleep };
export { processOuraDailyActivity };
export { processOuraDailyReadiness };
export { processOuraDailySpo2 };
export { processOuraDailyStress };
export { processOuraCardioAge };
export { processOuraVo2Max };
export { processOuraHeartRate };
export { processOuraWorkouts };
export { parseSleepPhases };
export default {
  processOuraSleep,
  processOuraDailyActivity,
  processOuraDailyReadiness,
  processOuraDailySpo2,
  processOuraDailyStress,
  processOuraCardioAge,
  processOuraVo2Max,
  processOuraHeartRate,
  processOuraWorkouts,
  parseSleepPhases,
};
