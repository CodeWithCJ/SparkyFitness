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
const hevyDataProcessor = require("./hevyDataProcessor");

const HEVY_API_BASE_URL = "https://api.hevyapp.com";

// Configuration for data mocking/caching
const HEVY_DATA_SOURCE = process.env.SPARKY_FITNESS_HEVY_DATA_SOURCE || "hevy";
const SAVE_MOCK_DATA = process.env.SPARKY_FITNESS_SAVE_MOCK_DATA === "true"; // Defaults to false
const MOCK_DATA_DIR = path.join(__dirname, "..", "..", "mock_data");

// Ensure mock_data directory exists
if (!fs.existsSync(MOCK_DATA_DIR)) {
  fs.mkdirSync(MOCK_DATA_DIR, { recursive: true });
  log("info", `[hevyService] Created mock_data directory at ${MOCK_DATA_DIR}`);
}

log(
  "info",
  `[hevyService] Hevy data source configured to: ${HEVY_DATA_SOURCE}`,
);

/**
 * Load data from a local JSON file in the mock_data directory
 * @param {string} filename - Name of the file to load
 * @returns {object|null} - Parsed JSON data or null if file doesn't exist
 */
function _loadFromLocalFile(filename) {
  const filepath = path.join(MOCK_DATA_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
      log("info", `[hevyService] Data loaded from local file: ${filepath}`);
      return data;
    } catch (error) {
      log(
        "error",
        `[hevyService] Error reading mock data file ${filepath}: ${error.message}`,
      );
      return null;
    }
  }
  log("warn", `[hevyService] Local file not found: ${filepath}`);
  return null;
}

/**
 * Save data to a local JSON file in the mock_data directory
 * @param {string} filename - Name of the file to save
 * @param {object} data - Data to save as JSON
 */
function _saveToLocalFile(filename, data) {
  const filepath = path.join(MOCK_DATA_DIR, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
    log("info", `[hevyService] Data saved to local file: ${filepath}`);
  } catch (error) {
    log(
      "error",
      `[hevyService] Error saving to mock data file ${filepath}: ${error.message}`,
    );
  }
}

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
      `[hevyService] Loading Hevy data from local mock file for user ${userId}`,
    );
    const mockData = _loadFromLocalFile("hevy_mock_data.json");

    if (!mockData) {
      throw new Error(
        'Local Hevy mock data file not found. Please run a sync with SPARKY_FITNESS_HEVY_DATA_SOURCE unset (or set to "hevy") ' +
          "to fetch from live Hevy API and automatically save the data for future local use.",
      );
    }

    log(
      "info",
      `[hevyService] Successfully loaded mock data for user ${userId}. Sync date: ${mockData.sync_date || "unknown"}`,
    );

    try {
      const data = mockData.data || {};

      // 1. Process user info
      if (data.userInfo) {
        await hevyDataProcessor.processHevyUserInfo(
          userId,
          createdByUserId,
          data.userInfo,
        );
      }

      // 2. Process workouts
      if (data.workouts && Array.isArray(data.workouts)) {
        await hevyDataProcessor.processHevyWorkouts(
          userId,
          createdByUserId,
          data.workouts,
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
        `[hevyService] Hevy sync from local cache completed for user ${userId}.`,
      );
      return {
        success: true,
        processedCount: (data.workouts || []).length,
        source: "local_cache",
        cached_date: mockData.sync_date,
      };
    } catch (error) {
      log(
        "error",
        `[hevyService] Error processing cached Hevy data for user ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  try {
    // 0. Sync user info (measurements)
    const userInfoData = await getUserInfo(userId, providerId);
    await hevyDataProcessor.processHevyUserInfo(
      userId,
      createdByUserId,
      userInfoData,
    );

    let currentPage = 1;
    let totalProcessed = 0;
    let hasMore = true;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const allWorkouts = [];

    while (hasMore) {
      log("debug", `Fetching Hevy workouts page ${currentPage}...`);
      const workoutData = await getWorkouts(
        userId,
        currentPage,
        20,
        providerId,
      );
      const workouts = workoutData.workouts || [];
      const pageCount = workoutData.page_count || 1;

      if (workouts.length === 0) {
        hasMore = false;
        break;
      }

      // Process this page of workouts
      await hevyDataProcessor.processHevyWorkouts(
        userId,
        createdByUserId,
        workouts,
      );
      totalProcessed += workouts.length;

      // Collect for mock data
      if (SAVE_MOCK_DATA) {
        allWorkouts.push(...workouts);
      }

      // Decision to continue
      if (fullSync) {
        // Keep going if there are more pages
        hasMore = currentPage < pageCount;
        currentPage++;
      } else {
        // Incremental sync: check if the oldest workout in this page is within 7 days
        // Hevy workouts are usually sorted by date desc
        const oldestWorkoutOnPage = workouts[workouts.length - 1];
        const oldestTime = new Date(oldestWorkoutOnPage.start_time);

        if (oldestTime < sevenDaysAgo) {
          log(
            "debug",
            `Stopping incremental sync: workout date ${oldestTime.toISOString()} is older than 7 days.`,
          );
          hasMore = false;
        } else {
          hasMore = currentPage < pageCount;
          currentPage++;
        }
      }
    }

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

    // 4. Save fetched data to mock file
    if (SAVE_MOCK_DATA) {
      const mockDataPayload = {
        user_id: userId,
        sync_date: moment().format("YYYY-MM-DD HH:mm:ss"),
        full_sync: fullSync,
        data: {
          userInfo: userInfoData,
          workouts: allWorkouts,
        },
      };
      _saveToLocalFile("hevy_mock_data.json", mockDataPayload);
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
