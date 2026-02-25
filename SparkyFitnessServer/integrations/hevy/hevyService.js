// SparkyFitnessServer/integrations/hevy/hevyService.js

const fs = require("fs");
const path = require("path");
const moment = require("moment");
const axios = require("axios");
const { getClient, getSystemClient } = require("../../db/poolManager");
const {
  encrypt,
  decrypt,
  ENCRYPTION_KEY,
} = require("../../security/encryption");
const { log } = require("../../config/logging");
const { loadRawBundle } = require("../../utils/diagnosticLogger");
const hevyDataProcessor = require("./hevyDataProcessor");

const HEVY_API_BASE_URL = "https://api.hevyapp.com";

// Configuration for data mocking/caching
const HEVY_DATA_SOURCE = process.env.SPARKY_FITNESS_HEVY_DATA_SOURCE || "hevy";
log(
  "info",
  `[hevyService] Hevy data source configured to: ${HEVY_DATA_SOURCE}`,
);

/**
 * Get the Hevy API key for a specific provider instance.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} providerId - The specific provider ID (optional but recommended).
 * @returns {Promise<string>} - The decrypted API key.
 */
async function getHevyApiKey(userId, providerId) {
  const client = await getSystemClient();
  try {
    let query = `SELECT encrypted_app_key, app_key_iv, app_key_tag
                 FROM external_data_providers
                 WHERE user_id = $1 AND provider_type = 'hevy'`;
    const params = [userId];

    if (providerId) {
      query += ` AND id = $2`;
      params.push(providerId);
    } else {
      // If no providerId, prefer active ones
      query += ` ORDER BY is_active DESC, created_at DESC LIMIT 1`;
    }

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      throw new Error("Hevy provider not found.");
    }

    const { encrypted_app_key, app_key_iv, app_key_tag } = result.rows[0];
    if (!encrypted_app_key) {
      throw new Error("Hevy API key is missing for this provider.");
    }

    return await decrypt(
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      ENCRYPTION_KEY,
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
async function getHevyProviderId(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT id FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'hevy'
             ORDER BY is_active DESC, created_at DESC LIMIT 1`,
      [userId],
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
async function getUserInfo(userId, providerId) {
  const apiKey = await getHevyApiKey(userId, providerId);
  try {
    const response = await axios.get(`${HEVY_API_BASE_URL}/v1/user/info`, {
      headers: { "api-key": apiKey },
    });
    const { logRawResponse } = require("../../utils/diagnosticLogger");
    logRawResponse("hevy", "raw_user_info", response.data);
    return response.data;
  } catch (error) {
    log(
      "error",
      `Error fetching Hevy user info for user ${userId}: ${error.message}`,
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
async function getWorkouts(userId, page = 1, pageSize = 10, providerId) {
  const apiKey = await getHevyApiKey(userId, providerId);
  try {
    const response = await axios.get(`${HEVY_API_BASE_URL}/v1/workouts`, {
      headers: { "api-key": apiKey },
      params: { page, page_size: pageSize },
    });
    const { logRawResponse } = require("../../utils/diagnosticLogger");
    logRawResponse("hevy", "raw_workouts_page", response.data);
    return response.data;
  } catch (error) {
    log(
      "error",
      `Error fetching Hevy workouts for user ${userId}: ${error.message}`,
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
  userId,
  page = 1,
  pageSize = 10,
  providerId,
) {
  const apiKey = await getHevyApiKey(userId, providerId);
  try {
    const response = await axios.get(
      `${HEVY_API_BASE_URL}/v1/exercise_templates`,
      {
        headers: { "api-key": apiKey },
        params: { page, page_size: pageSize },
      },
    );
    const { logRawResponse } = require("../../utils/diagnosticLogger");
    logRawResponse("hevy", "raw_exercise_templates_page", response.data);
    return response.data;
  } catch (error) {
    log(
      "error",
      `Error fetching Hevy exercise templates for user ${userId}: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Synchronize Hevy data for a user.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {boolean} fullSync - Whether to fetch all history or just recent (last 7 days).
 * @returns {Promise<Object>} - The result of the synchronization.
 */
async function syncHevyData(
  userId,
  createdByUserId,
  fullSync = false,
  providerId,
) {
  log(
    "info",
    `Starting Hevy ${fullSync ? "FULL" : "INCREMENTAL"} synchronization for user ${userId}...`,
  );

  if (HEVY_DATA_SOURCE === "local") {
    log(
      "info",
      `[hevyService] Replaying Hevy sync from raw diagnostic bundle for user ${userId}`,
    );
    const bundle = loadRawBundle("hevy");

    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_HEVY_DATA_SOURCE unset (or set to "hevy") ' +
          "and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.",
      );
    }

    const responses = bundle.responses;

    try {
      log("debug", `[hevyService] Processing raw data for ${userId}...`);

      // 1. Process user info
      if (responses["raw_user_info"]) {
        await hevyDataProcessor.processHevyUserInfo(
          userId,
          createdByUserId,
          responses["raw_user_info"].data,
        );
      }

      // 2. Process workouts (Look for all pages)
      const allWorkouts = [];
      Object.keys(responses).forEach((key) => {
        if (key.startsWith("raw_workouts_page")) {
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
        );
      }

      // 3. Update last sync time
      const client = await getSystemClient();
      try {
        await client.query(
          `UPDATE external_data_providers
                     SET last_sync_at = NOW(), updated_at = NOW()
                     WHERE user_id = $1 AND provider_type = 'hevy'`,
          [userId],
        );
      } finally {
        client.release();
      }

      log(
        "info",
        `[hevyService] Hevy sync from raw bundle completed for user ${userId}.`,
      );
      return {
        success: true,
        processedCount: allWorkouts.length,
        source: "local_raw_replay",
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        "error",
        `[hevyService] Error replaying Hevy data from raw bundle for user ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  try {
    // Helper to safely fetch and log raw data without stopping the whole sync
    async function safeFetch(dataType, fetchFn) {
      try {
        const data = await fetchFn();
        if (data) {
          const { logRawResponse } = require("../../utils/diagnosticLogger");
          logRawResponse("hevy", dataType, data);
        }
        return data;
      } catch (error) {
        log(
          "warn",
          `[hevyService] Failed to fetch ${dataType} for user ${userId}: ${error.message}`,
        );
        return null;
      }
    }

    // 1. Fetch EVERYTHING first (The Safe Phase)
    log("debug", `[hevyService] Phase 1: Capturing raw API responses...`);

    const userInfoData = await safeFetch("raw_user_info", () =>
      getUserInfo(userId, providerId),
    );

    const allWorkouts = [];
    let currentPage = 1;
    let hasMore = true;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    while (hasMore) {
      const pageKey = `raw_workouts_page_${currentPage}`;
      const workoutPageData = await safeFetch(pageKey, () =>
        getWorkouts(userId, currentPage, 20, providerId),
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
    log("debug", `[hevyService] Phase 2: Processing captured data...`);

    if (userInfoData) {
      await hevyDataProcessor.processHevyUserInfo(
        userId,
        createdByUserId,
        userInfoData,
      );
    }

    if (allWorkouts.length > 0) {
      await hevyDataProcessor.processHevyWorkouts(
        userId,
        createdByUserId,
        allWorkouts,
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
        [providerId || (await getHevyProviderId(userId))],
      );
    } finally {
      client.release();
    }

    log(
      "info",
      `Hevy synchronization completed for user ${userId}. Total processed: ${totalProcessed}`,
    );
    return {
      success: true,
      processedCount: totalProcessed,
      source: "live_api",
    };
  } catch (error) {
    log(
      "error",
      `Hevy synchronization failed for user ${userId}: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Get status of Hevy integration for a user.
 * @param {string} userId - The Sparky Fitness user ID.
 * @returns {Promise<Object>} - The status info.
 */
async function getStatus(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT is_active, last_sync_at
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'hevy'`,
      [userId],
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
      "error",
      `Error getting Hevy status for user ${userId}: ${error.message}`,
    );
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getUserInfo,
  getWorkouts,
  getExerciseTemplates,
  syncHevyData,
  getStatus,
};
