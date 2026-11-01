import { setMockDataContext } from '../utils/mockDataContext.js';
import { log } from '../config/logging.js';
import stravaIntegrationService from '../integrations/strava/stravaService.js';
import stravaDataProcessor from '../integrations/strava/stravaDataProcessor.js';
import { isPermissionRejection } from './providerFetchResult.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays, dayRangeToUtcRange } from '@workspace/shared';

/**
 * Orchestrate a full Strava data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 * @param {string} [customStartDate] - Optional start date (YYYY-MM-DD)
 * @param {string} [customEndDate] - Optional end date (YYYY-MM-DD)
 * @param {string} [dataSource] - Optional data source ('local' vs 'strava')
 * @param {boolean} [saveMockData] - Optional flag to capture raw API responses
 */
async function syncStravaData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  syncType = 'manual',
  customStartDate = null,
  customEndDate = null,
  dataSource: string | null = null,
  saveMockData = false
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
    // Include yesterday b/c a daily sync would otherwise miss anything recorded
    // after that day's sync ran. Re-fetching a day is safe: entries are matched
    // by source_id and daily values are upserted.
    endDate = today;
    startDate = addDays(today, -1);
  } else {
    throw new Error("Invalid syncType. Must be 'manual' or 'scheduled'.");
  }
  // Convert dates to epoch for Strava API (seconds since epoch)
  const { start, end } = dayRangeToUtcRange(startDate, endDate, tz);
  const afterEpoch = Math.floor(start.valueOf() / 1000);
  const beforeEpoch = Math.floor(end.valueOf() / 1000);
  const stravaDataSource = dataSource || 'strava';
  setMockDataContext({ dataSource, saveMockData });
  log(
    'info',
    `[stravaService] Starting Strava sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}. Loading from: ${stravaDataSource}`
  );
  if (stravaDataSource === 'local') {
    log(
      'info',
      `[stravaService] Replaying Strava sync from raw diagnostic bundle for user ${userId}`
    );
    const bundle = loadRawBundle('strava');
    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Run a sync with "Sync and save ' +
          'this sync\'s raw responses" selected first to capture one.'
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
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
      // A replay fetches nothing new, so it leaves last_sync_at alone: moving it
      // would make the scheduler skip the next live daily sync.
      log(
        'info',
        `[stravaService] Strava sync from raw bundle completed for user ${userId}.`
      );
      return {
        success: true,
        source: 'local_raw_replay',
        bundle_updated: bundle.last_updated,
        failedRequiredFetches: [],
      };
    } catch (error) {
      log(
        'error',
        `[stravaService] Error replaying Strava data from raw bundle for user ${userId}:`,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
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
    const failedRequiredFetches: string[] = [];
    // Helper to safely fetch raw data (logging is handled inside the integration methods)
    async function safeFetch<T>(
      dataType: string,
      fetchFn: () => Promise<T>,
      required = false
    ): Promise<T | null> {
      try {
        return await fetchFn();
      } catch (error) {
        if (required && !isPermissionRejection(error)) {
          failedRequiredFetches.push(dataType);
        }
        log(
          'warn',
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
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
      (await safeFetch(
        'raw_activities_list',
        () =>
          stravaIntegrationService.fetchAllActivitiesInRange(
            accessToken,
            afterEpoch,
            beforeEpoch
          ),
        true
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
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          detailedActivities[activity.id] = detail;
        }
        // Respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    // 2. Process EVERYTHING second (The Action Phase)
    log('debug', '[stravaService] Phase 2: Processing captured data...');
    let activitiesProcessed = 0;
    let activitiesFailed = 0;
    if (activities.length > 0) {
      const { processed, failed } =
        await stravaDataProcessor.processStravaActivities(
          userId,
          userId,
          activities,
          detailedActivities,
          startDate,
          tz
        );
      activitiesProcessed = processed;
      activitiesFailed = failed;
    }
    if (athleteData) {
      await stravaDataProcessor.processStravaAthleteWeight(
        userId,
        userId,
        athleteData,
        tz
      );
    }
    // 6. Update last_sync_at, unless a required fetch or an activity failed
    if (failedRequiredFetches.length === 0 && activitiesFailed === 0) {
      const client = await getSystemClient();
      try {
        await client.query(
          "UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'strava'",
          [userId]
        );
      } finally {
        client.release();
      }
    } else {
      log(
        'warn',
        `[stravaService] Strava sync for user ${userId} is incomplete (failed required fetches: ${failedRequiredFetches.join(', ') || 'none'}; failed activities: ${activitiesFailed}); last_sync_at not updated.`
      );
    }
    log(
      'info',
      `[stravaService] Full Strava sync completed for user ${userId}. ${activitiesProcessed} activities processed.`
    );
    return {
      success: true,
      source: 'live_api',
      activitiesProcessed,
      activitiesFailed,
      failedRequiredFetches,
    };
  } catch (error) {
    log(
      'error',
      `[stravaService] Error during full Strava sync for user ${userId}:`,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error.message
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getStatus = (userId: any) => stravaIntegrationService.getStatus(userId);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const disconnectStrava = (userId: any) =>
  stravaIntegrationService.disconnectStrava(userId);
export { syncStravaData };
export { getStatus };
export { disconnectStrava };
export default {
  syncStravaData,
  getStatus,
  disconnectStrava,
};
