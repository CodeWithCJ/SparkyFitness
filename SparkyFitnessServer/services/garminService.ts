import { log } from '../config/logging.js';
import garminConnectService from '../integrations/garminconnect/garminConnectService.js';
import { parseGarminHealthMeasurements } from '../integrations/garminconnect/garminMeasurementMapping.js';
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
 * Helper to process and persist a single chunk of Health and Wellness data.
 */
async function processHealthChunk(
  userId: string,
  healthData: Record<string, Array<Record<string, unknown>>>,
  startDate: string,
  endDate: string
) {
  const processedGarminHealthData = await processGarminHealthAndWellnessData(
    userId,
    userId,
    healthData,
    startDate,
    endDate
  );

  const processedHealthData = parseGarminHealthMeasurements(healthData);

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
    healthData &&
    Array.isArray(healthData.sleep) &&
    healthData.sleep.length > 0
  ) {
    processedSleepData = await processGarminSleepData(
      userId,
      userId,
      healthData.sleep,
      startDate,
      endDate
    );
  }

  return {
    processedGarminHealthData,
    measurementServiceResult,
    processedSleepData,
    processedEntries: processedHealthData.length,
  };
}

/**
 * Main orchestrator for syncing all Garmin telemetry and health data streams for a given user.
 * Processes and persists data incrementally chunk-by-chunk to prevent memory bloating, socket timeouts,
 * and loss of partial sync progress.
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

  const chunks = garminConnectService.getGarminDateChunks(
    startDate,
    endDate,
    7
  );
  log(
    'info',
    `[garminService] Range ${startDate} to ${endDate} split into ${chunks.length} incremental chunks.`
  );

  const results: GarminSyncResult = {
    health: null,
    activities: null,
    nutrition: null,
  };

  let totalProcessedHealth = 0;
  let totalProcessedActivities = 0;
  let totalProcessedNutrition = 0;
  let lastHealthResult: Record<string, unknown> | null = null;
  const healthErrors: string[] = [];
  const activityErrors: string[] = [];
  const nutritionErrors: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    log(
      'info',
      `[garminService] Processing chunk ${i + 1}/${chunks.length} (${chunk.start} to ${chunk.end}) for user ${userId}...`
    );

    // Phase 1: Health and Wellness for this chunk
    try {
      const healthData =
        await garminConnectService.fetchGarminHealthAndWellnessChunk(
          userId,
          chunk.start,
          chunk.end,
          []
        );
      const healthChunkResult = await processHealthChunk(
        userId,
        healthData.data,
        chunk.start,
        chunk.end
      );
      totalProcessedHealth += healthChunkResult.processedEntries || 0;
      lastHealthResult = healthChunkResult;
    } catch (healthError: unknown) {
      const errMsg =
        healthError instanceof Error
          ? healthError.message
          : String(healthError);
      log(
        'error',
        `[garminService] Error during health sync for chunk ${chunk.start} to ${chunk.end}:`,
        errMsg
      );
      healthErrors.push(`[${chunk.start}..${chunk.end}]: ${errMsg}`);
    }

    // Phase 2: Activities and Workouts for this chunk
    try {
      const activitiesData =
        await garminConnectService.fetchGarminActivitiesAndWorkoutsChunk(
          userId,
          chunk.start,
          chunk.end
        );
      const actResult = await processActivitiesAndWorkouts(
        userId,
        activitiesData,
        chunk.start,
        chunk.end,
        tz
      );
      totalProcessedActivities += actResult.processedEntries;
    } catch (activitiesError: unknown) {
      const errMsg =
        activitiesError instanceof Error
          ? activitiesError.message
          : String(activitiesError);
      log(
        'error',
        `[garminService] Error during activities sync for chunk ${chunk.start} to ${chunk.end}:`,
        errMsg
      );
      activityErrors.push(`[${chunk.start}..${chunk.end}]: ${errMsg}`);
    }

    // Phase 3: Nutrition Diary for this chunk
    try {
      const nutritionData =
        await garminConnectService.fetchGarminNutritionDiaryChunk(
          userId,
          chunk.start,
          chunk.end
        );
      const nutrResult = await processGarminNutritionData(
        userId,
        nutritionData.nutrition_data,
        chunk.start,
        chunk.end
      );
      totalProcessedNutrition += nutrResult.processedEntries;
    } catch (nutritionError: unknown) {
      const errMsg =
        nutritionError instanceof Error
          ? nutritionError.message
          : String(nutritionError);
      log(
        'error',
        `[garminService] Error during nutrition sync for chunk ${chunk.start} to ${chunk.end}:`,
        errMsg
      );
      nutritionErrors.push(`[${chunk.start}..${chunk.end}]: ${errMsg}`);
    }
  }

  // Finalize Phase 1 result
  if (healthErrors.length === chunks.length) {
    results.health = { error: healthErrors.join('; ') };
  } else {
    results.health = {
      ...(lastHealthResult || {}),
      processedEntries: totalProcessedHealth,
      ...(healthErrors.length > 0 ? { partialErrors: healthErrors } : {}),
    };
  }

  // Finalize Phase 2 result
  if (activityErrors.length === chunks.length) {
    results.activities = { error: activityErrors.join('; ') };
  } else {
    results.activities = {
      processedEntries: totalProcessedActivities,
      ...(activityErrors.length > 0 ? { partialErrors: activityErrors } : {}),
    };
  }

  // Finalize Phase 3 result
  if (nutritionErrors.length === chunks.length) {
    results.nutrition = { error: nutritionErrors.join('; ') };
  } else {
    results.nutrition = {
      processedEntries: totalProcessedNutrition,
      ...(nutritionErrors.length > 0 ? { partialErrors: nutritionErrors } : {}),
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
