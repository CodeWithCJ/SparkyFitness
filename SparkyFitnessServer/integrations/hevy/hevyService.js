// SparkyFitnessServer/integrations/hevy/hevyService.js

const axios = require('axios');
const { getClient, getSystemClient } = require('../../db/poolManager');
const { encrypt, decrypt, ENCRYPTION_KEY } = require('../../security/encryption');
const { log } = require('../../config/logging');
const hevyDataProcessor = require('./hevyDataProcessor');

const HEVY_API_BASE_URL = 'https://api.hevyapp.com';

/**
 * Get the Hevy API key for a user from the database.
 * @param {string} userId - The Sparky Fitness user ID.
 * @returns {Promise<string>} - The decrypted API key.
 */
async function getHevyApiKey(userId) {
    const client = await getSystemClient();
    try {
        const result = await client.query(
            `SELECT encrypted_app_key, app_key_iv, app_key_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'hevy'`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Hevy API key not found for user.');
        }

        const { encrypted_app_key, app_key_iv, app_key_tag } = result.rows[0];
        if (!encrypted_app_key) {
            throw new Error('Hevy API key is missing for user.');
        }

        return await decrypt(encrypted_app_key, app_key_iv, app_key_tag, ENCRYPTION_KEY);
    } finally {
        client.release();
    }
}

/**
 * Fetch user info from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @returns {Promise<Object>} - The Hevy user info.
 */
async function getUserInfo(userId) {
    const apiKey = await getHevyApiKey(userId);
    try {
        const response = await axios.get(`${HEVY_API_BASE_URL}/v1/user/info`, {
            headers: { 'api-key': apiKey }
        });
        return response.data;
    } catch (error) {
        log('error', `Error fetching Hevy user info for user ${userId}: ${error.message}`);
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
async function getWorkouts(userId, page = 1, pageSize = 10) {
    const apiKey = await getHevyApiKey(userId);
    try {
        const response = await axios.get(`${HEVY_API_BASE_URL}/v1/workouts`, {
            headers: { 'api-key': apiKey },
            params: { page, page_size: pageSize }
        });
        return response.data;
    } catch (error) {
        log('error', `Error fetching Hevy workouts for user ${userId}: ${error.message}`);
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
async function getExerciseTemplates(userId, page = 1, pageSize = 10) {
    const apiKey = await getHevyApiKey(userId);
    try {
        const response = await axios.get(`${HEVY_API_BASE_URL}/v1/exercise_templates`, {
            headers: { 'api-key': apiKey },
            params: { page, page_size: pageSize }
        });
        return response.data;
    } catch (error) {
        log('error', `Error fetching Hevy exercise templates for user ${userId}: ${error.message}`);
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
async function syncHevyData(userId, createdByUserId, fullSync = false) {
    log('info', `Starting Hevy ${fullSync ? 'FULL' : 'INCREMENTAL'} synchronization for user ${userId}...`);
    try {
        // 0. Sync user info (measurements)
        const userInfoData = await getUserInfo(userId);
        await hevyDataProcessor.processHevyUserInfo(userId, createdByUserId, userInfoData);

        let currentPage = 1;
        let totalProcessed = 0;
        let hasMore = true;
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        while (hasMore) {
            log('debug', `Fetching Hevy workouts page ${currentPage}...`);
            const workoutData = await getWorkouts(userId, currentPage, 20);
            const workouts = workoutData.workouts || [];
            const pageCount = workoutData.page_count || 1;

            if (workouts.length === 0) {
                hasMore = false;
                break;
            }

            // Process this page of workouts
            await hevyDataProcessor.processHevyWorkouts(userId, createdByUserId, workouts);
            totalProcessed += workouts.length;

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
                    log('debug', `Stopping incremental sync: workout date ${oldestTime.toISOString()} is older than 7 days.`);
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
                 WHERE user_id = $1 AND provider_type = 'hevy'`,
                [userId]
            );
        } finally {
            client.release();
        }

        log('info', `Hevy synchronization completed for user ${userId}. Total processed: ${totalProcessed}`);
        return { success: true, processedCount: totalProcessed };
    } catch (error) {
        log('error', `Hevy synchronization failed for user ${userId}: ${error.message}`);
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
            [userId]
        );

        if (result.rows.length === 0) {
            return { connected: false, lastSyncAt: null };
        }

        const { is_active, last_sync_at } = result.rows[0];
        return {
            connected: is_active,
            lastSyncAt: last_sync_at
        };
    } catch (error) {
        log('error', `Error getting Hevy status for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Disconnect Hevy integration for a user.
 * @param {string} userId - The Sparky Fitness user ID.
 * @returns {Promise<Object>} - The result of disconnection.
 */
async function disconnectHevy(userId) {
    const client = await getSystemClient();
    try {
        await client.query(
            `UPDATE external_data_providers
             SET is_active = FALSE, encrypted_app_key = NULL, app_key_iv = NULL, app_key_tag = NULL, updated_at = NOW()
             WHERE user_id = $1 AND provider_type = 'hevy'`,
            [userId]
        );
        log('info', `Hevy disconnected for user ${userId}.`);
        return { success: true };
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
    disconnectHevy
};
