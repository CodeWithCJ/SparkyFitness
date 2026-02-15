// SparkyFitnessServer/services/polarService.js

const { log } = require('../config/logging');
const polarIntegrationService = require('../integrations/polar/polarService');
const polarDataProcessor = require('../integrations/polar/polarDataProcessor');
const { getSystemClient } = require('../db/poolManager');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Configuration for data mocking/caching
const POLAR_DATA_SOURCE = process.env.SPARKY_FITNESS_POLAR_DATA_SOURCE || 'polar';
const SAVE_MOCK_DATA = process.env.SPARKY_FITNESS_SAVE_MOCK_DATA === 'true'; // Defaults to false
const MOCK_DATA_DIR = path.join(__dirname, '..', 'mock_data');

// Ensure mock_data directory exists
if (!fs.existsSync(MOCK_DATA_DIR)) {
    fs.mkdirSync(MOCK_DATA_DIR, { recursive: true });
    log('info', `[polarService] Created mock_data directory at ${MOCK_DATA_DIR}`);
}

log('info', `[polarService] Polar data source configured to: ${POLAR_DATA_SOURCE}`);

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
            log('info', `[polarService] Data loaded from local file: ${filepath}`);
            return data;
        } catch (error) {
            log('error', `[polarService] Error reading mock data file ${filepath}: ${error.message}`);
            return null;
        }
    }
    log('warn', `[polarService] Local file not found: ${filepath}`);
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
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
        log('info', `[polarService] Data saved to local file: ${filepath}`);
    } catch (error) {
        log('error', `[polarService] Error saving to mock data file ${filepath}: ${error.message}`);
    }
}

/**
 * Orchestrate a full Polar data sync for a user
 * @param {number} userId - The ID of the user to sync data for
 * @param {string} syncType - 'manual' or 'scheduled'
 */
async function syncPolarData(userId, syncType = 'manual', providerId) {
    log('info', `[polarService] Starting Polar sync (${syncType}) for user ${userId}${providerId ? ` (Provider ID: ${providerId})` : ''}. ENV_SAVE_MOCK_DATA=${process.env.SPARKY_FITNESS_SAVE_MOCK_DATA}`);

    // Check if we should load from local mock data
    if (POLAR_DATA_SOURCE === 'local') {
        log('info', `[polarService] Loading Polar data from local mock file for user ${userId}`);
        const mockData = _loadFromLocalFile('polar_mock_data.json');

        if (!mockData) {
            throw new Error(
                'Local mock data file not found. Please run a sync with SPARKY_FITNESS_POLAR_DATA_SOURCE unset (or set to "polar") ' +
                'to fetch from live Polar API and automatically save the data for future local use.'
            );
        }

        log('info', `[polarService] Successfully loaded mock data for user ${userId}. Sync date: ${mockData.sync_date || 'unknown'}`);

        const cachedData = mockData.data || {};

        try {
            // Process cached data
            log('debug', `[polarService] Processing cached data for ${userId}...`);
            if (cachedData.physicalInfo) {
                await polarDataProcessor.processPolarPhysicalInfo(userId, userId, cachedData.physicalInfo);
            }
            if (cachedData.exercises) {
                await polarDataProcessor.processPolarExercises(userId, userId, cachedData.exercises);
            }
            if (cachedData.activities) {
                await polarDataProcessor.processPolarActivity(userId, userId, cachedData.activities);
            }
            if (cachedData.sleep) {
                await polarDataProcessor.processPolarSleep(userId, userId, cachedData.sleep);
            }
            if (cachedData.nightlyRecharge) {
                await polarDataProcessor.processPolarNightlyRecharge(userId, userId, cachedData.nightlyRecharge);
            }

            // Update last_sync_at
            const client = await getSystemClient();
            try {
                const updateQuery = providerId
                    ? { text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE id = $1 AND user_id = $2`, values: [providerId, userId] }
                    : { text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'polar'`, values: [userId] };

                await client.query(updateQuery.text, updateQuery.values);
            } finally {
                client.release();
            }

            log('info', `[polarService] Polar sync from local cache completed for user ${userId}.`);
            return { success: true, source: 'local_cache', cached_date: mockData.sync_date };
        } catch (error) {
            log('error', `[polarService] Error processing cached Polar data for user ${userId}:`, error.message);
            throw error;
        }
    }

    try {
        log('info', `[polarService] Fetching live Polar data for user ${userId}`);

        // Get access token and external user ID
        const { accessToken, externalUserId } = await polarIntegrationService.getValidAccessToken(userId, providerId);

        // Fetch data
        // Fetch data
        const physicalInfo = await polarIntegrationService.fetchPhysicalInfo(userId, externalUserId, accessToken);

        // Transactional fetch for Exercises and Daily Activity
        const newExercises = await polarIntegrationService.fetchExercises(userId, externalUserId, accessToken);
        const newActivities = await polarIntegrationService.fetchDailyActivity(userId, externalUserId, accessToken);

        let allExercises = [...newExercises];
        let allActivities = [...newActivities];

        // If manual sync, also fetch recent history (List API) to fill gaps
        if (syncType === 'manual') {
            log('info', `[polarService] Manual sync requested. Fetching recent history (List API) for user ${userId}.`);

            const recentExercises = await polarIntegrationService.fetchRecentExercises(userId, accessToken);
            if (recentExercises.length > 0) {
                // Deduplicate based on 'id' if possible, or just concat and let processor handle
                // Processor uses start_time to delete duplicates for that day, so it should be safe.
                allExercises = [...allExercises, ...recentExercises];
            }

            const recentActivities = await polarIntegrationService.fetchRecentDailyActivity(userId, accessToken);
            if (recentActivities.length > 0) {
                allActivities = [...allActivities, ...recentActivities];
            }

            // Also fetch User Profile to get current weight/height if we missed the transaction
            const userProfile = await polarIntegrationService.fetchUserProfile(userId, externalUserId, accessToken);
            if (userProfile && (physicalInfo || []).length === 0) {
                // Synthesize a physical info object from the profile
                // Profile has: weight, height, registration-date
                // We'll use "today" as the date for the check-in if we don't have a better one? 
                // Or maybe the registration date? 
                // Using current date is better for "current weight".
                // But let's check if the values are non-zero.
                if (userProfile.weight || userProfile.height) {
                    const synthesizedInfo = {
                        weight: userProfile.weight,
                        height: userProfile.height,
                        created: new Date().toISOString() // Treat as current/today
                    };
                    physicalInfo.push(synthesizedInfo);
                    log('info', `[polarService] Added current user profile weight/height to physical info processing.`);
                }
            }
        }

        // Fetch Sleep and Nightly Recharge (non-transactional, but we pull recent data)
        const newSleep = await polarIntegrationService.fetchRecentSleepData(userId, accessToken);
        const newRecharge = await polarIntegrationService.fetchRecentNightlyRecharge(userId, accessToken);

        // Remove duplicates from arrays before processing?
        // Simple distinct by ID for exercises:
        allExercises = Array.from(new Map(allExercises.map(ex => [ex.id, ex])).values());
        // Simple distinct by date for activities:
        allActivities = Array.from(new Map(allActivities.map(act => [act.date, act])).values());

        // Process data
        if (physicalInfo && physicalInfo.length > 0) {
            await polarDataProcessor.processPolarPhysicalInfo(userId, userId, physicalInfo);
        }

        if (allExercises && allExercises.length > 0) {
            await polarDataProcessor.processPolarExercises(userId, userId, allExercises);
        } else {
            log('info', `[polarService] No Polar exercise data (transaction or recent list) found for user ${userId}.`);
        }

        if (allActivities && allActivities.length > 0) {
            await polarDataProcessor.processPolarActivity(userId, userId, allActivities);
        }

        if (newSleep && newSleep.length > 0) {
            await polarDataProcessor.processPolarSleep(userId, userId, newSleep);
        }

        if (newRecharge && newRecharge.length > 0) {
            await polarDataProcessor.processPolarNightlyRecharge(userId, userId, newRecharge);
        }

        // Update last_sync_at
        const client = await getSystemClient();
        try {
            const updateQuery = providerId
                ? { text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE id = $1 AND user_id = $2`, values: [providerId, userId] }
                : { text: `UPDATE external_data_providers SET last_sync_at = NOW() WHERE user_id = $1 AND provider_type = 'polar'`, values: [userId] };

            await client.query(updateQuery.text, updateQuery.values);
        } finally {
            client.release();
        }

        // Save mock data if enabled
        const mockDataPayload = {
            user_id: userId,
            sync_date: moment().format('YYYY-MM-DD HH:mm:ss'),
            sync_type: syncType,
            data: {
                physicalInfo: physicalInfo,
                exercises: allExercises,
                activities: allActivities,
                sleep: newSleep,
                nightlyRecharge: newRecharge
            }
        };

        if (SAVE_MOCK_DATA) {
            _saveToLocalFile('polar_mock_data.json', mockDataPayload);
        }

        log('info', `[polarService] Full Polar live sync completed for user ${userId}.`);
        return { success: true, source: 'live_api' };
    } catch (error) {
        log('error', `[polarService] Error during full Polar sync for user ${userId}:`, error.message);
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
    disconnectPolar
};
