import { log } from '../config/logging.js';
import ouraIntegrationService from '../integrations/oura/ouraService.js';
import ouraDataProcessor from '../integrations/oura/ouraDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays, dayRangeToUtcRange } from '@workspace/shared';

const OURA_DATA_SOURCE = process.env.SPARKY_FITNESS_OURA_DATA_SOURCE || 'oura';
log(
  'info',
  `[ouraService] Oura data source configured to: ${OURA_DATA_SOURCE}`
);

/**
 * Orchestrate a full Oura data sync for a user
 * @param {string} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 * @param {string} [customStartDate] - Optional start date (YYYY-MM-DD)
 * @param {string} [customEndDate] - Optional end date (YYYY-MM-DD)
 */
async function syncOuraData(
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
    // Include yesterday b/c Oura assigns a night's sleep to the wake-up day,
    // and data often becomes available some hours after the night ends.
    endDate = today;
    startDate = addDays(today, -1);
  } else {
    throw new Error("Invalid syncType. Must be 'manual' or 'scheduled'.");
  }
  const sleepEndDate = addDays(endDate, 1);
  const { start: startDateUtc, end: endDateUtc } = dayRangeToUtcRange(
    startDate,
    endDate,
    tz
  );
  const heartRateStart = startDateUtc.toISOString();
  const heartRateEnd = new Date(
    Math.min(endDateUtc.getTime(), Date.now())
  ).toISOString();
  log(
    'info',
    `[ouraService] Starting Oura sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}. Loading from: ${OURA_DATA_SOURCE}`
  );
  if (OURA_DATA_SOURCE === 'local') {
    log(
      'info',
      `[ouraService] Replaying Oura sync from raw diagnostic bundle for user ${userId}`
    );
    const bundle = loadRawBundle('oura');
    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_OURA_DATA_SOURCE unset (or set to "oura") ' +
          'and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.'
      );
    }
    const responses = bundle.responses;
    try {
      log('debug', `[ouraService] Processing raw data for ${userId}...`);
      await ouraDataProcessor.processOuraSleep(
        userId,
        userId,
        responses['raw_sleep']?.data || [],
        responses['raw_daily_sleep']?.data || []
      );
      if (responses['raw_daily_activity'])
        await ouraDataProcessor.processOuraDailyActivity(
          userId,
          userId,
          responses['raw_daily_activity'].data
        );
      if (responses['raw_daily_readiness'])
        await ouraDataProcessor.processOuraDailyReadiness(
          userId,
          userId,
          responses['raw_daily_readiness'].data
        );
      if (responses['raw_daily_spo2'])
        await ouraDataProcessor.processOuraDailySpo2(
          userId,
          userId,
          responses['raw_daily_spo2'].data
        );
      if (responses['raw_daily_stress'])
        await ouraDataProcessor.processOuraDailyStress(
          userId,
          userId,
          responses['raw_daily_stress'].data
        );
      if (responses['raw_daily_cardiovascular_age'])
        await ouraDataProcessor.processOuraCardioAge(
          userId,
          userId,
          responses['raw_daily_cardiovascular_age'].data
        );
      if (responses['raw_vo2_max'])
        await ouraDataProcessor.processOuraVo2Max(
          userId,
          userId,
          responses['raw_vo2_max'].data
        );
      if (responses['raw_heart_rate'])
        await ouraDataProcessor.processOuraHeartRate(
          userId,
          userId,
          responses['raw_heart_rate'].data,
          tz
        );
      if (responses['raw_workouts'])
        await ouraDataProcessor.processOuraWorkouts(
          userId,
          userId,
          responses['raw_workouts'].data,
          tz
        );
      await updateLastSyncAt(userId);
      log(
        'info',
        `[ouraService] Oura sync from raw bundle completed for user ${userId}.`
      );
      return {
        success: true,
        source: 'local_raw_replay',
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        'error',
        `[ouraService] Error replaying Oura data from raw bundle for user ${userId}:`,
        (error as Error).message
      );
      throw error;
    }
  }
  try {
    const accessToken =
      await ouraIntegrationService.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error(
        'No Oura access token available. Please authorize first.'
      );
    }
    const safeFetch = async <T>(
      fetchFn: () => Promise<T>,
      name: string
    ): Promise<T | null> => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return await fetchFn();
      } catch (error) {
        log(
          'warn',
          `[ouraService] Failed to fetch ${name} for user ${userId}: ${(error as Error).message}`
        );
        return null;
      }
    };
    log('debug', `[ouraService] Fetching sleep periods for ${userId}...`);
    const sleepData = await safeFetch(
      () =>
        ouraIntegrationService.fetchSleepPeriods(
          userId,
          startDate,
          sleepEndDate,
          accessToken
        ),
      'sleep periods'
    );
    log('debug', `[ouraService] Fetching daily sleep for ${userId}...`);
    const dailySleepData = await safeFetch(
      () =>
        ouraIntegrationService.fetchDailySleep(
          userId,
          startDate,
          sleepEndDate,
          accessToken
        ),
      'daily sleep'
    );
    log('debug', `[ouraService] Fetching daily activity for ${userId}...`);
    const dailyActivityData = await safeFetch(
      () =>
        ouraIntegrationService.fetchDailyActivity(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'daily activity'
    );
    log('debug', `[ouraService] Fetching daily readiness for ${userId}...`);
    const dailyReadinessData = await safeFetch(
      () =>
        ouraIntegrationService.fetchDailyReadiness(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'daily readiness'
    );
    log('debug', `[ouraService] Fetching daily SpO2 for ${userId}...`);
    const dailySpo2Data = await safeFetch(
      () =>
        ouraIntegrationService.fetchDailySpo2(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'daily SpO2'
    );
    log('debug', `[ouraService] Fetching daily stress for ${userId}...`);
    const dailyStressData = await safeFetch(
      () =>
        ouraIntegrationService.fetchDailyStress(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'daily stress'
    );
    log('debug', `[ouraService] Fetching cardiovascular age for ${userId}...`);
    const cardioAgeData = await safeFetch(
      () =>
        ouraIntegrationService.fetchDailyCardiovascularAge(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'cardiovascular age'
    );
    log('debug', `[ouraService] Fetching VO2 max for ${userId}...`);
    const vo2MaxData = await safeFetch(
      () =>
        ouraIntegrationService.fetchVo2Max(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'VO2 max'
    );
    log('debug', `[ouraService] Fetching heart rate for ${userId}...`);
    const heartRateData = await safeFetch(
      () =>
        ouraIntegrationService.fetchHeartRate(
          userId,
          heartRateStart,
          heartRateEnd,
          accessToken
        ),
      'heart rate'
    );
    log('debug', `[ouraService] Fetching workouts for ${userId}...`);
    const workoutsData = await safeFetch(
      () =>
        ouraIntegrationService.fetchWorkouts(
          userId,
          startDate,
          endDate,
          accessToken
        ),
      'workouts'
    );
    log('debug', `[ouraService] Processing fetched data for ${userId}...`);
    if (sleepData || dailySleepData)
      await ouraDataProcessor.processOuraSleep(
        userId,
        userId,
        sleepData?.data || [],
        dailySleepData?.data || []
      );
    if (dailyActivityData)
      await ouraDataProcessor.processOuraDailyActivity(
        userId,
        userId,
        dailyActivityData.data
      );
    if (dailyReadinessData)
      await ouraDataProcessor.processOuraDailyReadiness(
        userId,
        userId,
        dailyReadinessData.data
      );
    if (dailySpo2Data)
      await ouraDataProcessor.processOuraDailySpo2(
        userId,
        userId,
        dailySpo2Data.data
      );
    if (dailyStressData)
      await ouraDataProcessor.processOuraDailyStress(
        userId,
        userId,
        dailyStressData.data
      );
    if (cardioAgeData)
      await ouraDataProcessor.processOuraCardioAge(
        userId,
        userId,
        cardioAgeData.data
      );
    if (vo2MaxData)
      await ouraDataProcessor.processOuraVo2Max(
        userId,
        userId,
        vo2MaxData.data
      );
    if (heartRateData)
      await ouraDataProcessor.processOuraHeartRate(
        userId,
        userId,
        heartRateData.data,
        tz
      );
    if (workoutsData)
      await ouraDataProcessor.processOuraWorkouts(
        userId,
        userId,
        workoutsData.data,
        tz
      );
    await updateLastSyncAt(userId);
    log('info', `[ouraService] Full Oura sync completed for user ${userId}.`);
    return { success: true, source: 'live_api' };
  } catch (error) {
    log(
      'error',
      `[ouraService] Error during full Oura sync for user ${userId}:`,
      (error as Error).message
    );
    throw error;
  }
}

async function updateLastSyncAt(userId: string) {
  const client = await getSystemClient();
  try {
    await client.query(
      "UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'oura'",
      [userId]
    );
  } finally {
    client.release();
  }
}

const getStatus = (userId: string) => ouraIntegrationService.getStatus(userId);
const disconnectOura = (userId: string) =>
  ouraIntegrationService.disconnectOura(userId);

export { syncOuraData };
export { getStatus };
export { disconnectOura };
export default {
  syncOuraData,
  getStatus,
  disconnectOura,
};
