// SparkyFitnessServer/services/withingsService.js

const { log } = require('../config/logging');
const withingsIntegrationService = require('../integrations/withings/withingsService');
const withingsDataProcessor = require('../integrations/withings/withingsDataProcessor');
const { getSystemClient } = require('../db/poolManager');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Configuration for data mocking/caching
const WITHINGS_DATA_SOURCE = process.env.SPARKY_FITNESS_WITHINGS_DATA_SOURCE || 'withings';
const SAVE_MOCK_DATA = process.env.SPARKY_FITNESS_SAVE_MOCK_DATA === 'true'; // Defaults to false
const MOCK_DATA_DIR = path.join(__dirname, '..', 'mock_data');

// Ensure mock_data directory exists
if (!fs.existsSync(MOCK_DATA_DIR)) {
    fs.mkdirSync(MOCK_DATA_DIR, { recursive: true });
    log('info', `[withingsService] Created mock_data directory at ${MOCK_DATA_DIR}`);
}

log('info', `[withingsService] Withings data source configured to: ${WITHINGS_DATA_SOURCE}`);

/**
 * Load data from a local JSON file in the mock_data directory
 * @param {string} filename - Name of the file to load
 * @returns {object|null} - Parsed JSON data or null if file doesn't exist
 */
function _loadFromLocalFile(filename) {
    const filepath = path.join(MOCK_DATA_DIR, filename);
    if (fs.existsSync(filepath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            log('info', `[withingsService] Data loaded from local file: ${filepath}`);
            return data;
        } catch (error) {
            log('error', `[withingsService] Error reading mock data file ${filepath}: ${error.message}`);
            return null;
        }
    }
    log('warn', `[withingsService] Local file not found: ${filepath}`);
    return null;
}

/**
 * Save data to a local JSON file in the mock_data directory atomically
 * @param {string} filename - Name of the file to save
 * @param {object} data - Data to save as JSON
 */
function _saveToLocalFile(filename, data) {
    const filepath = path.join(MOCK_DATA_DIR, filename);
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
        log('info', `[withingsService] Data saved to local file: ${filepath}`);
    } catch (error) {
        log('error', `[withingsService] Error saving to mock data file ${filepath}: ${error.message}`);
    }
}

/**
 * Orchestrate a full Withings data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 */
async function syncWithingsData(userId, syncType = 'manual') {
    const today = new Date();

    // Calculate dates for sync
    const endDateForYMD = new Date(today);
    endDateForYMD.setDate(today.getDate() + 1); // Tomorrow
    const startDateForYMD = new Date(today);
    startDateForYMD.setDate(today.getDate() - 7); // 7 days ago

    const startDateYMD = startDateForYMD.toISOString().split('T')[0];
    const endDateYMD = endDateForYMD.toISOString().split('T')[0];
    const startDateUnix = Math.floor(startDateForYMD.getTime() / 1000);
    const endDateUnix = Math.floor(today.getTime() / 1000);

    log('info', `[withingsService] Starting Withings sync (${syncType}) for user ${userId}. Loading from: ${WITHINGS_DATA_SOURCE}`);

    if (WITHINGS_DATA_SOURCE === 'local') {
        log('info', `[withingsService] Loading Withings data from local mock file for user ${userId}`);
        const mockData = _loadFromLocalFile('withings_mock_data.json');

        if (!mockData) {
            throw new Error(
                'Local Withings mock data file not found. Please run a sync with SPARKY_FITNESS_WITHINGS_DATA_SOURCE unset (or set to "withings") ' +
                'to fetch from live Withings API and automatically save the data for future local use.'
            );
        }

        log('info', `[withingsService] Successfully loaded mock data for user ${userId}. Sync date: ${mockData.sync_date || 'unknown'}`);

        try {
            const data = mockData.data || {};

            // Process all cached data
            if (data.measures) await withingsDataProcessor.processWithingsMeasures(userId, userId, data.measures);
            if (data.heart) await withingsDataProcessor.processWithingsHeartData(userId, userId, data.heart);
            if (data.sleep) await withingsDataProcessor.processWithingsSleepData(userId, userId, data.sleep);
            if (data.workouts) await withingsDataProcessor.processWithingsWorkouts(userId, userId, data.workouts);

            // Update last_sync_at in database
            const client = await getSystemClient();
            try {
                await client.query(
                    `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'withings'`,
                    [userId]
                );
            } finally {
                client.release();
            }

            log('info', `[withingsService] Withings sync from local cache completed for user ${userId}.`);
            return { success: true, source: 'local_cache', cached_date: mockData.sync_date };
        } catch (error) {
            log('error', `[withingsService] Error processing cached Withings data for user ${userId}:`, error.message);
            throw error;
        }
    }

    try {
        log('info', `[withingsService] Fetching live Withings data for user ${userId}`);

        // Fetch all data types
        const [measuresData, heartData, sleepData, workoutsData] = await Promise.all([
            withingsIntegrationService.fetchAndProcessMeasuresData(userId, userId, startDateUnix, endDateUnix),
            withingsIntegrationService.fetchAndProcessHeartData(userId, userId, startDateUnix, endDateUnix),
            withingsIntegrationService.fetchAndProcessSleepData(userId, userId, startDateUnix, endDateUnix),
            withingsIntegrationService.fetchAndProcessWorkoutsData(userId, userId, startDateYMD, endDateYMD)
        ]);

        // Note: individual functions already called the processor, but we return the data for mocking

        // Update last_sync_at (redundant if already updated, but safe)
        const client = await getSystemClient();
        try {
            await client.query(
                `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'withings'`,
                [userId]
            );
        } finally {
            client.release();
        }

        // Save fetched data to mock file
        const mockDataPayload = {
            user_id: userId,
            sync_date: moment().format('YYYY-MM-DD HH:mm:ss'),
            sync_type: syncType,
            start_date_unix: startDateUnix,
            end_date_unix: endDateUnix,
            start_date_ymd: startDateYMD,
            end_date_ymd: endDateYMD,
            data: {
                measures: measuresData,
                heart: heartData,
                sleep: sleepData,
                workouts: workoutsData
            }
        };

        if (SAVE_MOCK_DATA) {
            _saveToLocalFile('withings_mock_data.json', mockDataPayload);
        }

        log('info', `[withingsService] Full Withings live sync completed for user ${userId}.`);
        return { success: true, source: 'live_api' };
    } catch (error) {
        log('error', `[withingsService] Error during full Withings sync for user ${userId}:`, error.message);
        throw error;
    }
}

module.exports = {
    syncWithingsData
};
