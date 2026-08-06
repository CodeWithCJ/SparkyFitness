import { log } from '../config/logging.js';
import garminConnectService from '../integrations/garminconnect/garminConnectService.js';
import garminMeasurementMapping from '../integrations/garminconnect/garminMeasurementMapping.js';
import moment from 'moment';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays } from '@workspace/shared';
import measurementService from './measurementService.js';
import type { GarminSyncResult } from './garminSyncResult.js';

import {
  mapGarminExerciseCategory,
  formatExerciseName,
  getOrCreateGarminExercise,
} from './garmin/garminExerciseMapper.js';

import {
  processActivitiesAndWorkouts,
  processGarminWorkoutSession,
  processGarminWorkoutDefinition,
  processGarminSimpleActivity,
} from './garmin/garminActivityProcessor.js';

import {
  processGarminHealthAndWellnessData,
  processGarminSleepData,
  processGarminNutritionData,
} from './garmin/garminHealthProcessor.js';

/**
 * Main orchestrator for syncing all Garmin telemetry and health data streams for a given user.
 */
async function syncGarminData(
  userId: string,
  syncType = 'manual',
  customStartDate: string | null = null,
  customEndDate: string | null = null
) {
  let startDate: string, endDate: string;
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);

  if (customStartDate) {
    startDate = customStartDate;
    endDate = customEndDate || today;
  } else if (syncType === 'manual') {
    endDate = today;
    startDate = addDays(today, -7);
  } else if (syncType === 'scheduled') {
    endDate = today;
    startDate = today;
  } else {
    throw new Error("Invalid syncType. Must be 'manual' or 'scheduled'.");
  }

  log(
    'info',
    `[garminService] Starting Garmin sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}.`
  );

  const results: GarminSyncResult = {
    health: null,
    activities: null,
    nutrition: null,
  };

  // Phase 1: Health and Wellness — runs independently
  try {
    log('info', '[garminService] Fetching Health and Wellness data...');
    const healthWellnessData =
      await garminConnectService.syncGarminHealthAndWellness(
        userId,
        startDate,
        endDate,
        []
      );

    const processedGarminHealthData = await processGarminHealthAndWellnessData(
      userId,
      userId,
      healthWellnessData.data,
      startDate,
      endDate
    );

    const processedHealthData: any[] = [];
    for (const metric in healthWellnessData.data) {
      if (metric === 'stress') continue;
      const dailyEntries = healthWellnessData.data[metric];
      if (Array.isArray(dailyEntries)) {
        for (const entry of dailyEntries) {
          const calendarDateRaw = entry.date;
          if (!calendarDateRaw) continue;
          const calendarDate = moment(calendarDateRaw).format('YYYY-MM-DD');
          for (const key in entry) {
            if (key === 'date') continue;
            let mapping = (garminMeasurementMapping as Record<string, any>)[
              key
            ];
            if (!mapping && key === 'value') {
              mapping = (garminMeasurementMapping as Record<string, any>)[
                metric
              ];
            }
            if (mapping) {
              const value = entry[key];
              if (value === null || value === undefined) continue;
              if (
                value === 0 &&
                mapping.targetType === 'check_in' &&
                (mapping.field === 'weight' ||
                  mapping.field === 'body_fat_percentage')
              )
                continue;
              const type =
                mapping.targetType === 'check_in'
                  ? mapping.field
                  : mapping.name;
              processedHealthData.push({
                type: type,
                value: value,
                date: calendarDate,
                source: 'garmin',
                dataType: mapping.dataType,
                measurementType: mapping.measurementType,
              });
            }
          }
        }
      }
    }

    let measurementServiceResult = {};
    if (processedHealthData.length > 0) {
      measurementServiceResult = await measurementService.processHealthData(
        processedHealthData,
        userId,
        userId
      );
    }

    let processedSleepData = {};
    if (
      healthWellnessData.data &&
      healthWellnessData.data.sleep &&
      healthWellnessData.data.sleep.length > 0
    ) {
      processedSleepData = await processGarminSleepData(
        userId,
        userId,
        healthWellnessData.data.sleep,
        startDate,
        endDate
      );
    }

    results.health = {
      processedGarminHealthData,
      measurementServiceResult,
      processedSleepData,
    };
  } catch (healthError) {
    log(
      'error',
      `[garminService] Error during health sync for user ${userId}:`,
      healthError
    );
    results.health = {
      error:
        healthError instanceof Error
          ? healthError.message
          : String(healthError),
    };
  }

  // Phase 2: Activities and Workouts — always runs
  try {
    log('info', '[garminService] Fetching Activities and Workouts data...');
    const activitiesData =
      await garminConnectService.fetchGarminActivitiesAndWorkouts(
        userId,
        startDate,
        endDate
      );

    const processedActivities = await processActivitiesAndWorkouts(
      userId,
      activitiesData,
      startDate,
      endDate,
      tz
    );
    results.activities = processedActivities;
  } catch (activitiesError) {
    log(
      'error',
      `[garminService] Error during activities sync for user ${userId}:`,
      activitiesError
    );
    results.activities = {
      error:
        activitiesError instanceof Error
          ? activitiesError.message
          : String(activitiesError),
    };
  }

  // Phase 3: Nutrition Diary — runs independently
  try {
    log('info', '[garminService] Fetching Nutrition Diary data...');
    const nutritionData = await garminConnectService.fetchGarminNutritionDiary(
      userId,
      startDate,
      endDate
    );
    const processedNutrition = await processGarminNutritionData(
      userId,
      nutritionData.nutrition_data,
      startDate,
      endDate
    );
    results.nutrition = processedNutrition;
  } catch (nutritionError) {
    log(
      'error',
      `[garminService] Error during nutrition sync for user ${userId}:`,
      nutritionError
    );
    results.nutrition = {
      error:
        nutritionError instanceof Error
          ? nutritionError.message
          : String(nutritionError),
    };
  }

  log('info', `[garminService] Full Garmin sync completed for user ${userId}.`);
  return results;
}

export {
  processActivitiesAndWorkouts,
  processGarminWorkoutSession,
  processGarminWorkoutDefinition,
  processGarminSimpleActivity,
  processGarminSleepData,
  processGarminHealthAndWellnessData,
  processGarminNutritionData,
  syncGarminData,
  mapGarminExerciseCategory,
  formatExerciseName,
  getOrCreateGarminExercise,
};

export default {
  processActivitiesAndWorkouts,
  processGarminWorkoutSession,
  processGarminWorkoutDefinition,
  processGarminSimpleActivity,
  processGarminSleepData,
  processGarminHealthAndWellnessData,
  processGarminNutritionData,
  syncGarminData,
  mapGarminExerciseCategory,
  formatExerciseName,
  getOrCreateGarminExercise,
};
