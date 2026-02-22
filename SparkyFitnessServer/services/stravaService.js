// SparkyFitnessServer/services/stravaService.js

const { log } = require("../config/logging");
const stravaIntegrationService = require("../integrations/strava/stravaService");
const stravaDataProcessor = require("../integrations/strava/stravaDataProcessor");
const { getSystemClient } = require("../db/poolManager");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

// Configuration for data mocking/caching
const STRAVA_DATA_SOURCE =
  process.env.SPARKY_FITNESS_STRAVA_DATA_SOURCE || "strava";
const SAVE_MOCK_DATA = process.env.SPARKY_FITNESS_SAVE_MOCK_DATA === "true"; // Defaults to false
const MOCK_DATA_DIR = path.join(__dirname, "..", "mock_data");

// Ensure mock_data directory exists
if (!fs.existsSync(MOCK_DATA_DIR)) {
  fs.mkdirSync(MOCK_DATA_DIR, { recursive: true });
  log(
    "info",
    `[stravaService] Created mock_data directory at ${MOCK_DATA_DIR}`,
  );
}

log(
  "info",
  `[stravaService] Strava data source configured to: ${STRAVA_DATA_SOURCE}`,
);

/**
 * Load data from a local JSON file in the mock_data directory
 */
function _loadFromLocalFile(filename) {
  const filepath = path.join(MOCK_DATA_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
      log("info", `[stravaService] Data loaded from local file: ${filepath}`);
      return data;
    } catch (error) {
      log(
        "error",
        `[stravaService] Error reading mock data file ${filepath}: ${error.message}`,
      );
      return null;
    }
  }
  log("warn", `[stravaService] Local file not found: ${filepath}`);
  return null;
}

/**
 * Save data to a local JSON file in the mock_data directory
 */
function _saveToLocalFile(filename, data) {
  const filepath = path.join(MOCK_DATA_DIR, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
    log("info", `[stravaService] Data saved to local file: ${filepath}`);
  } catch (error) {
    log(
      "error",
      `[stravaService] Error saving to mock data file ${filepath}: ${error.message}`,
    );
  }
}

/**
 * Orchestrate a full Strava data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 */
async function syncStravaData(userId, syncType = "manual") {
  let startDate, endDate;
  const today = moment();

  if (syncType === "manual") {
    endDate = today.format("YYYY-MM-DD");
    startDate = today.clone().subtract(7, "days").format("YYYY-MM-DD");
  } else if (syncType === "scheduled") {
    endDate = today.format("YYYY-MM-DD");
    startDate = today.format("YYYY-MM-DD");
  } else {
    throw new Error("Invalid syncType. Must be 'manual' or 'scheduled'.");
  }

  // Convert dates to epoch for Strava API (seconds since epoch)
  const afterEpoch = Math.floor(
    moment(startDate, "YYYY-MM-DD").startOf("day").valueOf() / 1000,
  );
  const beforeEpoch = Math.floor(
    moment(endDate, "YYYY-MM-DD").endOf("day").valueOf() / 1000,
  );

  log(
    "info",
    `[stravaService] Starting Strava sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}. ENV_SAVE_MOCK_DATA=${process.env.SPARKY_FITNESS_SAVE_MOCK_DATA}`,
  );

  // Check if we should load from local mock data
  if (STRAVA_DATA_SOURCE === "local") {
    log(
      "info",
      `[stravaService] Loading Strava data from local mock file for user ${userId}`,
    );
    const mockData = _loadFromLocalFile("strava_mock_data.json");

    if (!mockData) {
      throw new Error(
        'Local Strava mock data file not found. Please run a sync with SPARKY_FITNESS_STRAVA_DATA_SOURCE unset (or set to "strava") ' +
          "to fetch from live Strava API and automatically save the data for future local use.",
      );
    }

    log(
      "info",
      `[stravaService] Successfully loaded mock data for user ${userId}. Sync date: ${mockData.sync_date || "unknown"}`,
    );

    const cachedData = mockData.data || {};

    try {
      log("debug", `[stravaService] Processing cached data for ${userId}...`);
      if (cachedData.activities) {
        await stravaDataProcessor.processStravaActivities(
          userId,
          userId,
          cachedData.activities,
          cachedData.detailedActivities || {},
          startDate,
        );
      }
      if (cachedData.athlete) {
        await stravaDataProcessor.processStravaAthleteWeight(
          userId,
          userId,
          cachedData.athlete,
        );
      }

      // Update last_sync_at
      const client = await getSystemClient();
      try {
        await client.query(
          `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'strava'`,
          [userId],
        );
      } finally {
        client.release();
      }

      log(
        "info",
        `[stravaService] Strava sync from local cache completed for user ${userId}.`,
      );
      return {
        success: true,
        source: "local_cache",
        cached_date: mockData.sync_date,
      };
    } catch (error) {
      log(
        "error",
        `[stravaService] Error processing cached Strava data for user ${userId}:`,
        error.message,
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
        "No valid Strava access token. Please re-authorize Strava.",
      );
    }

    // 2. Fetch athlete profile (for weight)
    log("debug", `[stravaService] Fetching athlete profile for ${userId}...`);
    let athleteData = null;
    try {
      athleteData = await stravaIntegrationService.fetchAthlete(accessToken);
    } catch (error) {
      log(
        "warn",
        `[stravaService] Failed to fetch athlete profile for user ${userId}: ${error.message}`,
      );
    }

    // 3. Fetch all activities in date range
    log(
      "debug",
      `[stravaService] Fetching activities for ${userId} (${startDate} to ${endDate})...`,
    );
    const activities = await stravaIntegrationService.fetchAllActivitiesInRange(
      accessToken,
      afterEpoch,
      beforeEpoch,
    );

    log(
      "info",
      `[stravaService] Found ${activities.length} activities for user ${userId}.`,
    );

    // 4. Fetch detailed data for each activity (laps, GPS, splits)
    const detailedActivities = {};
    for (const activity of activities) {
      try {
        // Small delay between requests to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const detailed = await stravaIntegrationService.fetchActivityById(
          accessToken,
          activity.id,
        );
        detailedActivities[activity.id] = detailed;
      } catch (error) {
        log(
          "warn",
          `[stravaService] Failed to fetch details for activity ${activity.id}: ${error.message}`,
        );
        // Continue with summary data for this activity
      }
    }

    // 5. Process all data
    log("debug", `[stravaService] Processing fetched data for ${userId}...`);

    if (activities.length > 0) {
      await stravaDataProcessor.processStravaActivities(
        userId,
        userId,
        activities,
        detailedActivities,
        startDate,
      );
    }

    if (athleteData) {
      await stravaDataProcessor.processStravaAthleteWeight(
        userId,
        userId,
        athleteData,
      );
    }

    // 6. Update last_sync_at
    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'strava'`,
        [userId],
      );
    } finally {
      client.release();
    }

    // 7. Save all fetched data to mock file for future local use
    const mockDataPayload = {
      user_id: userId,
      sync_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      sync_type: syncType,
      start_date: startDate,
      end_date: endDate,
      data: {
        athlete: athleteData,
        activities: activities,
        detailedActivities: detailedActivities,
      },
    };

    if (SAVE_MOCK_DATA) {
      _saveToLocalFile("strava_mock_data.json", mockDataPayload);
    }

    log(
      "info",
      `[stravaService] Full Strava sync completed for user ${userId}. ${activities.length} activities processed.`,
    );
    return {
      success: true,
      source: "live_api",
      activitiesProcessed: activities.length,
    };
  } catch (error) {
    log(
      "error",
      `[stravaService] Error during full Strava sync for user ${userId}:`,
      error.message,
    );
    throw error;
  }
}

const getStatus = (userId) => stravaIntegrationService.getStatus(userId);
const disconnectStrava = (userId) =>
  stravaIntegrationService.disconnectStrava(userId);

module.exports = {
  syncStravaData,
  getStatus,
  disconnectStrava,
};
