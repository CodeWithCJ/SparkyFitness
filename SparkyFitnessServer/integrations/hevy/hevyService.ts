import axios from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { loadRawBundle } from '../../utils/diagnosticLogger.js';
import hevyDataProcessor from './hevyDataProcessor.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { todayInZone, addDays, dayToUtcRange } from '@workspace/shared';
import { logRawResponse } from '../../utils/diagnosticLogger.js';
const HEVY_API_BASE_URL = 'https://api.hevyapp.com';
// Configuration for data mocking/caching
const HEVY_DATA_SOURCE = process.env.SPARKY_FITNESS_HEVY_DATA_SOURCE || 'hevy';
log(
  'info',
  `[hevyService] Hevy data source configured to: ${HEVY_DATA_SOURCE}`
);
/**
 * Get the Hevy API key for a specific provider instance.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} providerId - The specific provider ID (optional but recommended).
 * @returns {Promise<string>} - The decrypted API key.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getHevyApiKey(userId: any, providerId: any) {
  const client = await getSystemClient();
  try {
    let query = `SELECT encrypted_app_key, app_key_iv, app_key_tag
                 FROM external_data_providers
                 WHERE user_id = $1 AND provider_type = 'hevy'`;
    const params = [userId];
    if (providerId) {
      query += ' AND id = $2';
      params.push(providerId);
    } else {
      // If no providerId, prefer active ones
      query += ' ORDER BY is_active DESC, created_at DESC LIMIT 1';
    }
    const result = await client.query(query, params);
    if (result.rows.length === 0) {
      throw new Error('Hevy provider not found.');
    }
    const { encrypted_app_key, app_key_iv, app_key_tag } = result.rows[0];
    if (!encrypted_app_key) {
      throw new Error('Hevy API key is missing for this provider.');
    }
    return await decrypt(
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      ENCRYPTION_KEY
    );
  } finally {
    client.release();
  }
}
/**
 * Helper to get a hevy provider ID for a user.
 * @param {string} userId
 * @returns {Promise<string>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getHevyProviderId(userId: any) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT id FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'hevy'
             ORDER BY is_active DESC, created_at DESC LIMIT 1`,
      [userId]
    );
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    return null;
  } finally {
    client.release();
  }
}
/**
 * Fetch user info from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @returns {Promise<Object>} - The Hevy user info.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserInfo(userId: any, providerId: any) {
  const apiKey = await getHevyApiKey(userId, providerId);
  try {
    const response = await axios.get(`${HEVY_API_BASE_URL}/v1/user/info`, {
      headers: { 'api-key': apiKey },
    });
    logRawResponse('hevy', 'raw_user_info', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error fetching Hevy user info for user ${userId}: ${error.message}`
    );
    throw error;
  }
}
/**
 * Fetch workouts from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {number} page - The page number.
 * @param {number} pageSize - The number of workouts per page.
 * @returns {Promise<Object>} - The paginated workouts.
 */

async function getWorkouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  page = 1,
  pageSize = 10,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  const apiKey = await getHevyApiKey(userId, providerId);
  try {
    const response = await axios.get(`${HEVY_API_BASE_URL}/v1/workouts`, {
      headers: { 'api-key': apiKey },
      params: { page, page_size: pageSize },
    });
    logRawResponse('hevy', 'raw_workouts_page', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error fetching Hevy workouts for user ${userId}: ${error.message}`
    );
    throw error;
  }
}
/**
 * Fetch exercise templates from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {number} page - The page number.
 * @param {number} pageSize - The number of templates per page.
 * @returns {Promise<Object>} - The paginated exercise templates.
 */
async function getExerciseTemplates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  page = 1,
  pageSize = 10,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  const apiKey = await getHevyApiKey(userId, providerId);
  try {
    const response = await axios.get(
      `${HEVY_API_BASE_URL}/v1/exercise_templates`,
      {
        headers: { 'api-key': apiKey },
        params: { page, page_size: pageSize },
      }
    );
    logRawResponse('hevy', 'raw_exercise_templates_page', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error fetching Hevy exercise templates for user ${userId}: ${error.message}`
    );
    throw error;
  }
}
/**
 * Synchronize Hevy data for a user.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {boolean} fullSync - Whether to fetch all history or just recent.
 * @param {string} providerId - Optional provider ID.
 * @param {string} [startDate] - Optional custom start date (YYYY-MM-DD).
 * @param {string} [endDate] - Optional custom end date (YYYY-MM-DD).
 * @returns {Promise<Object>} - The result of the synchronization.
 */
async function syncHevyData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  fullSync = false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any,
  startDate = null,
  endDate = null
) {
  const tz = await loadUserTimezone(userId);
  log(
    'info',
    `Starting Hevy ${fullSync ? 'FULL' : 'INCREMENTAL'} synchronization for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}...`
  );
  if (HEVY_DATA_SOURCE === 'local') {
    log(
      'info',
      `[hevyService] Replaying Hevy sync from raw diagnostic bundle for user ${userId}`
    );
    const bundle = loadRawBundle('hevy');
    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_HEVY_DATA_SOURCE unset (or set to "hevy") ' +
          'and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.'
      );
    }
    const responses = bundle.responses;
    try {
      log('debug', `[hevyService] Processing raw data for ${userId}...`);
      // 1. Process user info
      if (responses['raw_user_info']) {
        await hevyDataProcessor.processHevyUserInfo(
          userId,
          createdByUserId,
          responses['raw_user_info'].data,
          tz
        );
      }
      // 2. Process workouts (Look for all pages)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allWorkouts: any = [];
      Object.keys(responses).forEach((key) => {
        if (key.startsWith('raw_workouts_page')) {
          const pageData = responses[key].data;
          if (pageData && pageData.workouts) {
            allWorkouts.push(...pageData.workouts);
          }
        }
      });
      if (allWorkouts.length > 0) {
        await hevyDataProcessor.processHevyWorkouts(
          userId,
          createdByUserId,
          allWorkouts,
          tz
        );
      }
      // 3. Update last sync time
      const client = await getSystemClient();
      try {
        await client.query(
          `UPDATE external_data_providers
                     SET last_sync_at = NOW(), updated_at = NOW()
                     WHERE user_id = $1 AND provider_type = 'hevy'`,
          [userId]
        );
      } finally {
        client.release();
      }
      log(
        'info',
        `[hevyService] Hevy sync from raw bundle completed for user ${userId}.`
      );
      return {
        success: true,
        processedCount: allWorkouts.length,
        source: 'local_raw_replay',
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        'error',
        `[hevyService] Error replaying Hevy data from raw bundle for user ${userId}:`,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error.message
      );
      throw error;
    }
  }
  try {
    // Helper to safely fetch and log raw data without stopping the whole sync
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function safeFetch(dataType: any, fetchFn: any) {
      try {
        const data = await fetchFn();
        if (data) {
          logRawResponse('hevy', dataType, data);
        }
        return data;
      } catch (error) {
        log(
          'warn',
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          `[hevyService] Failed to fetch ${dataType} for user ${userId}: ${error.message}`
        );
        return null;
      }
    }
    // 1. Fetch EVERYTHING first (The Safe Phase)
    log('debug', '[hevyService] Phase 1: Capturing raw API responses...');
    const userInfoData = await safeFetch('raw_user_info', () =>
      getUserInfo(userId, providerId)
    );
    const allWorkouts = [];
    let currentPage = 1;
    let hasMore = true;
    const sevenDaysAgoStr = addDays(todayInZone(tz), -7);
    const { start: sevenDaysAgo } = dayToUtcRange(sevenDaysAgoStr, tz);
    while (hasMore) {
      const pageKey = `raw_workouts_page_${currentPage}`;
      const workoutPageData = await safeFetch(pageKey, () =>
        getWorkouts(userId, currentPage, 20, providerId)
      );
      if (
        !workoutPageData ||
        !workoutPageData.workouts ||
        workoutPageData.workouts.length === 0
      ) {
        hasMore = false;
        break;
      }
      const workouts = workoutPageData.workouts;
      allWorkouts.push(...workouts);
      const pageCount = workoutPageData.page_count || 1;
      // Decision to continue
      if (fullSync) {
        hasMore = currentPage < pageCount;
        currentPage++;
      } else {
        const oldestWorkout = workouts[workouts.length - 1];
        const oldestTime = new Date(oldestWorkout.start_time);
        if (oldestTime < sevenDaysAgo) {
          hasMore = false;
        } else {
          hasMore = currentPage < pageCount;
          currentPage++;
        }
      }
    }
    // 2. Process EVERYTHING second (The Action Phase)
    log('debug', '[hevyService] Phase 2: Processing captured data...');
    if (userInfoData) {
      await hevyDataProcessor.processHevyUserInfo(
        userId,
        createdByUserId,
        userInfoData,
        tz
      );
    }
    if (allWorkouts.length > 0) {
      await hevyDataProcessor.processHevyWorkouts(
        userId,
        createdByUserId,
        allWorkouts,
        tz
      );
    }
    const totalProcessed = allWorkouts.length;
    // 3. Update last sync time
    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE external_data_providers
                 SET last_sync_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
        [providerId || (await getHevyProviderId(userId))]
      );
    } finally {
      client.release();
    }
    log(
      'info',
      `Hevy synchronization completed for user ${userId}. Total processed: ${totalProcessed}`
    );
    return {
      success: true,
      processedCount: totalProcessed,
      source: 'live_api',
    };
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Hevy synchronization failed for user ${userId}: ${error.message}`
    );
    throw error;
  }
}
/**
 * Get status of Hevy integration for a user.
 * @param {string} userId - The Sparky Fitness user ID.
 * @returns {Promise<Object>} - The status info.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStatus(userId: any) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT is_active, last_sync_at
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'hevy'`,
      [userId]
    );
    if (result.rows.length === 0) {
      return { connected: false, lastSyncAt: null };
    }
    const { is_active, last_sync_at } = result.rows[0];
    return {
      connected: is_active,
      lastSyncAt: last_sync_at,
    };
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error getting Hevy status for user ${userId}: ${error.message}`
    );
    throw error;
  } finally {
    client.release();
  }
}
export { getUserInfo };
export { getWorkouts };
export { getExerciseTemplates };
export { syncHevyData };
export { getStatus };
export default {
  getUserInfo,
  getWorkouts,
  getExerciseTemplates,
  syncHevyData,
  getStatus,
};
