import { log } from '../config/logging.js';
import stravaIntegrationService from '../integrations/strava/stravaService.js';
import stravaDataProcessor from '../integrations/strava/stravaDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays, dayRangeToUtcRange } from '@workspace/shared';
// Configuration for data mocking/caching
const STRAVA_DATA_SOURCE =
  process.env.SPARKY_FITNESS_STRAVA_DATA_SOURCE || 'strava';
log(
  'info',
  `[stravaService] Strava data source configured to: ${STRAVA_DATA_SOURCE}`
);
/**
 * Orchestrate a full Strava data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 * @param {string} [customStartDate] - Optional start date (YYYY-MM-DD)
 * @param {string} [customEndDate] - Optional end date (YYYY-MM-DD)
 */
async function syncStravaData(
  userId,
  syncType = 'manual',
  customStartDate = null,
  customEndDate = null
) {
  let startDate, endDate;
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
  // Convert dates to epoch for Strava API (seconds since epoch)
  const { start, end } = dayRangeToUtcRange(startDate, endDate, tz);
  const afterEpoch = Math.floor(start.valueOf() / 1000);
  const beforeEpoch = Math.floor(end.valueOf() / 1000);
  log(
    'info',
    `[stravaService] Starting Strava sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}. ENV_SAVE_MOCK_DATA=${process.env.SPARKY_FITNESS_SAVE_MOCK_DATA}`
  );
  if (STRAVA_DATA_SOURCE === 'local') {
    log(
      'info',
      `[stravaService] Replaying Strava sync from raw diagnostic bundle for user ${userId}`
    );
    const bundle = loadRawBundle('strava');
    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_STRAVA_DATA_SOURCE unset (or set to "strava") ' +
          'and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.'
      );
    }
    const responses = bundle.responses;
    try {
      log('debug', `[stravaService] Processing raw data for ${userId}...`);
      // Athlete profile (for weight)
      if (responses['raw_athlete']) {
        await stravaDataProcessor.processStravaAthleteWeight(
          userId,
          userId,
          responses['raw_athlete'].data,
          tz
        );
      }
      // Activities
      if (responses['raw_activities_list']) {
        // Collect detailed activities from bundle if any
        const detailedActivities = {};
        Object.keys(responses).forEach((key) => {
          if (key.startsWith('raw_activity_detail_')) {
            const activityId = key.replace('raw_activity_detail_', '');
            detailedActivities[activityId] = responses[key].data;
          }
        });
        await stravaDataProcessor.processStravaActivities(
          userId,
          userId,
          responses['raw_activities_list'].data,
          detailedActivities,
          null, // Pass null to skip the date safety filter during local replay
          tz
        );
      }
      // Update last_sync_at
      const client = await getSystemClient();
      try {
        await client.query(
          "UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'strava'",
          [userId]
        );
      } finally {
        client.release();
      }
      log(
        'info',
        `[stravaService] Strava sync from raw bundle completed for user ${userId}.`
      );
      return {
        success: true,
        source: 'local_raw_replay',
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        'error',
        `[stravaService] Error replaying Strava data from raw bundle for user ${userId}:`,
        error.message
      );
      throw error;
    }
  }
  try {
    // 1. Get valid access token
    const accessToken =
      await stravaIntegrationService.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error(
        'No valid Strava access token. Please re-authorize Strava.'
      );
    }
    // Helper to safely fetch raw data (logging is handled inside the integration methods)
    async function safeFetch(dataType, fetchFn) {
      try {
        return await fetchFn();
      } catch (error) {
        log(
          'warn',
          `[stravaService] Failed to fetch ${dataType} for user ${userId}: ${error.message}`
        );
        return null;
      }
    }
    // 1. Fetch EVERYTHING first (The Safe Phase)
    log('debug', '[stravaService] Phase 1: Capturing raw API responses...');
    const athleteData = await safeFetch('raw_athlete', () =>
      stravaIntegrationService.fetchAthlete(accessToken)
    );
    const activities =
      (await safeFetch('raw_activities_list', () =>
        stravaIntegrationService.fetchAllActivitiesInRange(
          accessToken,
          afterEpoch,
          beforeEpoch
        )
      )) || [];
    const detailedActivities = {};
    if (activities.length > 0) {
      log(
        'debug',
        `[stravaService] Fetching details for ${activities.length} activities...`
      );
      for (const activity of activities) {
        const detail = await safeFetch(
          `raw_activity_detail_${activity.id}`,
          () =>
            stravaIntegrationService.fetchActivityById(accessToken, activity.id)
        );
        if (detail) {
          detailedActivities[activity.id] = detail;
        }
        // Respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    // 2. Process EVERYTHING second (The Action Phase)
    log('debug', '[stravaService] Phase 2: Processing captured data...');
    if (activities.length > 0) {
      await stravaDataProcessor.processStravaActivities(
        userId,
        userId,
        activities,
        detailedActivities,
        startDate,
        tz
      );
    }
    if (athleteData) {
      await stravaDataProcessor.processStravaAthleteWeight(
        userId,
        userId,
        athleteData,
        tz
      );
    }
    // 6. Update last_sync_at
    const client = await getSystemClient();
    try {
      await client.query(
        "UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'strava'",
        [userId]
      );
    } finally {
      client.release();
    }
    log(
      'info',
      `[stravaService] Full Strava sync completed for user ${userId}. ${activities.length} activities processed.`
    );
    return {
      success: true,
      source: 'live_api',
      activitiesProcessed: activities.length,
    };
  } catch (error) {
    log(
      'error',
      `[stravaService] Error during full Strava sync for user ${userId}:`,
      error.message
    );
    throw error;
  }
}
const getStatus = (userId) => stravaIntegrationService.getStatus(userId);
const disconnectStrava = (userId) =>
  stravaIntegrationService.disconnectStrava(userId);
export { syncStravaData };
export { getStatus };
export { disconnectStrava };
export default {
  syncStravaData,
  getStatus,
  disconnectStrava,
};
