// SparkyFitnessServer/services/fitbitService.js

const { log } = require('../config/logging');
const fitbitIntegrationService = require('../integrations/fitbit/fitbitService');
const fitbitDataProcessor = require('../integrations/fitbit/fitbitDataProcessor');
const { getSystemClient } = require('../db/poolManager');
const moment = require('moment');

/**
 * Orchestrate a full Fitbit data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 */
async function syncFitbitData(userId, syncType = 'manual') {
    let startDate, endDate;
    const today = moment();

    if (syncType === 'manual') {
        endDate = today.format('YYYY-MM-DD');
        startDate = today.clone().subtract(7, 'days').format('YYYY-MM-DD');
    } else if (syncType === 'scheduled') {
        endDate = today.format('YYYY-MM-DD');
        startDate = today.format('YYYY-MM-DD');
    } else {
        throw new Error("Invalid syncType. Must be 'manual' or 'scheduled'.");
    }

    log('info', `[fitbitService] Starting Fitbit sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}.`);

    try {
        // 1. Fetch token and Profile first to get unit preferences and timezone
        const accessToken = await fitbitIntegrationService.getValidAccessToken(userId);
        const profileData = await fitbitIntegrationService.fetchProfile(userId, accessToken);
        const timezoneOffset = profileData?.user?.offsetFromUTCMillis || 0;
        const weightUnit = profileData?.user?.weightUnit || 'METRIC';
        const distanceUnit = profileData?.user?.distanceUnit || 'METRIC';
        const waterUnit = profileData?.user?.waterUnit || 'METRIC';
        const temperatureUnit = profileData?.user?.temperatureUnit || 'METRIC';

        // 2. Fetch all other data sequentially to avoid 429 Resource Exhausted errors
        const safeFetch = async (fetchFn, name) => {
            try {
                // Add a small 1.5s delay between fetches to respect rate limits (429 prevention)
                await new Promise(resolve => setTimeout(resolve, 1500));
                return await fetchFn();
            } catch (error) {
                log('warn', `[fitbitService] Failed to fetch ${name} for user ${userId}: ${error.message}`);
                return null;
            }
        };

        log('debug', `[fitbitService] Fetching heart rate for ${userId}...`);
        const heartRateData = await safeFetch(() => fitbitIntegrationService.fetchHeartRate(userId, endDate, accessToken), 'heart rate');

        log('debug', `[fitbitService] Fetching steps for ${userId}...`);
        const stepsData = await safeFetch(() => fitbitIntegrationService.fetchSteps(userId, endDate, accessToken), 'steps');

        log('debug', `[fitbitService] Fetching weight for ${userId}...`);
        const weightData = await safeFetch(() => fitbitIntegrationService.fetchWeight(userId, startDate, endDate, accessToken), 'weight');

        log('debug', `[fitbitService] Fetching body fat for ${userId}...`);
        const bodyFatData = await safeFetch(() => fitbitIntegrationService.fetchBodyFat(userId, startDate, endDate, accessToken), 'body fat');

        log('debug', `[fitbitService] Fetching SpO2 for ${userId}...`);
        const spo2Data = await safeFetch(() => fitbitIntegrationService.fetchSpO2(userId, endDate, accessToken), 'SpO2');

        log('debug', `[fitbitService] Fetching temperature for ${userId}...`);
        const tempData = await safeFetch(() => fitbitIntegrationService.fetchTemperature(userId, endDate, accessToken), 'temperature');

        log('debug', `[fitbitService] Fetching HRV for ${userId}...`);
        const hrvData = await safeFetch(() => fitbitIntegrationService.fetchHRV(userId, endDate, accessToken), 'HRV');

        log('debug', `[fitbitService] Fetching respiratory rate for ${userId}...`);
        const respiratoryRateData = await safeFetch(() => fitbitIntegrationService.fetchRespiratoryRate(userId, endDate, accessToken), 'respiratory rate');

        log('debug', `[fitbitService] Fetching AZM for ${userId}...`);
        const azmData = await safeFetch(() => fitbitIntegrationService.fetchActiveZoneMinutes(userId, endDate, accessToken), 'AZM');

        log('debug', `[fitbitService] Fetching activity minutes for ${userId}...`);
        const activityMinutesData = await safeFetch(() => fitbitIntegrationService.fetchActivityMinutes(userId, endDate, accessToken), 'activity minutes');

        log('debug', `[fitbitService] Fetching sleep for ${userId}...`);
        const sleepData = await safeFetch(() => fitbitIntegrationService.fetchSleep(userId, startDate, endDate, accessToken), 'sleep');

        log('debug', `[fitbitService] Fetching activities for ${userId}...`);
        const activitiesData = await safeFetch(() => fitbitIntegrationService.fetchActivities(userId, startDate, accessToken), 'activities');

        log('debug', `[fitbitService] Fetching water for ${userId}...`);
        const waterData = await safeFetch(() => fitbitIntegrationService.fetchWater(userId, endDate, accessToken), 'water');

        // 3. Process all data sequentially
        log('debug', `[fitbitService] Processing fetched data for ${userId}...`);
        if (profileData) await fitbitDataProcessor.processFitbitProfile(userId, userId, profileData);
        if (heartRateData) await fitbitDataProcessor.processFitbitHeartRate(userId, userId, heartRateData);
        if (stepsData) await fitbitDataProcessor.processFitbitSteps(userId, userId, stepsData);
        if (weightData) await fitbitDataProcessor.processFitbitWeight(userId, userId, weightData, weightUnit);
        if (bodyFatData) await fitbitDataProcessor.processFitbitBodyFat(userId, userId, bodyFatData);
        if (spo2Data) await fitbitDataProcessor.processFitbitSpO2(userId, userId, spo2Data);
        if (tempData) await fitbitDataProcessor.processFitbitTemperature(userId, userId, tempData, temperatureUnit);
        if (hrvData) await fitbitDataProcessor.processFitbitHRV(userId, userId, hrvData);
        if (respiratoryRateData) await fitbitDataProcessor.processFitbitRespiratoryRate(userId, userId, respiratoryRateData);
        if (azmData) await fitbitDataProcessor.processFitbitActiveZoneMinutes(userId, userId, azmData);
        if (activityMinutesData) await fitbitDataProcessor.processFitbitActivityMinutes(userId, userId, activityMinutesData);
        if (sleepData) await fitbitDataProcessor.processFitbitSleep(userId, userId, sleepData, timezoneOffset);
        if (activitiesData) await fitbitDataProcessor.processFitbitActivities(userId, userId, activitiesData, timezoneOffset, distanceUnit, startDate);
        if (waterData) await fitbitDataProcessor.processFitbitWater(userId, userId, waterData, waterUnit);

        // 4. Update last_sync_at
        const client = await getSystemClient();
        try {
            await client.query(
                `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'fitbit'`,
                [userId]
            );
        } finally {
            client.release();
        }

        log('info', `[fitbitService] Full Fitbit sync completed for user ${userId}.`);
        return { success: true };
    } catch (error) {
        log('error', `[fitbitService] Error during full Fitbit sync for user ${userId}:`, error.message);
        throw error;
    }
}

const getStatus = (userId) => fitbitIntegrationService.getStatus(userId);
const disconnectFitbit = (userId) => fitbitIntegrationService.disconnectFitbit(userId);

module.exports = {
    syncFitbitData,
    getStatus,
    disconnectFitbit
};
