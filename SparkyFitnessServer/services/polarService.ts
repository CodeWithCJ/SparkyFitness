import { setMockDataContext } from '../utils/mockDataContext.js';
import { log } from '../config/logging.js';
import polarIntegrationService from '../integrations/polar/polarService.js';
import polarDataProcessor from '../integrations/polar/polarDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';

/**
 * Orchestrate a full Polar data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 * @param {string} providerId - Optional provider ID
 * @param {string} [startDate] - Optional custom start date (YYYY-MM-DD)
 * @param {string} [endDate] - Optional custom end date (YYYY-MM-DD)
 * @param {string} [dataSource] - Optional data source ('local' vs 'polar')
 * @param {boolean} [saveMockData] - Optional flag to capture raw API responses
 */
async function syncPolarData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  syncType = 'manual',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any,
  startDate = null,
  endDate = null,
  dataSource: string | null = null,
  saveMockData = false
) {
  const polarDataSource = dataSource || 'polar';
  setMockDataContext({ dataSource, saveMockData });
  log(
    'info',
    `[polarService] Starting Polar sync (${syncType}) for user ${userId}${providerId ? ` (Provider ID: ${providerId})` : ''}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}. Loading from: ${polarDataSource}`
  );
  if (polarDataSource === 'local') {
    log(
      'info',
      `[polarService] Replaying Polar sync from raw diagnostic bundle for user ${userId}`
    );
    const bundle = loadRawBundle('polar');
    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with live API ' +
          'and "Capture Mock Data" enabled to capture raw API responses first.'
      );
    }
    const responses = bundle.responses;
    try {
      // Process physical info (collection and individual items)
      const allPhysicalInfo = [];
      if (responses['raw_physical_info_list']) {
        allPhysicalInfo.push(...responses['raw_physical_info_list'].data);
      }
      Object.keys(responses).forEach((key) => {
        if (key.startsWith('raw_physical_info_item_')) {
          allPhysicalInfo.push(responses[key].data);
        }
      });
      // Legacy support for older bundles
      if (responses['raw_physical_info_item'] && allPhysicalInfo.length === 0) {
        allPhysicalInfo.push(responses['raw_physical_info_item'].data);
      }
      // User Profile Fallback for mock data (to get weight/height)
      if (allPhysicalInfo.length === 0 && responses['raw_user_profile']) {
        const userProfile = responses['raw_user_profile'].data;
        if (userProfile && (userProfile.weight || userProfile.height)) {
          allPhysicalInfo.push({
            weight: userProfile.weight,
            height: userProfile.height,
            created: new Date().toISOString(),
          });
        }
      }
      if (allPhysicalInfo.length > 0) {
        await polarDataProcessor.processPolarPhysicalInfo(
          userId,
          userId,
          // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
          allPhysicalInfo
        );
      }
      // Process exercises
      const allExercises = [];
      if (responses['raw_exercises_recent']) {
        const exercisesData = responses['raw_exercises_recent'].data || {};
        const exercises = Array.isArray(exercisesData)
          ? exercisesData
          : exercisesData.exercises || [];
        allExercises.push(...exercises);
      }
      Object.keys(responses).forEach((key) => {
        if (key.startsWith('raw_exercise_item_')) {
          allExercises.push(responses[key].data);
        }
      });
      // Legacy support
      if (responses['raw_exercise_item'] && allExercises.length === 0) {
        allExercises.push(responses['raw_exercise_item'].data);
      }
      if (allExercises.length > 0) {
        await polarDataProcessor.processPolarExercises(
          userId,
          userId,
          // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
          allExercises
        );
      }
      // Process activities
      const allActivities = [];
      if (responses['raw_activity_list']) {
        const activitiesData = responses['raw_activity_list'].data || {};
        const activities = Array.isArray(activitiesData)
          ? activitiesData
          : activitiesData.activities || activitiesData['activity-log'] || [];
        allActivities.push(...activities);
      }
      Object.keys(responses).forEach((key) => {
        if (key.startsWith('raw_activity_item_')) {
          allActivities.push(responses[key].data);
        }
      });
      // Legacy support
      if (responses['raw_activity_item'] && allActivities.length === 0) {
        allActivities.push(responses['raw_activity_item'].data);
      }
      if (allActivities.length > 0) {
        await polarDataProcessor.processPolarActivity(
          userId,
          userId,
          // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
          allActivities
        );
      }
      if (responses['raw_sleep_list']) {
        await polarDataProcessor.processPolarSleep(
          userId,
          userId,
          responses['raw_sleep_list'].data
        );
      } else if (responses['raw_sleep']) {
        await polarDataProcessor.processPolarSleep(
          userId,
          userId,
          responses['raw_sleep'].data
        );
      }
      if (responses['raw_nightly_recharge']) {
        await polarDataProcessor.processPolarNightlyRecharge(
          userId,
          userId,
          responses['raw_nightly_recharge'].data
        );
      }
      if (responses['raw_cardio_load']) {
        await polarDataProcessor.processPolarCardioLoad(
          userId,
          userId,
          responses['raw_cardio_load'].data
        );
      }
      if (responses['raw_continuous_heart_rate']) {
        await polarDataProcessor.processPolarContinuousHeartRate(
          userId,
          userId,
          responses['raw_continuous_heart_rate'].data
        );
      }
      if (responses['raw_spo2']) {
        await polarDataProcessor.processPolarSpO2(
          userId,
          userId,
          responses['raw_spo2'].data
        );
      }
      if (responses['raw_body_temperature']) {
        await polarDataProcessor.processPolarBodyTemperature(
          userId,
          userId,
          responses['raw_body_temperature'].data
        );
      }
      if (responses['raw_skin_temperature']) {
        await polarDataProcessor.processPolarSkinTemperature(
          userId,
          userId,
          responses['raw_skin_temperature'].data
        );
      }
      // Update last_sync_at
      const client = await getSystemClient();
      try {
        const updateQuery = providerId
          ? {
              text: 'UPDATE external_data_providers SET last_sync_at = NOW() WHERE id = $1 AND user_id = $2',
              values: [providerId, userId],
            }
          : {
              text: "UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'polar'",
              values: [userId],
            };
        await client.query(updateQuery.text, updateQuery.values);
      } finally {
        client.release();
      }
      log(
        'info',
        `[polarService] Polar sync from raw bundle completed for user ${userId}.`
      );
      return {
        success: true,
        source: 'local_raw_replay',
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        'error',
        `[polarService] Error replaying Polar data from raw bundle for user ${userId}:`,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error.message
      );
      throw error;
    }
  }
  try {
    log('info', `[polarService] Fetching live Polar data for user ${userId}`);
    // Get access token and external user ID
    const { accessToken, externalUserId } =
      await polarIntegrationService.getValidAccessToken(userId, providerId);
    // Helper to safely fetch raw data (logging is handled inside the integration methods)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function safeFetch(dataType: any, fetchFn: any) {
      try {
        return await fetchFn();
      } catch (error) {
        log(
          'warn',
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          `[polarService] Failed to fetch ${dataType} for user ${userId}: ${error.message}`
        );
        return null;
      }
    }
    // 1. Fetch EVERYTHING first (The Safe Phase)
    log('debug', '[polarService] Phase 1: Capturing raw API responses...');
    const physicalInfo =
      (await safeFetch('physical_info', () =>
        polarIntegrationService.fetchPhysicalInfo(
          userId,
          externalUserId,
          accessToken
        )
      )) || [];
    const newExercises =
      (await safeFetch('exercises', () =>
        polarIntegrationService.fetchExercises(
          userId,
          externalUserId,
          accessToken
        )
      )) || [];
    const newActivities =
      (await safeFetch('activities', () =>
        polarIntegrationService.fetchDailyActivity(
          userId,
          externalUserId,
          accessToken
        )
      )) || [];
    let allExercises = [...newExercises];
    let allActivities = [...newActivities];
    if (syncType === 'manual') {
      log(
        'info',
        `[polarService] Manual sync: Fetching user profile fallback for user ${userId}.`
      );
      const userProfile = await safeFetch('user_profile', () =>
        polarIntegrationService.fetchUserProfile(
          userId,
          externalUserId,
          accessToken
        )
      );
      if (userProfile && physicalInfo.length === 0) {
        if (userProfile.weight || userProfile.height) {
          physicalInfo.push({
            weight: userProfile.weight,
            height: userProfile.height,
            created: new Date().toISOString(),
          });
        }
      }
    }
    const newSleep = await safeFetch('sleep_recent', () =>
      polarIntegrationService.fetchRecentSleepData(userId, accessToken)
    );
    const newRecharge = await safeFetch('nightly_recharge', () =>
      polarIntegrationService.fetchRecentNightlyRecharge(userId, accessToken)
    );
    const newCardioLoad =
      (await safeFetch('cardio_load', () =>
        polarIntegrationService.fetchRecentCardioLoad(userId, accessToken)
      )) || [];
    const newContinuousHr = await safeFetch('continuous_heart_rate', () =>
      polarIntegrationService.fetchRecentContinuousHeartRate(
        userId,
        accessToken
      )
    );
    const newSpO2 = await safeFetch('spo2', () =>
      polarIntegrationService.fetchRecentSpO2(userId, accessToken)
    );
    const newBodyTemp = await safeFetch('body_temperature', () =>
      polarIntegrationService.fetchRecentBodyTemperature(userId, accessToken)
    );
    const newSkinTemp = await safeFetch('skin_temperature', () =>
      polarIntegrationService.fetchRecentSkinTemperature(userId, accessToken)
    );

    // 2. Process EVERYTHING second (The Action Phase)
    log('debug', '[polarService] Phase 2: Processing captured data...');
    // Remove duplicates before processing
    allExercises = Array.from(
      new Map(allExercises.map((ex) => [ex.id, ex])).values()
    );
    // Polar's /users/activities items carry start_time/end_time and no `date`,
    // so keying this Map on act.date collapsed the whole window into one record
    // (issue #2471). Key on the resolved calendar day instead, keeping the
    // record with the highest step count when a day reports several periods --
    // which matches upsertStepData's max-wins semantics downstream.
    const activitiesByDate = new Map<string, (typeof allActivities)[number]>();
    for (const act of allActivities) {
      const date = polarDataProcessor.resolvePolarActivityDate(act);
      if (!date) continue;
      const existing = activitiesByDate.get(date);
      const steps = polarDataProcessor.resolvePolarActivitySteps(act) ?? -1;
      const existingSteps =
        polarDataProcessor.resolvePolarActivitySteps(existing) ?? -1;
      if (!existing || steps > existingSteps) {
        activitiesByDate.set(date, act);
      }
    }
    allActivities = Array.from(activitiesByDate.values());
    // Process data
    if (physicalInfo && physicalInfo.length > 0) {
      await polarDataProcessor.processPolarPhysicalInfo(
        userId,
        userId,
        physicalInfo
      );
    }
    if (allExercises && allExercises.length > 0) {
      await polarDataProcessor.processPolarExercises(
        userId,
        userId,
        // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
        allExercises
      );
    } else {
      log(
        'info',
        `[polarService] No Polar exercise data (transaction or recent list) found for user ${userId}.`
      );
    }
    if (allActivities && allActivities.length > 0) {
      await polarDataProcessor.processPolarActivity(
        userId,
        userId,
        // @ts-expect-error TS(2345): Argument of type 'any[]' is not assignable to para... Remove this comment to see the full error message
        allActivities
      );
    }
    if (newSleep && newSleep.length > 0) {
      await polarDataProcessor.processPolarSleep(userId, userId, newSleep);
    }
    if (newRecharge && newRecharge.length > 0) {
      await polarDataProcessor.processPolarNightlyRecharge(
        userId,
        userId,
        newRecharge
      );
    }
    if (newCardioLoad && newCardioLoad.length > 0) {
      await polarDataProcessor.processPolarCardioLoad(
        userId,
        userId,
        newCardioLoad
      );
    }
    if (newContinuousHr) {
      await polarDataProcessor.processPolarContinuousHeartRate(
        userId,
        userId,
        newContinuousHr
      );
    }
    if (newSpO2) {
      await polarDataProcessor.processPolarSpO2(userId, userId, newSpO2);
    }
    if (newBodyTemp) {
      await polarDataProcessor.processPolarBodyTemperature(
        userId,
        userId,
        newBodyTemp
      );
    }
    if (newSkinTemp) {
      await polarDataProcessor.processPolarSkinTemperature(
        userId,
        userId,
        newSkinTemp
      );
    }
    // Update last_sync_at
    const client = await getSystemClient();
    try {
      const updateQuery = providerId
        ? {
            text: 'UPDATE external_data_providers SET last_sync_at = NOW() WHERE id = $1 AND user_id = $2',
            values: [providerId, userId],
          }
        : {
            text: "UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'polar'",
            values: [userId],
          };
      await client.query(updateQuery.text, updateQuery.values);
    } finally {
      client.release();
    }
    log(
      'info',
      `[polarService] Full Polar live sync completed for user ${userId}.`
    );
    return { success: true, source: 'live_api' };
  } catch (error) {
    log(
      'error',
      `[polarService] Error during full Polar sync for user ${userId}:`,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error.message
    );
    throw error;
  }
}
/**
 * Get Polar connection status
 * @param {number} userId
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStatus(userId: any, providerId: any) {
  return await polarIntegrationService.getStatus(userId, providerId);
}
/**
 * Disconnect Polar provider
 * @param {number} userId
 * @param {string} providerId
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function disconnectPolar(userId: any, providerId: any) {
  return await polarIntegrationService.disconnectPolar(userId, providerId);
}
export { syncPolarData };
export { getStatus };
export { disconnectPolar };
export default {
  syncPolarData,
  getStatus,
  disconnectPolar,
};
