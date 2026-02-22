// SparkyFitnessServer/services/fitbitService.js

const { log } = require("../config/logging");
const fitbitIntegrationService = require("../integrations/fitbit/fitbitService");
const fitbitDataProcessor = require("../integrations/fitbit/fitbitDataProcessor");
const { getSystemClient } = require("../db/poolManager");
const { loadRawBundle } = require("../utils/diagnosticLogger");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

// Configuration for data mocking/caching
const FITBIT_DATA_SOURCE =
  process.env.SPARKY_FITNESS_FITBIT_DATA_SOURCE || "fitbit";
log(
  "info",
  `[fitbitService] Fitbit data source configured to: ${FITBIT_DATA_SOURCE}`,
);

/**
 * Orchestrate a full Fitbit data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 */
async function syncFitbitData(userId, syncType = "manual") {
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

  log(
    "info",
    `[fitbitService] Starting Fitbit sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}.`,
  );

  if (FITBIT_DATA_SOURCE === "local") {
    log(
      "info",
      `[fitbitService] Replaying Fitbit sync from raw diagnostic bundle for user ${userId}`,
    );
    const bundle = loadRawBundle("fitbit");

    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Please run a sync with SPARKY_FITNESS_FITBIT_DATA_SOURCE unset (or set to "fitbit") ' +
          "and SPARKY_FITNESS_SAVE_MOCK_DATA=true to capture raw API responses first.",
      );
    }

    const responses = bundle.responses;

    try {
      // 1. Extract Unit Preferences and Timezone from Profil/Responses if available
      const profileResponse = responses["raw_profile"]?.data;
      const timezoneOffset = profileResponse?.user?.offsetFromUTCMillis || 0;
      const weightUnit = profileResponse?.user?.weightUnit || "METRIC";
      const distanceUnit = profileResponse?.user?.distanceUnit || "METRIC";
      const waterUnit = profileResponse?.user?.waterUnit || "METRIC";
      const temperatureUnit =
        profileResponse?.user?.temperatureUnit || "METRIC";

      // 2. Process all raw items from bundle
      log("debug", `[fitbitService] Processing raw data for ${userId}...`);
      if (responses["raw_profile"])
        await fitbitDataProcessor.processFitbitProfile(
          userId,
          userId,
          responses["raw_profile"].data,
        );
      if (responses["raw_heart_rate"])
        await fitbitDataProcessor.processFitbitHeartRate(
          userId,
          userId,
          responses["raw_heart_rate"].data,
        );
      if (responses["raw_steps"])
        await fitbitDataProcessor.processFitbitSteps(
          userId,
          userId,
          responses["raw_steps"].data,
        );
      if (responses["raw_weight"])
        await fitbitDataProcessor.processFitbitWeight(
          userId,
          userId,
          responses["raw_weight"].data,
          weightUnit,
        );
      if (responses["raw_body_fat"])
        await fitbitDataProcessor.processFitbitBodyFat(
          userId,
          userId,
          responses["raw_body_fat"].data,
        );
      if (responses["raw_spo2"])
        await fitbitDataProcessor.processFitbitSpO2(
          userId,
          userId,
          responses["raw_spo2"].data,
        );
      if (responses["raw_temperature"])
        await fitbitDataProcessor.processFitbitTemperature(
          userId,
          userId,
          responses["raw_temperature"].data,
          temperatureUnit,
        );
      if (responses["raw_hrv"])
        await fitbitDataProcessor.processFitbitHRV(
          userId,
          userId,
          responses["raw_hrv"].data,
        );
      if (responses["raw_respiratory_rate"])
        await fitbitDataProcessor.processFitbitRespiratoryRate(
          userId,
          userId,
          responses["raw_respiratory_rate"].data,
        );
      if (responses["raw_active_zone_minutes"])
        await fitbitDataProcessor.processFitbitActiveZoneMinutes(
          userId,
          userId,
          responses["raw_active_zone_minutes"].data,
        );

      // Activity metrics (handle multi-part if needed, usually consolidated now)
      const activityMetrics = {};
      ["Sedentary", "LightlyActive", "FairlyActive", "VeryActive"].forEach(
        (m) => {
          const key = `raw_activity_metric_minutes${m}`;
          if (responses[key]) {
            activityMetrics[`minutes${m}`] =
              responses[key].data[`activities-tracker-minutes${m}`];
          }
        },
      );
      if (Object.keys(activityMetrics).length > 0) {
        await fitbitDataProcessor.processFitbitActivityMinutes(
          userId,
          userId,
          activityMetrics,
        );
      }

      if (responses["raw_sleep"])
        await fitbitDataProcessor.processFitbitSleep(
          userId,
          userId,
          responses["raw_sleep"].data,
          timezoneOffset,
        );
      if (responses["raw_activities_list"])
        await fitbitDataProcessor.processFitbitActivities(
          userId,
          userId,
          responses["raw_activities_list"].data,
          timezoneOffset,
          distanceUnit,
          startDate,
        );
      if (responses["raw_water"])
        await fitbitDataProcessor.processFitbitWater(
          userId,
          userId,
          responses["raw_water"].data,
          waterUnit,
        );
      if (responses["raw_cardio_fitness"])
        await fitbitDataProcessor.processFitbitCardioFitness(
          userId,
          userId,
          responses["raw_cardio_fitness"].data,
        );
      if (responses["raw_core_temperature"])
        await fitbitDataProcessor.processFitbitCoreTemperature(
          userId,
          userId,
          responses["raw_core_temperature"].data,
          temperatureUnit,
        );

      // Update last_sync_at
      const client = await getSystemClient();
      try {
        await client.query(
          `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'fitbit'`,
          [userId],
        );
      } finally {
        client.release();
      }

      log(
        "info",
        `[fitbitService] Fitbit sync from raw bundle completed for user ${userId}.`,
      );
      return {
        success: true,
        source: "local_raw_replay",
        bundle_updated: bundle.last_updated,
      };
    } catch (error) {
      log(
        "error",
        `[fitbitService] Error replaying Fitbit data from raw bundle for user ${userId}:`,
        error.message,
      );
      throw error;
    }
  }

  try {
    // 1. Fetch token and Profile first to get unit preferences and timezone
    const accessToken =
      await fitbitIntegrationService.getValidAccessToken(userId);
    const profileData = await fitbitIntegrationService.fetchProfile(
      userId,
      accessToken,
    );
    const timezoneOffset = profileData?.user?.offsetFromUTCMillis || 0;
    const weightUnit = profileData?.user?.weightUnit || "METRIC";
    const distanceUnit = profileData?.user?.distanceUnit || "METRIC";
    const waterUnit = profileData?.user?.waterUnit || "METRIC";
    const temperatureUnit = profileData?.user?.temperatureUnit || "METRIC";

    // 2. Fetch all other data sequentially to avoid 429 Resource Exhausted errors
    const safeFetch = async (fetchFn, name) => {
      try {
        // Add a small 1.5s delay between fetches to respect rate limits (429 prevention)
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return await fetchFn();
      } catch (error) {
        log(
          "warn",
          `[fitbitService] Failed to fetch ${name} for user ${userId}: ${error.message}`,
        );
        return null;
      }
    };

    log("debug", `[fitbitService] Fetching heart rate for ${userId}...`);
    const heartRateData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchHeartRate(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "heart rate",
    );

    log("debug", `[fitbitService] Fetching steps for ${userId}...`);
    const stepsData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchSteps(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "steps",
    );

    log("debug", `[fitbitService] Fetching weight for ${userId}...`);
    const weightData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchWeight(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "weight",
    );

    log("debug", `[fitbitService] Fetching body fat for ${userId}...`);
    const bodyFatData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchBodyFat(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "body fat",
    );

    log("debug", `[fitbitService] Fetching SpO2 for ${userId}...`);
    const spo2Data = await safeFetch(
      () =>
        fitbitIntegrationService.fetchSpO2(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "SpO2",
    );

    log("debug", `[fitbitService] Fetching temperature for ${userId}...`);
    const tempData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchTemperature(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "temperature",
    );

    log("debug", `[fitbitService] Fetching HRV for ${userId}...`);
    const hrvData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchHRV(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "HRV",
    );

    log("debug", `[fitbitService] Fetching respiratory rate for ${userId}...`);
    const respiratoryRateData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchRespiratoryRate(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "respiratory rate",
    );

    log("debug", `[fitbitService] Fetching AZM for ${userId}...`);
    const azmData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchActiveZoneMinutes(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "AZM",
    );

    log("debug", `[fitbitService] Fetching activity minutes for ${userId}...`);
    const activityMinutesData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchActivityMinutes(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "activity minutes",
    );

    log("debug", `[fitbitService] Fetching sleep for ${userId}...`);
    const sleepData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchSleep(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "sleep",
    );

    log("debug", `[fitbitService] Fetching activities for ${userId}...`);
    const activitiesData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchActivities(
          userId,
          startDate,
          accessToken,
        ),
      "activities",
    );

    log("debug", `[fitbitService] Fetching water for ${userId}...`);
    const waterData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchWater(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "water",
    );

    log("debug", `[fitbitService] Fetching cardio fitness for ${userId}...`);
    const cardioFitnessData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchCardioFitnessScore(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "cardio fitness",
    );

    log("debug", `[fitbitService] Fetching core temperature for ${userId}...`);
    const coreTempData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchCoreTemperature(
          userId,
          startDate,
          endDate,
          accessToken,
        ),
      "core temperature",
    );

    // 3. Process all data sequentially
    log("debug", `[fitbitService] Processing fetched data for ${userId}...`);
    if (profileData)
      await fitbitDataProcessor.processFitbitProfile(
        userId,
        userId,
        profileData,
      );
    if (heartRateData)
      await fitbitDataProcessor.processFitbitHeartRate(
        userId,
        userId,
        heartRateData,
      );
    if (stepsData)
      await fitbitDataProcessor.processFitbitSteps(userId, userId, stepsData);
    if (weightData)
      await fitbitDataProcessor.processFitbitWeight(
        userId,
        userId,
        weightData,
        weightUnit,
      );
    if (bodyFatData)
      await fitbitDataProcessor.processFitbitBodyFat(
        userId,
        userId,
        bodyFatData,
      );
    if (spo2Data)
      await fitbitDataProcessor.processFitbitSpO2(userId, userId, spo2Data);
    if (tempData)
      await fitbitDataProcessor.processFitbitTemperature(
        userId,
        userId,
        tempData,
        temperatureUnit,
      );
    if (hrvData)
      await fitbitDataProcessor.processFitbitHRV(userId, userId, hrvData);
    if (respiratoryRateData)
      await fitbitDataProcessor.processFitbitRespiratoryRate(
        userId,
        userId,
        respiratoryRateData,
      );
    if (azmData)
      await fitbitDataProcessor.processFitbitActiveZoneMinutes(
        userId,
        userId,
        azmData,
      );
    if (activityMinutesData)
      await fitbitDataProcessor.processFitbitActivityMinutes(
        userId,
        userId,
        activityMinutesData,
      );
    if (sleepData)
      await fitbitDataProcessor.processFitbitSleep(
        userId,
        userId,
        sleepData,
        timezoneOffset,
      );
    if (activitiesData)
      await fitbitDataProcessor.processFitbitActivities(
        userId,
        userId,
        activitiesData,
        timezoneOffset,
        distanceUnit,
        startDate,
      );
    if (waterData)
      await fitbitDataProcessor.processFitbitWater(
        userId,
        userId,
        waterData,
        waterUnit,
      );
    if (cardioFitnessData)
      await fitbitDataProcessor.processFitbitCardioFitness(
        userId,
        userId,
        cardioFitnessData,
      );
    if (coreTempData)
      await fitbitDataProcessor.processFitbitCoreTemperature(
        userId,
        userId,
        coreTempData,
        temperatureUnit,
      );

    // 4. Update last_sync_at
    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'fitbit'`,
        [userId],
      );
    } finally {
      client.release();
    }

    log(
      "info",
      `[fitbitService] Full Fitbit sync completed for user ${userId}.`,
    );
    return { success: true, source: "live_api" };
  } catch (error) {
    log(
      "error",
      `[fitbitService] Error during full Fitbit sync for user ${userId}:`,
      error.message,
    );
    throw error;
  }
}

const getStatus = (userId) => fitbitIntegrationService.getStatus(userId);
const disconnectFitbit = (userId) =>
  fitbitIntegrationService.disconnectFitbit(userId);

module.exports = {
  syncFitbitData,
  getStatus,
  disconnectFitbit,
};
