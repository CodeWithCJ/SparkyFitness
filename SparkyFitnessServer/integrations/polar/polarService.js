// SparkyFitnessServer/integrations/polar/polarService.js

const axios = require('axios');
const { getClient, getSystemClient } = require('../../db/poolManager');
const { encrypt, decrypt, ENCRYPTION_KEY } = require('../../security/encryption');
const { log } = require('../../config/logging');
const polarDataProcessor = require('./polarDataProcessor');

const POLAR_AUTH_URL = 'https://flow.polar.com/oauth2/authorization';
const POLAR_TOKEN_URL = 'https://polarremote.com/v2/oauth2/token';
const POLAR_API_BASE_URL = 'https://www.polaraccesslink.com/v3';

/**
 * Construct the Polar authorization URL.
 */
async function getAuthorizationUrl(userId, redirectUri) {
    const client = await getSystemClient();
    try {
        const result = await client.query(
            `SELECT encrypted_app_id, app_id_iv, app_id_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'polar'`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Polar client credentials not found for user.');
        }

        const { encrypted_app_id, app_id_iv, app_id_tag } = result.rows[0];
        const clientId = await decrypt(encrypted_app_id, app_id_iv, app_id_tag, ENCRYPTION_KEY);

        const scope = 'accesslink.read_all';
        const state = userId;

        return `${POLAR_AUTH_URL}?response_type=code&client_id=${clientId}&scope=${scope}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    } finally {
        client.release();
    }
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCodeForTokens(userId, code, redirectUri) {
    const client = await getSystemClient();
    try {
        const providerResult = await client.query(
            `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'polar'`,
            [userId]
        );

        if (providerResult.rows.length === 0) {
            throw new Error('Polar client credentials not found for user.');
        }

        const { encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag } = providerResult.rows[0];
        const clientId = await decrypt(encrypted_app_id, app_id_iv, app_id_tag, ENCRYPTION_KEY);
        const clientSecret = await decrypt(encrypted_app_key, app_key_iv, app_key_tag, ENCRYPTION_KEY);

        const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await axios.post(POLAR_TOKEN_URL, `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`, {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });

        const { access_token, expires_in, x_user_id } = response.data;

        const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);

        await client.query(
            `UPDATE external_data_providers
             SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
                 token_expires_at = $4, external_user_id = $5, is_active = TRUE, updated_at = NOW()
             WHERE user_id = $6 AND provider_type = 'polar'`,
            [
                encryptedAccessToken.encryptedText, encryptedAccessToken.iv, encryptedAccessToken.tag,
                new Date(Date.now() + (expires_in || 0) * 1000), x_user_id, userId
            ]
        );

        // Polar AccessLink. Check if user is already registered.
        try {
            // Try to fetch user info first. If this succeeds, the user is already registered.
            await axios.get(`${POLAR_API_BASE_URL}/users/${x_user_id}`, {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Accept': 'application/json'
                }
            });
            log('info', `User ${userId} (Polar ID: ${x_user_id}) is already registered with Polar AccessLink.`);
        } catch (getError) {
            // If 404 or 403 (unauthorized might mean not registered yet?), proceed to register
            // Note: Docs say 204 No Content if not found, or 404? 
            // Docs say: "204 No Content when user with given userId is not found."
            // But getting a 401/403 here might mean the token is valid but user not linked?

            log('info', `User ${x_user_id} lookup status: ${getError.response ? getError.response.status : getError.message}. Proceeding to registration.`);

            const inputBody = `<register><member-id>${userId}</member-id></register>`;
            try {
                await axios.post(`${POLAR_API_BASE_URL}/users`, inputBody, {
                    headers: {
                        'Authorization': `Bearer ${access_token}`,
                        'Content-Type': 'application/xml',
                        'Accept': 'application/json'
                    }
                });
                log('info', `Successfully registered user ${userId} with Polar AccessLink.`);
            } catch (regError) {
                if (regError.response && regError.response.status === 409) {
                    log('info', `User ${userId} already registered with Polar AccessLink (Conflict).`);
                } else if (regError.response && regError.response.status === 401) {
                    // Log details about 401 which is the current issue
                    log('error', `401 Unauthorized during Polar Registration. Body: ${JSON.stringify(regError.response.data)}`);
                    // If we got a 401 here, maybe the token is bad? But we just got it.
                    // It is possible that V3 access requires a different flow?
                    // For now, re-throw, but after logging.
                    throw regError;
                } else {
                    log('error', `Error registering user ${userId} with Polar AccessLink: ${regError.message} - ${JSON.stringify(regError.response?.data)}`);
                    throw regError;
                }
            }
        }

        return { success: true, externalUserId: x_user_id };
    } catch (error) {
        log('error', `Error exchanging Polar code for tokens: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Check for available notifications (Basic Auth).
 * Lists users who have new data available.
 */
async function checkNotifications(userId) {
    const client = await getSystemClient();
    try {
        const result = await client.query(
            `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag, external_user_id
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'polar'`,
            [userId]
        );

        if (result.rows.length === 0) {
            log('warn', `[Polar] Credentials not found for user ${userId} when checking notifications.`);
            return null;
        }

        const { encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag, external_user_id } = result.rows[0];
        const clientId = await decrypt(encrypted_app_id, app_id_iv, app_id_tag, ENCRYPTION_KEY);
        const clientSecret = await decrypt(encrypted_app_key, app_key_iv, app_key_tag, ENCRYPTION_KEY);

        const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        log('info', `Checking Polar notifications for user ${userId} (Polar ID: ${external_user_id})...`);
        const response = await axios.get(`${POLAR_API_BASE_URL}/notifications`, {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Accept': 'application/json'
            }
        });

        // Response: { "available-user-data": [ { "user-id": 123, "data-type": "EXERCISE", ... } ] }
        const availableData = response.data['available-user-data'] || [];
        log('info', `[Polar] Notifications found: ${availableData.length}.`);

        // Filter for our user
        // external_user_id is stored as string in DB but might be number in API response?
        const userNotifications = availableData.filter(n => String(n['user-id']) === String(external_user_id));

        if (userNotifications.length > 0) {
            log('info', `[Polar] Found ${userNotifications.length} pending notifications for this user: ${JSON.stringify(userNotifications)}`);
        } else {
            log('info', `[Polar] No pending notifications found specifically for this user.`);
        }

        return userNotifications;
    } catch (error) {
        log('error', `Error checking Polar notifications for user ${userId}: ${error.message}`);
        return null; // Don't throw, just log
    } finally {
        client.release();
    }
}

/**
 * Get a valid access token and external user ID.
 */
async function getValidAccessToken(userId) {
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT encrypted_access_token, access_token_iv, access_token_tag, token_expires_at, external_user_id
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'polar'`,
            [userId]
        );

        if (providerResult.rows.length === 0) {
            throw new Error('Polar provider not configured for user.');
        }

        const { encrypted_access_token, access_token_iv, access_token_tag, external_user_id } = providerResult.rows[0];
        const accessToken = await decrypt(encrypted_access_token, access_token_iv, access_token_tag, ENCRYPTION_KEY);

        // Note: Polar AccessLink access tokens are valid for life unless revoked.
        return { accessToken, externalUserId: external_user_id };
    } finally {
        client.release();
    }
}

/**
 * Create a transaction for a specific resource type.
 */
async function createTransaction(userId, externalUserId, accessToken, type) {
    try {
        // type is 'exercise' or 'physical-information'
        const response = await axios.post(`${POLAR_API_BASE_URL}/users/${externalUserId}/${type}-transactions`, {}, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });
        return response.data; // Contains resource url list (e.g. "exercises": [...]) and "resource-uri" etc.
    } catch (error) {
        if (error.response && error.response.status === 204) {
            // No content = no new data
            log('info', `No new Polar ${type} data available for user ${userId}.`);
            return null;
        }
        log('error', `Error creating Polar transaction (${type}) for user ${userId}: ${error.message}`);
        throw error;
    }
}

/**
 * Commit a transaction.
 */
async function commitTransaction(userId, externalUserId, accessToken, transactionId, type) {
    try {
        await axios.put(`${POLAR_API_BASE_URL}/users/${externalUserId}/${type}-transactions/${transactionId}`, {}, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        return true;
    } catch (error) {
        log('error', `Error committing Polar transaction (${type}:${transactionId}) for user ${userId}: ${error.message}`);
        return false;
    }
}

/**
 * Fetch Polar Physical Info.
 */
async function fetchPhysicalInfo(userId, externalUserId, accessToken) {
    try {
        // 1. Create Transaction
        const transaction = await createTransaction(userId, externalUserId, accessToken, 'physical-information');
        if (!transaction) return [];

        const transactionId = transaction['transaction-id'];
        const resourceUrls = transaction['physical-informations'] || [];
        const results = [];

        // 2. Fetch Data
        for (const url of resourceUrls) {
            try {
                const response = await axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
                });
                results.push(response.data);
            } catch (err) {
                log('error', `Error fetching physical info resource ${url}: ${err.message}`);
            }
        }

        // 3. Commit Transaction
        if (transactionId) {
            await commitTransaction(userId, externalUserId, accessToken, transactionId, 'physical-information');
        }

        return results;
    } catch (error) {
        log('error', `Error fetching Polar physical info for user ${userId}: ${error.message}`);
        // Return empty array to allow other fetches to proceed
        return [];
    }
}

/**
 * Fetch Polar Exercises.
 */
async function fetchExercises(userId, externalUserId, accessToken) {
    try {
        // 1. Create Transaction
        const transaction = await createTransaction(userId, externalUserId, accessToken, 'exercise');
        if (!transaction) return [];

        const transactionId = transaction['transaction-id'];
        const resourceUrls = transaction['exercises'] || [];
        const results = [];

        // 2. Fetch Data
        for (const url of resourceUrls) {
            try {
                const response = await axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
                });
                // Note: Can also fetch samples/zones here if needed, usually passed as query params?
                // The URL from transaction is the direct resource link.
                // Docs say: "Use samples and zones query parameters to return optional samples and zone information"
                // But the transaction URL might already include them? No, usually base resource.
                // We'll trust the direct Get for now. We might need to append ?samples=true&zones=true if the transaction URL doesn't include it.
                // Standard Polar practice is to append params if we want details.
                // But let's start basic.
                results.push(response.data);
            } catch (err) {
                log('error', `Error fetching exercise resource ${url}: ${err.message}`);
            }
        }

        // 3. Commit Transaction
        if (transactionId) {
            await commitTransaction(userId, externalUserId, accessToken, transactionId, 'exercise');
        }

        return results;
    } catch (error) {
        log('error', `Error fetching Polar exercises for user ${userId}: ${error.message}`);
        return [];
    }
}

/**
 * Fetch recent exercises using the List API (last 30 days).
 * Use this for initial sync or manual sync to get data even if no new notification exists.
 */
async function fetchRecentExercises(userId, accessToken) {
    try {
        log('info', `Fetching recent Polar exercises (List API) for user ${userId}...`);
        // Use samples=true and zones=true to get full details
        const response = await axios.get(`${POLAR_API_BASE_URL}/exercises?samples=true&zones=true`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });

        const exercises = response.data || [];
        log('info', `Fetched ${exercises.length} recent exercises (List API) for user ${userId}.`);
        return exercises;
    } catch (error) {
        log('error', `Error fetching recent Polar exercises (List API) for user ${userId}: ${error.message}`);
        return [];
    }
}

/**
 * Fetch new Daily Activity data (steps, calories) using Transaction API.
 */
async function fetchDailyActivity(userId, externalUserId, accessToken) {
    try {
        // 1. Create Transaction
        const transaction = await createTransaction(userId, externalUserId, accessToken, 'activity');
        if (!transaction) return [];

        const transactionId = transaction['transaction-id'];
        const resourceUrls = transaction['activity-log'] || []; // Check key in docs: 'activity-log' usually? 
        // Docs for 'activity-transactions' response say:
        // "resource-uri": "...", "user-id": ..., "transaction-id": ..., "activity-log": ["url1", "url2"]

        const results = [];

        // 2. Fetch Data
        for (const url of resourceUrls) {
            try {
                const response = await axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
                });
                results.push(response.data);
            } catch (err) {
                log('error', `Error fetching daily activity resource ${url}: ${err.message}`);
            }
        }

        // 3. Commit Transaction
        if (transactionId) {
            await commitTransaction(userId, externalUserId, accessToken, transactionId, 'activity');
        }

        return results;
    } catch (error) {
        // If 204 or expected error, handled in createTransaction or here
        if (error.response && error.response.status === 204) {
            return [];
        }
        log('error', `Error fetching Polar daily activity (Transaction) for user ${userId}: ${error.message}`);
        // Return empty array to allow other fetches to proceed
        return [];
    }
}

/**
 * Fetch recent Daily Activity data using List API (last 28 days).
 */
async function fetchRecentDailyActivity(userId, accessToken) {
    try {
        log('info', `Fetching recent Polar daily activity (List API) for user ${userId}...`);

        // Calculate date range: Last 28 days (max allowed by API)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 28);

        const to = endDate.toISOString().split('T')[0];
        const from = startDate.toISOString().split('T')[0];

        log('debug', `Requesting Polar activity from ${from} to ${to}`);

        const response = await axios.get(`${POLAR_API_BASE_URL}/users/activities/?from=${from}&to=${to}`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });

        const activities = response.data || [];
        log('info', `Fetched ${activities.length} days of recent daily activity (List API) for user ${userId}.`);
        return activities;
    } catch (error) {
        log('error', `Error fetching recent Polar daily activity (List API) for user ${userId}: ${error.message}`);
        return [];
    }
}

/**
 * Fetch Polar User Profile (for weight/height).
 */
async function fetchUserProfile(userId, externalUserId, accessToken) {
    try {
        log('info', `Fetching Polar user profile for user ${userId} (Polar ID: ${externalUserId})...`);
        const response = await axios.get(`${POLAR_API_BASE_URL}/users/${externalUserId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });
        return response.data;
    } catch (error) {
        log('error', `Error fetching Polar user profile for user ${userId}: ${error.message}`);
        return null;
    }
}

/**
 * Fetch and process Polar data.
 * @deprecated Use services/polarService.js for orchestration and mock data support.
 */
async function fetchAndProcessPolarData(userId, createdByUserId) {
    log('warn', '[polarIntegrationService] fetchAndProcessPolarData is deprecated. Use services/polarService.js instead.');
    const accessToken = await getValidAccessToken(userId);

    const physicalInfo = await fetchPhysicalInfo(userId, accessToken);
    if (physicalInfo) {
        await polarDataProcessor.processPolarPhysicalInfo(userId, createdByUserId, physicalInfo);
    }

    const exercises = await fetchExercises(userId, accessToken);
    if (exercises) {
        await polarDataProcessor.processPolarExercises(userId, createdByUserId, exercises);
    }

    return { success: true };
}

/**
 * Disconnect Polar account.
 */
async function disconnectPolar(userId) {
    const client = await getClient(userId);
    try {
        const accessToken = await getValidAccessToken(userId);

        // Revoke with Polar if possible (Polar AccessLink V3/OAuth2 typically uses revocation)
        // For now, we clear our database.

        await client.query(
            `UPDATE external_data_providers
             SET encrypted_access_token = NULL, access_token_iv = NULL, access_token_tag = NULL,
                 token_expires_at = NULL, external_user_id = NULL, is_active = FALSE, updated_at = NOW()
             WHERE user_id = $1 AND provider_type = 'polar'`,
            [userId]
        );

        log('info', `Polar account disconnected for user ${userId}`);
        return { success: true };
    } catch (error) {
        log('error', `Error disconnecting Polar account for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

async function getStatus(userId) {
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `SELECT last_sync_at, token_expires_at, is_active
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'polar'`,
            [userId]
        );

        if (result.rows.length === 0) {
            return { connected: false, lastSyncAt: null, tokenExpiresAt: null };
        }

        const { last_sync_at, token_expires_at, is_active } = result.rows[0];
        return {
            connected: is_active,
            lastSyncAt: last_sync_at,
            tokenExpiresAt: token_expires_at,
        };
    } finally {
        client.release();
    }
}

module.exports = {
    getAuthorizationUrl,
    exchangeCodeForTokens,
    fetchPhysicalInfo,
    fetchExercises,
    fetchRecentExercises,
    fetchDailyActivity,
    fetchRecentDailyActivity,
    fetchUserProfile, // export
    checkNotifications, // export
    fetchAndProcessPolarData,
    disconnectPolar,
    getStatus,
    getValidAccessToken
};
