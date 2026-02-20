// SparkyFitnessServer/services/fitbitService.js

const { log } = require("../config/logging");
const fitbitIntegrationService = require("../integrations/fitbit/fitbitService");
const fitbitDataProcessor = require("../integrations/fitbit/fitbitDataProcessor");
const { getSystemClient } = require("../db/poolManager");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

// Configuration for data mocking/caching
const FITBIT_DATA_SOURCE =
  process.env.SPARKY_FITNESS_FITBIT_DATA_SOURCE || "fitbit";
const SAVE_MOCK_DATA = process.env.SPARKY_FITNESS_SAVE_MOCK_DATA === "true"; // Defaults to false
const MOCK_DATA_DIR = path.join(__dirname, "..", "mock_data");

// Ensure mock_data directory exists
if (!fs.existsSync(MOCK_DATA_DIR)) {
  fs.mkdirSync(MOCK_DATA_DIR, { recursive: true });
  log(
    "info",
    `[fitbitService] Created mock_data directory at ${MOCK_DATA_DIR}`,
  );
}

log(
  "info",
  `[fitbitService] Fitbit data source configured to: ${FITBIT_DATA_SOURCE}`,
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
      log("info", `[fitbitService] Data loaded from local file: ${filepath}`);
      return data;
    } catch (error) {
      log(
        "error",
        `[fitbitService] Error reading mock data file ${filepath}: ${error.message}`,
      );
      return null;
    }
  }
  log("warn", `[fitbitService] Local file not found: ${filepath}`);
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
    log("info", `[fitbitService] Data saved to local file: ${filepath}`);
  } catch (error) {
    log(
      "error",
      `[fitbitService] Error saving to mock data file ${filepath}: ${error.message}`,
    );
  }
}

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

  // Check if we should load from local mock data
  if (FITBIT_DATA_SOURCE === "local") {
    log(
      "info",
      `[fitbitService] Loading Fitbit data from local mock file for user ${userId}`,
    );
    const mockData = _loadFromLocalFile("fitbit_mock_data.json");

    if (!mockData) {
      throw new Error(
        'Local mock data file not found. Please run a sync with SPARKY_FITNESS_FITBIT_DATA_SOURCE unset (or set to "fitbit") ' +
          "to fetch from live Fitbit API and automatically save the data for future local use.",
      );
    }

    log(
      "info",
      `[fitbitService] Successfully loaded mock data for user ${userId}. Sync date: ${mockData.sync_date || "unknown"}`,
    );

    // Extract cached data and units
    const cachedData = mockData.data || {};
    const units = mockData.units || {};
    const timezoneOffset = mockData.timezone_offset || 0;

    try {
      // Process all cached data through the same processors as live data
      log("debug", `[fitbitService] Processing cached data for ${userId}...`);
      if (cachedData.profile)
        await fitbitDataProcessor.processFitbitProfile(
          userId,
          userId,
          cachedData.profile,
        );
      if (cachedData.heartRate)
        await fitbitDataProcessor.processFitbitHeartRate(
          userId,
          userId,
          cachedData.heartRate,
        );
      if (cachedData.steps)
        await fitbitDataProcessor.processFitbitSteps(
          userId,
          userId,
          cachedData.steps,
        );
      if (cachedData.weight)
        await fitbitDataProcessor.processFitbitWeight(
          userId,
          userId,
          cachedData.weight,
          units.weight || "METRIC",
        );
      if (cachedData.bodyFat)
        await fitbitDataProcessor.processFitbitBodyFat(
          userId,
          userId,
          cachedData.bodyFat,
        );
      if (cachedData.spo2)
        await fitbitDataProcessor.processFitbitSpO2(
          userId,
          userId,
          cachedData.spo2,
        );
      if (cachedData.temperature)
        await fitbitDataProcessor.processFitbitTemperature(
          userId,
          userId,
          cachedData.temperature,
          units.temperature || "METRIC",
        );
      if (cachedData.hrv)
        await fitbitDataProcessor.processFitbitHRV(
          userId,
          userId,
          cachedData.hrv,
        );
      if (cachedData.respiratoryRate)
        await fitbitDataProcessor.processFitbitRespiratoryRate(
          userId,
          userId,
          cachedData.respiratoryRate,
        );
      if (cachedData.activeZoneMinutes)
        await fitbitDataProcessor.processFitbitActiveZoneMinutes(
          userId,
          userId,
          cachedData.activeZoneMinutes,
        );
      if (cachedData.activityMinutes)
        await fitbitDataProcessor.processFitbitActivityMinutes(
          userId,
          userId,
          cachedData.activityMinutes,
        );
      if (cachedData.sleep)
        await fitbitDataProcessor.processFitbitSleep(
          userId,
          userId,
          cachedData.sleep,
          timezoneOffset,
        );
      if (cachedData.activities)
        await fitbitDataProcessor.processFitbitActivities(
          userId,
          userId,
          cachedData.activities,
          timezoneOffset,
          units.distance || "METRIC",
          startDate,
        );
      if (cachedData.water)
        await fitbitDataProcessor.processFitbitWater(
          userId,
          userId,
          cachedData.water,
          units.water || "METRIC",
        );
      if (cachedData.cardioFitness)
        await fitbitDataProcessor.processFitbitCardioFitness(
          userId,
          userId,
          cachedData.cardioFitness,
        );
      if (cachedData.coreTemperature)
        await fitbitDataProcessor.processFitbitCoreTemperature(
          userId,
          userId,
          cachedData.coreTemperature,
          units.temperature || "METRIC",
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
        `[fitbitService] Fitbit sync from local cache completed for user ${userId}.`,
      );
      return {
        success: true,
        source: "local_cache",
        cached_date: mockData.sync_date,
      };
    } catch (error) {
      log(
        "error",
        `[fitbitService] Error processing cached Fitbit data for user ${userId}:`,
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
        fitbitIntegrationService.fetchHeartRate(userId, endDate, accessToken),
      "heart rate",
    );

    log("debug", `[fitbitService] Fetching steps for ${userId}...`);
    const stepsData = await safeFetch(
      () => fitbitIntegrationService.fetchSteps(userId, endDate, accessToken),
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
      () => fitbitIntegrationService.fetchSpO2(userId, endDate, accessToken),
      "SpO2",
    );

    log("debug", `[fitbitService] Fetching temperature for ${userId}...`);
    const tempData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchTemperature(userId, endDate, accessToken),
      "temperature",
    );

    log("debug", `[fitbitService] Fetching HRV for ${userId}...`);
    const hrvData = await safeFetch(
      () => fitbitIntegrationService.fetchHRV(userId, endDate, accessToken),
      "HRV",
    );

    log("debug", `[fitbitService] Fetching respiratory rate for ${userId}...`);
    const respiratoryRateData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchRespiratoryRate(
          userId,
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
      () => fitbitIntegrationService.fetchWater(userId, endDate, accessToken),
      "water",
    );

    log("debug", `[fitbitService] Fetching cardio fitness for ${userId}...`);
    const cardioFitnessData = await safeFetch(
      () =>
        fitbitIntegrationService.fetchCardioFitnessScore(
          userId,
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

    // 5. Save all fetched data to mock file for future local use
    const mockDataPayload = {
      user_id: userId,
      sync_date: moment().format("YYYY-MM-DD HH:mm:ss"),
      sync_type: syncType,
      start_date: startDate,
      end_date: endDate,
      data: {
        profile: profileData,
        heartRate: heartRateData,
        steps: stepsData,
        weight: weightData,
        bodyFat: bodyFatData,
        spo2: spo2Data,
        temperature: tempData,
        hrv: hrvData,
        respiratoryRate: respiratoryRateData,
        activeZoneMinutes: azmData,
        activityMinutes: activityMinutesData,
        sleep: sleepData,
        activities: activitiesData,
        water: waterData,
        cardioFitness: cardioFitnessData,
        coreTemperature: coreTempData,
      },
      units: {
        weight: weightUnit,
        distance: distanceUnit,
        water: waterUnit,
        temperature: temperatureUnit,
      },
      timezone_offset: timezoneOffset,
    };

    if (SAVE_MOCK_DATA) {
      _saveToLocalFile("fitbit_mock_data.json", mockDataPayload);
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
