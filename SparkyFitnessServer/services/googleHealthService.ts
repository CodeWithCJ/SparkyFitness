import { log } from '../config/logging.js';
import googleHealthIntegrationService from '../integrations/googlehealth/googleHealthService.js';
import googleHealthDataProcessor from '../integrations/googlehealth/googleHealthDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays } from '@workspace/shared';

/**
 * Orchestrate a full Google Health data sync for a user.
 * Mirrors the shape of syncFitbitData for consistency.
 */
async function syncGoogleHealthData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
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
    `[googleHealthService] Starting sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}.`
  );

  try {
    const accessToken =
      (await googleHealthIntegrationService.getValidAccessToken(
        userId
      )) as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeFetch = async (fetchFn: any, name: string) => {
      try {
        // 1.5s between fetches — Google Health has per-minute quotas
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return await fetchFn();
      } catch (error) {
        log(
          'warn',
          // @ts-expect-error TS(2571)
          `[googleHealthService] Failed to fetch ${name} for user ${userId}: ${error.message}`
        );
        return null;
      }
    };

    log(
      'debug',
      `[googleHealthService] Fetching resting heart rate for ${userId}...`
    );
    const heartRateData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchHeartRate(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'resting heart rate'
    );

    log('debug', `[googleHealthService] Fetching steps for ${userId}...`);
    const stepsData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchSteps(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'steps'
    );

    log('debug', `[googleHealthService] Fetching weight for ${userId}...`);
    const weightData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchWeight(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'weight'
    );

    log('debug', `[googleHealthService] Fetching SpO2 for ${userId}...`);
    const spo2Data = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchSpO2(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'SpO2'
    );

    log(
      'debug',
      `[googleHealthService] Fetching skin temperature for ${userId}...`
    );
    const tempData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchTemperature(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'skin temperature'
    );

    log('debug', `[googleHealthService] Fetching height for ${userId}...`);
    const profileData = await safeFetch(
      () => googleHealthIntegrationService.fetchProfile(userId, accessToken),
      'height'
    );

    log('debug', `[googleHealthService] Fetching HRV for ${userId}...`);
    const hrvData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchHRV(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'HRV'
    );

    log(
      'debug',
      `[googleHealthService] Fetching respiratory rate for ${userId}...`
    );
    const respiratoryRateData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchRespiratoryRate(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'respiratory rate'
    );

    log('debug', `[googleHealthService] Fetching AZM for ${userId}...`);
    const azmData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchActiveZoneMinutes(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'AZM'
    );

    log('debug', `[googleHealthService] Fetching sleep for ${userId}...`);
    const sleepData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchSleep(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'sleep'
    );

    log('debug', `[googleHealthService] Fetching activities for ${userId}...`);
    const activitiesData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchActivities(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'activities'
    );

    log('debug', `[googleHealthService] Fetching body fat for ${userId}...`);
    const bodyFatData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchBodyFat(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'body fat'
    );

    log('debug', `[googleHealthService] Fetching hydration for ${userId}...`);
    const waterData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchWater(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'hydration'
    );

    log(
      'debug',
      `[googleHealthService] Fetching core body temperature for ${userId}...`
    );
    const coreTempData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchCoreTemperature(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'core body temperature'
    );

    log('debug', `[googleHealthService] Fetching VO2 Max for ${userId}...`);
    const vo2MaxData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchVO2Max(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'VO2 Max'
    );

    log(
      'debug',
      `[googleHealthService] Fetching activity minutes for ${userId}...`
    );
    const activityMinutesData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchActivityMinutes(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'activity minutes'
    );

    log('debug', `[googleHealthService] Fetching distance for ${userId}...`);
    const distanceData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchDistance(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'distance'
    );

    log('debug', `[googleHealthService] Fetching floors for ${userId}...`);
    const floorsData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchFloors(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'floors'
    );

    log(
      'debug',
      `[googleHealthService] Fetching daily calories for ${userId}...`
    );
    const caloriesData = await safeFetch(
      () =>
        googleHealthIntegrationService.fetchCalories(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'daily calories'
    );

    // Process all data sequentially
    log(
      'debug',
      `[googleHealthService] Processing fetched data for ${userId}...`
    );

    if (heartRateData)
      await googleHealthDataProcessor.processGoogleHeartRate(
        userId,
        userId,
        heartRateData
      );
    if (stepsData)
      await googleHealthDataProcessor.processGoogleSteps(
        userId,
        userId,
        stepsData
      );
    if (weightData)
      await googleHealthDataProcessor.processGoogleWeight(
        userId,
        userId,
        weightData
      );
    if (spo2Data)
      await googleHealthDataProcessor.processGoogleSpO2(
        userId,
        userId,
        spo2Data
      );
    if (tempData)
      await googleHealthDataProcessor.processGoogleTemperature(
        userId,
        userId,
        tempData
      );
    if (profileData)
      await googleHealthDataProcessor.processGoogleProfile(
        userId,
        userId,
        profileData,
        null,
        tz
      );
    if (hrvData)
      await googleHealthDataProcessor.processGoogleHRV(userId, userId, hrvData);
    if (respiratoryRateData)
      await googleHealthDataProcessor.processGoogleRespiratoryRate(
        userId,
        userId,
        respiratoryRateData
      );
    if (azmData)
      await googleHealthDataProcessor.processGoogleActiveZoneMinutes(
        userId,
        userId,
        azmData
      );
    if (sleepData)
      await googleHealthDataProcessor.processGoogleSleep(
        userId,
        userId,
        sleepData
      );
    if (activitiesData)
      await googleHealthDataProcessor.processGoogleActivities(
        userId,
        userId,
        activitiesData,
        startDate
      );
    if (bodyFatData)
      await googleHealthDataProcessor.processGoogleBodyFat(
        userId,
        userId,
        bodyFatData
      );
    if (waterData)
      await googleHealthDataProcessor.processGoogleWater(
        userId,
        userId,
        waterData
      );
    if (coreTempData)
      await googleHealthDataProcessor.processGoogleCoreTemperature(
        userId,
        userId,
        coreTempData
      );
    if (vo2MaxData)
      await googleHealthDataProcessor.processGoogleVO2Max(
        userId,
        userId,
        vo2MaxData
      );
    if (activityMinutesData)
      await googleHealthDataProcessor.processGoogleActivityMinutes(
        userId,
        userId,
        activityMinutesData
      );
    if (distanceData)
      await googleHealthDataProcessor.processGoogleDistance(
        userId,
        userId,
        distanceData
      );
    if (floorsData)
      await googleHealthDataProcessor.processGoogleFloors(
        userId,
        userId,
        floorsData
      );
    if (caloriesData)
      await googleHealthDataProcessor.processGoogleCalories(
        userId,
        userId,
        caloriesData
      );

    const client = await getSystemClient();
    try {
      await client.query(
        "UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'googlehealth'",
        [userId]
      );
    } finally {
      client.release();
    }

    log(
      'info',
      `[googleHealthService] Full Google Health sync completed for user ${userId}.`
    );
    return { success: true };
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571)
      `[googleHealthService] Error during sync for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getStatus = (userId: any) =>
  googleHealthIntegrationService.getStatus(userId);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const disconnectGoogleHealth = (userId: any) =>
  googleHealthIntegrationService.disconnectGoogleHealth(userId);

export { syncGoogleHealthData };
export { getStatus };
export { disconnectGoogleHealth };
export default {
  syncGoogleHealthData,
  getStatus,
  disconnectGoogleHealth,
};
