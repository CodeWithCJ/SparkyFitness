import { log } from '../config/logging.js';
import googleHealthIntegrationService from '../integrations/googlehealth/googleHealthService.js';
import googleHealthDataProcessor from '../integrations/googlehealth/googleHealthDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays } from '@workspace/shared';
import { loadRawBundle } from '../utils/diagnosticLogger.js';

const GOOGLE_HEALTH_DATA_SOURCE =
  process.env.SPARKY_FITNESS_GOOGLE_HEALTH_DATA_SOURCE || 'googlehealth';
log(
  'info',
  `[googleHealthService] Google Health data source: ${GOOGLE_HEALTH_DATA_SOURCE}`
);

/**
 * Orchestrate a full Google Health data sync for a user.
 * Mirrors the shape of syncFitbitData for consistency.
 */
async function syncGoogleHealthData(
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
    startDate = addDays(today, -1);
  } else {
    throw new Error("Invalid syncType. Must be 'manual' or 'scheduled'.");
  }

  log(
    'info',
    `[googleHealthService] Starting sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}.`
  );

  if (GOOGLE_HEALTH_DATA_SOURCE === 'local') {
    log(
      'info',
      `[googleHealthService] Replaying Google Health sync from raw diagnostic bundle for user ${userId}`
    );
    const bundle = loadRawBundle('googlehealth');
    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_GOOGLE_HEALTH_DATA_SOURCE unset (or set to "googlehealth") ' +
          'and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.'
      );
    }
    const r = bundle.responses as Record<string, { data: unknown }>;
    try {
      if (r['raw_daily_resting_heart_rate'])
        await googleHealthDataProcessor.processGoogleHeartRate(
          userId,
          userId,
          r['raw_daily_resting_heart_rate'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_rollup_steps'])
        await googleHealthDataProcessor.processGoogleSteps(
          userId,
          userId,
          r['raw_rollup_steps'].data as {
            rollupDataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_weight'])
        await googleHealthDataProcessor.processGoogleWeight(
          userId,
          userId,
          r['raw_weight'].data as { dataPoints: Record<string, unknown>[] },
          tz
        );
      if (r['raw_oxygen_saturation'])
        await googleHealthDataProcessor.processGoogleSpO2(
          userId,
          userId,
          r['raw_oxygen_saturation'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_daily_sleep_temperature_derivations'])
        await googleHealthDataProcessor.processGoogleTemperature(
          userId,
          userId,
          r['raw_daily_sleep_temperature_derivations'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_list_height'])
        await googleHealthDataProcessor.processGoogleProfile(
          userId,
          userId,
          r['raw_list_height'].data as {
            dataPoints: Record<string, unknown>[];
          },
          null,
          tz
        );
      if (r['raw_daily_heart_rate_variability'])
        await googleHealthDataProcessor.processGoogleHRV(
          userId,
          userId,
          r['raw_daily_heart_rate_variability'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_daily_respiratory_rate'])
        await googleHealthDataProcessor.processGoogleRespiratoryRate(
          userId,
          userId,
          r['raw_daily_respiratory_rate'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_rollup_active_zone_minutes'])
        await googleHealthDataProcessor.processGoogleActiveZoneMinutes(
          userId,
          userId,
          r['raw_rollup_active_zone_minutes'].data as {
            rollupDataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_sleep'])
        await googleHealthDataProcessor.processGoogleSleep(
          userId,
          userId,
          r['raw_sleep'].data as { dataPoints: Record<string, unknown>[] },
          tz
        );
      if (r['raw_exercise'])
        await googleHealthDataProcessor.processGoogleActivities(
          userId,
          userId,
          r['raw_exercise'].data as { dataPoints: Record<string, unknown>[] },
          startDate,
          tz
        );
      if (r['raw_body_fat'])
        await googleHealthDataProcessor.processGoogleBodyFat(
          userId,
          userId,
          r['raw_body_fat'].data as { dataPoints: Record<string, unknown>[] },
          tz
        );
      if (r['raw_rollup_hydration_log'])
        await googleHealthDataProcessor.processGoogleWater(
          userId,
          userId,
          r['raw_rollup_hydration_log'].data as {
            rollupDataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_core_body_temperature'])
        await googleHealthDataProcessor.processGoogleCoreTemperature(
          userId,
          userId,
          r['raw_core_body_temperature'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_daily_vo2_max'])
        await googleHealthDataProcessor.processGoogleVO2Max(
          userId,
          userId,
          r['raw_daily_vo2_max'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_activity_level'])
        await googleHealthDataProcessor.processGoogleActivityMinutes(
          userId,
          userId,
          r['raw_activity_level'].data as {
            dataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_rollup_distance'])
        await googleHealthDataProcessor.processGoogleDistance(
          userId,
          userId,
          r['raw_rollup_distance'].data as {
            rollupDataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_rollup_floors'])
        await googleHealthDataProcessor.processGoogleFloors(
          userId,
          userId,
          r['raw_rollup_floors'].data as {
            rollupDataPoints: Record<string, unknown>[];
          },
          tz
        );
      if (r['raw_rollup_total_calories'])
        await googleHealthDataProcessor.processGoogleCalories(
          userId,
          userId,
          r['raw_rollup_total_calories'].data as {
            rollupDataPoints: Record<string, unknown>[];
          },
          tz
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
        `[googleHealthService] Google Health sync from raw bundle completed for user ${userId}.`
      );
      return {
        success: true,
        source: 'local_raw_replay',
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        'error',
        `[googleHealthService] Error replaying Google Health data from raw bundle for user ${userId}: ${(error as Error).message}`
      );
      throw error;
    }
  }

  try {
    const accessToken =
      (await googleHealthIntegrationService.getValidAccessToken(
        userId
      )) as string;

    const safeFetch = async <T>(
      fetchFn: () => Promise<T>,
      name: string
    ): Promise<T | null> => {
      try {
        // 1.5s between fetches — Google Health has per-minute quotas
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return await fetchFn();
      } catch (error) {
        log(
          'warn',
          `[googleHealthService] Failed to fetch ${name} for user ${userId}: ${(error as Error).message}`
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
        heartRateData,
        tz
      );
    if (stepsData)
      await googleHealthDataProcessor.processGoogleSteps(
        userId,
        userId,
        stepsData,
        tz
      );
    if (weightData)
      await googleHealthDataProcessor.processGoogleWeight(
        userId,
        userId,
        weightData,
        tz
      );
    if (spo2Data)
      await googleHealthDataProcessor.processGoogleSpO2(
        userId,
        userId,
        spo2Data,
        tz
      );
    if (tempData)
      await googleHealthDataProcessor.processGoogleTemperature(
        userId,
        userId,
        tempData,
        tz
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
      await googleHealthDataProcessor.processGoogleHRV(
        userId,
        userId,
        hrvData,
        tz
      );
    if (respiratoryRateData)
      await googleHealthDataProcessor.processGoogleRespiratoryRate(
        userId,
        userId,
        respiratoryRateData,
        tz
      );
    if (azmData)
      await googleHealthDataProcessor.processGoogleActiveZoneMinutes(
        userId,
        userId,
        azmData,
        tz
      );
    if (sleepData)
      await googleHealthDataProcessor.processGoogleSleep(
        userId,
        userId,
        sleepData,
        tz
      );
    if (activitiesData)
      await googleHealthDataProcessor.processGoogleActivities(
        userId,
        userId,
        activitiesData,
        startDate,
        tz
      );
    if (bodyFatData)
      await googleHealthDataProcessor.processGoogleBodyFat(
        userId,
        userId,
        bodyFatData,
        tz
      );
    if (waterData)
      await googleHealthDataProcessor.processGoogleWater(
        userId,
        userId,
        waterData,
        tz
      );
    if (coreTempData)
      await googleHealthDataProcessor.processGoogleCoreTemperature(
        userId,
        userId,
        coreTempData,
        tz
      );
    if (vo2MaxData)
      await googleHealthDataProcessor.processGoogleVO2Max(
        userId,
        userId,
        vo2MaxData,
        tz
      );
    if (activityMinutesData)
      await googleHealthDataProcessor.processGoogleActivityMinutes(
        userId,
        userId,
        activityMinutesData,
        tz
      );
    if (distanceData)
      await googleHealthDataProcessor.processGoogleDistance(
        userId,
        userId,
        distanceData,
        tz
      );
    if (floorsData)
      await googleHealthDataProcessor.processGoogleFloors(
        userId,
        userId,
        floorsData,
        tz
      );
    if (caloriesData)
      await googleHealthDataProcessor.processGoogleCalories(
        userId,
        userId,
        caloriesData,
        tz
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
      `[googleHealthService] Error during sync for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

const getStatus = (userId: string) =>
  googleHealthIntegrationService.getStatus(userId);
const disconnectGoogleHealth = (userId: string) =>
  googleHealthIntegrationService.disconnectGoogleHealth(userId);

export { syncGoogleHealthData };
export { getStatus };
export { disconnectGoogleHealth };
export default {
  syncGoogleHealthData,
  getStatus,
  disconnectGoogleHealth,
};
