// SparkyFitnessServer/services/withingsService.js

const { log } = require("../config/logging");
const withingsIntegrationService = require("../integrations/withings/withingsService");
const withingsDataProcessor = require("../integrations/withings/withingsDataProcessor");
const { getSystemClient } = require("../db/poolManager");
const { loadRawBundle } = require("../utils/diagnosticLogger");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

// Configuration for data mocking/caching
const WITHINGS_DATA_SOURCE =
  process.env.SPARKY_FITNESS_WITHINGS_DATA_SOURCE || "withings";
log(
  "info",
  `[withingsService] Withings data source configured to: ${WITHINGS_DATA_SOURCE}`,
);

/**
 * Orchestrate a full Withings data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 */
async function syncWithingsData(userId, syncType = "manual") {
  const today = new Date();

  // Calculate dates for sync
  const endDateForYMD = new Date(today);
  endDateForYMD.setDate(today.getDate() + 1); // Tomorrow
  const startDateForYMD = new Date(today);
  startDateForYMD.setDate(today.getDate() - 7); // 7 days ago

  const startDateYMD = startDateForYMD.toISOString().split("T")[0];
  const endDateYMD = endDateForYMD.toISOString().split("T")[0];
  const startDateUnix = Math.floor(startDateForYMD.getTime() / 1000);
  const endDateUnix = Math.floor(today.getTime() / 1000);

  log(
    "info",
    `[withingsService] Starting Withings sync (${syncType}) for user ${userId}. Loading from: ${WITHINGS_DATA_SOURCE}`,
  );

  if (WITHINGS_DATA_SOURCE === "local") {
    log(
      "info",
      `[withingsService] Replaying Withings sync from raw diagnostic bundle for user ${userId}`,
    );
    const bundle = loadRawBundle("withings");

    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_WITHINGS_DATA_SOURCE unset (or set to "withings") ' +
          "and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.",
      );
    }

    const responses = bundle.responses;

    try {
      log("debug", `[withingsService] Processing raw data for ${userId}...`);

      if (responses["raw_measures"]) {
        await withingsDataProcessor.processWithingsMeasures(
          userId,
          userId,
          responses["raw_measures"].data,
        );
      }
      if (responses["raw_heart"]) {
        await withingsDataProcessor.processWithingsHeartData(
          userId,
          userId,
          responses["raw_heart"].data,
        );
      }
      if (responses["raw_sleep"]) {
        await withingsDataProcessor.processWithingsSleepData(
          userId,
          userId,
          responses["raw_sleep"].data,
        );
      }
      if (responses["raw_workouts"]) {
        await withingsDataProcessor.processWithingsWorkouts(
          userId,
          userId,
          responses["raw_workouts"].data,
        );
      }

      // Update last_sync_at
      const client = await getSystemClient();
      try {
        await client.query(
          `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'withings'`,
          [userId],
        );
      } finally {
        client.release();
      }

      log(
        "info",
        `[withingsService] Withings sync from raw bundle completed for user ${userId}.`,
      );
      return {
        success: true,
        source: "local_raw_replay",
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        "error",
        `[withingsService] Error replaying Withings data from raw bundle for user ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  try {
    log(
      "info",
      `[withingsService] Fetching live Withings data for user ${userId}`,
    );

    // Helper to safely fetch raw data (logging is handled inside the integration methods)
    async function safeFetch(dataType, fetchFn) {
      try {
        return await fetchFn();
      } catch (error) {
        log(
          "warn",
          `[withingsService] Failed to fetch ${dataType} for user ${userId}: ${error.message}`,
        );
        return null; // Return null so we can continue with other data types
      }
    }

    // 1. Fetch EVERYTHING first (The Safe Phase)
    log("debug", `[withingsService] Phase 1: Capturing raw API responses...`);
    const bundle = {
      measures: await safeFetch("raw_measures", () =>
        withingsIntegrationService.fetchMeasuresData(
          userId,
          startDateUnix,
          endDateUnix,
        ),
      ),
      heart: await safeFetch("raw_heart", () =>
        withingsIntegrationService.fetchHeartData(
          userId,
          startDateUnix,
          endDateUnix,
        ),
      ),
      sleep: await safeFetch("raw_sleep", () =>
        withingsIntegrationService.fetchSleepData(
          userId,
          startDateUnix,
          endDateUnix,
        ),
      ),
      workouts: await safeFetch("raw_workouts", () =>
        withingsIntegrationService.fetchWorkoutsData(
          userId,
          startDateYMD,
          endDateYMD,
        ),
      ),
    };

    // 2. Process EVERYTHING second (The Action Phase)
    log("debug", `[withingsService] Phase 2: Processing captured data...`);

    if (bundle.measures) {
      await withingsDataProcessor.processWithingsMeasures(
        userId,
        userId,
        bundle.measures,
      );
    }
    if (bundle.heart) {
      await withingsDataProcessor.processWithingsHeartData(
        userId,
        userId,
        bundle.heart,
      );
    }
    if (bundle.sleep) {
      await withingsDataProcessor.processWithingsSleepData(
        userId,
        userId,
        bundle.sleep,
      );
    }
    if (bundle.workouts) {
      await withingsDataProcessor.processWithingsWorkouts(
        userId,
        userId,
        bundle.workouts,
      );
    }

    // Update last_sync_at (redundant if already updated, but safe)

    // Update last_sync_at (redundant if already updated, but safe)
    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'withings'`,
        [userId],
      );
    } finally {
      client.release();
    }

    log(
      "info",
      `[withingsService] Full Withings live sync completed for user ${userId}.`,
    );
    return { success: true, source: "live_api" };
  } catch (error) {
    log(
      "error",
      `[withingsService] Error during full Withings sync for user ${userId}:`,
      error.message,
    );
    throw error;
  }
}

module.exports = {
  syncWithingsData,
};
