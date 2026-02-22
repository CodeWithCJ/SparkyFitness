// SparkyFitnessServer/services/polarService.js

const { log } = require("../config/logging");
const polarIntegrationService = require("../integrations/polar/polarService");
const polarDataProcessor = require("../integrations/polar/polarDataProcessor");
const { getSystemClient } = require("../db/poolManager");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

const { loadRawBundle } = require("../utils/diagnosticLogger");

// Configuration for data mocking/caching
const POLAR_DATA_SOURCE =
  process.env.SPARKY_FITNESS_POLAR_DATA_SOURCE || "polar";
log(
  "info",
  `[polarService] Polar data source configured to: ${POLAR_DATA_SOURCE}`,
);

/**
 * Orchestrate a full Polar data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 */
async function syncPolarData(userId, syncType = "manual", providerId) {
  log(
    "info",
    `[polarService] Starting Polar sync (${syncType}) for user ${userId}${providerId ? ` (Provider ID: ${providerId})` : ""}. ENV_SAVE_MOCK_DATA=${process.env.SPARKY_FITNESS_SAVE_MOCK_DATA}`,
  );

  if (POLAR_DATA_SOURCE === "local") {
    log(
      "info",
      `[polarService] Replaying Polar sync from raw diagnostic bundle for user ${userId}`,
    );
    const bundle = loadRawBundle("polar");

    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_POLAR_DATA_SOURCE unset (or set to "polar") ' +
          "and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.",
      );
    }

    const responses = bundle.responses;

    try {
      // Process raw data from bundle
      if (responses["raw_physical_info_list"]) {
        await polarDataProcessor.processPolarPhysicalInfo(
          userId,
          userId,
          responses["raw_physical_info_list"].data,
        );
      } else if (responses["raw_physical_info_item"]) {
        await polarDataProcessor.processPolarPhysicalInfo(userId, userId, [
          responses["raw_physical_info_item"].data,
        ]);
      }

      if (responses["raw_exercises_recent"]) {
        await polarDataProcessor.processPolarExercises(
          userId,
          userId,
          responses["raw_exercises_recent"].data,
        );
      } else if (responses["raw_exercise_item"]) {
        await polarDataProcessor.processPolarExercises(userId, userId, [
          responses["raw_exercise_item"].data,
        ]);
      }

      if (responses["raw_activity_list"]) {
        await polarDataProcessor.processPolarActivity(
          userId,
          userId,
          responses["raw_activity_list"].data,
        );
      } else if (responses["raw_activity_item"]) {
        await polarDataProcessor.processPolarActivity(userId, userId, [
          responses["raw_activity_item"].data,
        ]);
      }

      if (responses["raw_sleep_list"]) {
        await polarDataProcessor.processPolarSleep(
          userId,
          userId,
          responses["raw_sleep_list"].data,
        );
      } else if (responses["raw_sleep"]) {
        await polarDataProcessor.processPolarSleep(
          userId,
          userId,
          responses["raw_sleep"].data,
        );
      }

      if (responses["raw_nightly_recharge"]) {
        await polarDataProcessor.processPolarNightlyRecharge(
          userId,
          userId,
          responses["raw_nightly_recharge"].data,
        );
      }

      // Update last_sync_at
      const client = await getSystemClient();
      try {
        const updateQuery = providerId
          ? {
              text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE id = $1 AND user_id = $2`,
              values: [providerId, userId],
            }
          : {
              text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'polar'`,
              values: [userId],
            };

        await client.query(updateQuery.text, updateQuery.values);
      } finally {
        client.release();
      }

      log(
        "info",
        `[polarService] Polar sync from raw bundle completed for user ${userId}.`,
      );
      return {
        success: true,
        source: "local_raw_replay",
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        "error",
        `[polarService] Error replaying Polar data from raw bundle for user ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  try {
    log("info", `[polarService] Fetching live Polar data for user ${userId}`);

    // Get access token and external user ID
    const { accessToken, externalUserId } =
      await polarIntegrationService.getValidAccessToken(userId, providerId);

    // Helper to safely fetch raw data (logging is handled inside the integration methods)
    async function safeFetch(dataType, fetchFn) {
      try {
        return await fetchFn();
      } catch (error) {
        log(
          "warn",
          `[polarService] Failed to fetch ${dataType} for user ${userId}: ${error.message}`,
        );
        return null;
      }
    }

    // 1. Fetch EVERYTHING first (The Safe Phase)
    log("debug", `[polarService] Phase 1: Capturing raw API responses...`);

    const physicalInfo =
      (await safeFetch("physical_info", () =>
        polarIntegrationService.fetchPhysicalInfo(
          userId,
          externalUserId,
          accessToken,
        ),
      )) || [];

    const newExercises =
      (await safeFetch("exercises_transaction", () =>
        polarIntegrationService.fetchExercises(
          userId,
          externalUserId,
          accessToken,
        ),
      )) || [];

    const newActivities =
      (await safeFetch("activities_transaction", () =>
        polarIntegrationService.fetchDailyActivity(
          userId,
          externalUserId,
          accessToken,
        ),
      )) || [];

    let allExercises = [...newExercises];
    let allActivities = [...newActivities];

    if (syncType === "manual") {
      log(
        "info",
        `[polarService] Manual sync: Fetching recent history for user ${userId}.`,
      );

      const recentExercises = await safeFetch("exercises_recent", () =>
        polarIntegrationService.fetchRecentExercises(userId, accessToken),
      );
      if (recentExercises) allExercises = [...allExercises, ...recentExercises];

      const recentActivities = await safeFetch("activities_recent", () =>
        polarIntegrationService.fetchRecentDailyActivity(userId, accessToken),
      );
      if (recentActivities)
        allActivities = [...allActivities, ...recentActivities];

      const userProfile = await safeFetch("user_profile", () =>
        polarIntegrationService.fetchUserProfile(
          userId,
          externalUserId,
          accessToken,
        ),
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

    const newSleep = await safeFetch("sleep_recent", () =>
      polarIntegrationService.fetchRecentSleepData(userId, accessToken),
    );

    const newRecharge = await safeFetch("nightly_recharge", () =>
      polarIntegrationService.fetchRecentNightlyRecharge(userId, accessToken),
    );

    // 2. Process EVERYTHING second (The Action Phase)
    log("debug", `[polarService] Phase 2: Processing captured data...`);

    // Remove duplicates before processing
    allExercises = Array.from(
      new Map(allExercises.map((ex) => [ex.id, ex])).values(),
    );
    allActivities = Array.from(
      new Map(allActivities.map((act) => [act.date, act])).values(),
    );

    // Process data
    if (physicalInfo && physicalInfo.length > 0) {
      await polarDataProcessor.processPolarPhysicalInfo(
        userId,
        userId,
        physicalInfo,
      );
    }

    if (allExercises && allExercises.length > 0) {
      await polarDataProcessor.processPolarExercises(
        userId,
        userId,
        allExercises,
      );
    } else {
      log(
        "info",
        `[polarService] No Polar exercise data (transaction or recent list) found for user ${userId}.`,
      );
    }

    if (allActivities && allActivities.length > 0) {
      await polarDataProcessor.processPolarActivity(
        userId,
        userId,
        allActivities,
      );
    }

    if (newSleep && newSleep.length > 0) {
      await polarDataProcessor.processPolarSleep(userId, userId, newSleep);
    }

    if (newRecharge && newRecharge.length > 0) {
      await polarDataProcessor.processPolarNightlyRecharge(
        userId,
        userId,
        newRecharge,
      );
    }

    // Update last_sync_at
    const client = await getSystemClient();
    try {
      const updateQuery = providerId
        ? {
            text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE id = $1 AND user_id = $2`,
            values: [providerId, userId],
          }
        : {
            text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'polar'`,
            values: [userId],
          };

      await client.query(updateQuery.text, updateQuery.values);
    } finally {
      client.release();
    }

    log(
      "info",
      `[polarService] Full Polar live sync completed for user ${userId}.`,
    );
    return { success: true, source: "live_api" };
  } catch (error) {
    log(
      "error",
      `[polarService] Error during full Polar sync for user ${userId}:`,
      error.message,
    );
    throw error;
  }
}

/**
 * Get Polar connection status
 * @param {number} userId
 */
async function getStatus(userId, providerId) {
  return await polarIntegrationService.getStatus(userId, providerId);
}

/**
 * Disconnect Polar provider
 * @param {number} userId
 * @param {string} providerId
 */
async function disconnectPolar(userId, providerId) {
  return await polarIntegrationService.disconnectPolar(userId, providerId);
}

module.exports = {
  syncPolarData,
  getStatus,
  disconnectPolar,
};
