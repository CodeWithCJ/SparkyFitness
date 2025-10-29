// SparkyFitnessServer/integrations/withings/withingsService.js

const axios = require('axios');
const { getClient, getSystemClient } = require('../../db/poolManager');
const { encrypt, decrypt, ENCRYPTION_KEY } = require('../../security/encryption');
const { log } = require('../../config/logging');
const withingsDataProcessor = require('./withingsDataProcessor'); // Import the data processor

// Helper function to interpolate parameters into a SQL query for logging
function interpolateQuery(sql, params) {
    let i = 0;
    return sql.replace(/\$([0-9]+)/g, (match, p1) => {
        const index = parseInt(p1, 10) - 1;
        if (params[index] === undefined) {
            return match; // Return original placeholder if param is missing
        }
        // Handle different types for proper SQL representation
        if (typeof params[index] === 'string') {
            return `'${params[index].replace(/'/g, "''")}'`; // Escape single quotes
        }
        if (params[index] instanceof Date) {
            return `'${params[index].toISOString()}'`;
        }
        return params[index];
    });
}

const WITHINGS_API_BASE_URL = 'https://wbsapi.withings.net';
const WITHINGS_ACCOUNT_BASE_URL = 'https://account.withings.com';

// Function to construct the Withings authorization URL
async function getAuthorizationUrl(userId, redirectUri) {
    const client = await getSystemClient();
    try {
        const result = await client.query(
            `SELECT encrypted_app_id, app_id_iv, app_id_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Withings client credentials not found for user.');
        }

        const { encrypted_app_id, app_id_iv, app_id_tag } = result.rows[0];
        const clientId = await decrypt(encrypted_app_id, app_id_iv, app_id_tag, ENCRYPTION_KEY);

        const scope = 'user.info,user.metrics,user.activity'; // Define required scopes
        const state = userId; // Use the userId as the state to identify the user on callback
        // Store state in session or database to validate on callback

        return `${WITHINGS_ACCOUNT_BASE_URL}/oauth2_user/authorize2?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${process.env.SPARKY_FITNESS_FRONTEND_URL}/withings/callback&state=${state}`;
    } finally {
        client.release();
    }
}

// Function to exchange authorization code for access and refresh tokens
async function exchangeCodeForTokens(userId, code, redirectUri, state) {
    const client = await getSystemClient();
    try {
        // Validate state parameter (implementation depends on where state is stored)
        // For example, retrieve from session and compare

        const providerResult = await client.query(
            `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );

        if (providerResult.rows.length === 0) {
            throw new Error('Withings client credentials not found for user.');
        }

        const { encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag } = providerResult.rows[0];
        const clientId = await decrypt(encrypted_app_id, app_id_iv, app_id_tag, ENCRYPTION_KEY);
        const clientSecret = await decrypt(encrypted_app_key, app_key_iv, app_key_tag, ENCRYPTION_KEY);


        const response = await axios.post(`${WITHINGS_API_BASE_URL}/v2/oauth2`, null, {
            params: {
                action: 'requesttoken',
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri
            }
        });

        log('info', 'Withings token exchange response:', JSON.stringify(response.data, null, 2));
        const { access_token, refresh_token, expires_in, scope, userid } = response.data.body;

        if (!access_token || !refresh_token) {
            throw new Error('Missing access_token or refresh_token in Withings API response.');
        }

        // Encrypt tokens
        const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
        const encryptedRefreshToken = await encrypt(refresh_token, ENCRYPTION_KEY);

        // Validate expires_in
        let validExpiresIn = parseInt(expires_in, 10);
        if (isNaN(validExpiresIn) || validExpiresIn <= 0) {
            log('warn', `Invalid or missing expires_in value received from Withings API: ${expires_in}. Defaulting to 0.`);
            validExpiresIn = 0; // Force immediate expiration to trigger refresh
        }

        // Store tokens and related info in external_data_providers table
        const updatePayload = [
            encryptedAccessToken.encryptedText, encryptedAccessToken.iv, encryptedAccessToken.tag,
            encryptedRefreshToken.encryptedText, encryptedRefreshToken.iv, encryptedRefreshToken.tag,
            scope, new Date(Date.now() + validExpiresIn * 1000), userid, userId
        ];

        log('info', 'Attempting to update database with payload:', JSON.stringify({
            encrypted_access_token: encryptedAccessToken.encryptedText,
            scope: scope,
            expires_in: expires_in,
            external_user_id: userid,
            user_id: userId
        }, null, 2));

        try {
           const updateQuery = `UPDATE external_data_providers
                SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
                    encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
                    scope = $7, token_expires_at = $8, external_user_id = $9, is_active = TRUE, updated_at = NOW()
                WHERE user_id = $10 AND provider_type = 'withings'`;
           log('info', `Executing SQL query: ${updateQuery}`);
           log('info', `With payload: ${JSON.stringify(updatePayload)}`);
           log('info', `Interpolated SQL query: ${interpolateQuery(updateQuery, updatePayload)}`);
             const dbResult = await client.query(
                 updateQuery,
                 updatePayload
             );
            log('info', `Database update result for user ${userId}: ${dbResult.rowCount} rows updated.`);
        } catch (dbError) {
            log('error', `FATAL: Database update failed for user ${userId}:`, dbError);
            throw dbError; // Re-throw to ensure the outer catch block handles it
        }

        return { success: true, userId: userid };
    } catch (error) {
        log('error', `Error exchanging Withings code for tokens: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

// Function to refresh an expired access token
async function refreshAccessToken(userId) {
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag,
                    encrypted_refresh_token, refresh_token_iv, refresh_token_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );

        if (providerResult.rows.length === 0) {
            throw new Error('Withings client credentials or refresh token not found for user.');
        }

        const {
            encrypted_app_id, app_id_iv, app_id_tag,
            encrypted_app_key, app_key_iv, app_key_tag,
            encrypted_refresh_token, refresh_token_iv, refresh_token_tag
        } = providerResult.rows[0];

        const clientId = await decrypt(encrypted_app_id, app_id_iv, app_id_tag, ENCRYPTION_KEY);
        const clientSecret = await decrypt(encrypted_app_key, app_key_iv, app_key_tag, ENCRYPTION_KEY);
        const refreshToken = await decrypt(encrypted_refresh_token, refresh_token_iv, refresh_token_tag, ENCRYPTION_KEY);

        const response = await axios.post(`${WITHINGS_API_BASE_URL}/v2/oauth2`, null, {
            params: {
                action: 'requesttoken',
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken
            }
        });

        const { access_token, refresh_token: newRefreshToken, expires_in, scope } = response.data.body;

        // Validate expires_in
        let validExpiresIn = parseInt(expires_in, 10);
        if (isNaN(validExpiresIn) || validExpiresIn <= 0) {
            log('warn', `Invalid or missing expires_in value received from Withings API during refresh: ${expires_in}. Defaulting to 0.`);
            validExpiresIn = 0; // Force immediate expiration to trigger refresh
        }

        // Encrypt new tokens
        const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
        const encryptedNewRefreshToken = await encrypt(newRefreshToken, ENCRYPTION_KEY);

        // Update tokens in external_data_providers table
        await client.query(
            `UPDATE external_data_providers
             SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
                 encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
                 scope = $7, token_expires_at = $8, updated_at = NOW()
             WHERE user_id = $9 AND provider_type = 'withings'`,
            [
                encryptedAccessToken.encryptedText, encryptedAccessToken.iv, encryptedAccessToken.tag,
                encryptedNewRefreshToken.encryptedText, encryptedNewRefreshToken.iv, encryptedNewRefreshToken.tag,
                scope, new Date(Date.now() + validExpiresIn * 1000), userId
            ]
        );

        return access_token;
    } catch (error) {
        log('error', `Error refreshing Withings access token for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

// Helper function to get a valid access token (refreshes if expired)
async function getValidAccessToken(userId) {
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT encrypted_access_token, access_token_iv, access_token_tag, token_expires_at
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );

        if (providerResult.rows.length === 0) {
            throw new Error('Withings provider not configured for user.');
        }

        let { encrypted_access_token, access_token_iv, access_token_tag, token_expires_at } = providerResult.rows[0];
        let accessToken = await decrypt(encrypted_access_token, access_token_iv, access_token_tag, ENCRYPTION_KEY);

        if (new Date() >= new Date(token_expires_at)) {
            log('info', `Withings access token expired for user ${userId}. Refreshing...`);
            accessToken = await refreshAccessToken(userId);
        }
        return accessToken;
    } finally {
        client.release();
    }
}

// Function to fetch measures data (weight, blood pressure, etc.)
async function fetchAndProcessMeasuresData(userId, createdByUserId, startDate, endDate) {
    const accessToken = await getValidAccessToken(userId);
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT external_user_id FROM external_data_providers WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );
        const withingsUserId = providerResult.rows[0].external_user_id;

        const response = await axios.post(`${WITHINGS_API_BASE_URL}/measure`, null, {
            params: {
                action: 'getmeas',
                access_token: accessToken,
                userid: withingsUserId,
                startdate: startDate, // Unix timestamp
                enddate: endDate      // Unix timestamp
            }
        });
        const measuregrps = response.data.body.measuregrps;
        await withingsDataProcessor.processWithingsMeasures(userId, createdByUserId, measuregrps);
        return measuregrps;
    } catch (error) {
        log('error', `Error fetching and processing Withings measures data for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

// Function to fetch heart data
async function fetchAndProcessHeartData(userId, createdByUserId, startDate, endDate) {
    const accessToken = await getValidAccessToken(userId);
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT external_user_id FROM external_data_providers WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );
        const withingsUserId = providerResult.rows[0].external_user_id;

        const response = await axios.post(`${WITHINGS_API_BASE_URL}/v2/heart`, null, {
            params: {
                action: 'list',
                access_token: accessToken,
                userid: withingsUserId,
                startdate: startDate, // Unix timestamp
                enddate: endDate      // Unix timestamp
            }
        });
        const heartSeries = response.data.body.series || [];
        await withingsDataProcessor.processWithingsHeartData(userId, createdByUserId, heartSeries);
        return heartSeries;
    } catch (error) {
        log('error', `Error fetching and processing Withings heart data for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

// Function to fetch sleep data
async function fetchAndProcessSleepData(userId, createdByUserId, startDate, endDate) {
    const accessToken = await getValidAccessToken(userId);
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT external_user_id FROM external_data_providers WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );
        const withingsUserId = providerResult.rows[0].external_user_id;

        const response = await axios.post(`${WITHINGS_API_BASE_URL}/v2/sleep`, null, {
            params: {
                action: 'get',
                access_token: accessToken,
                userid: withingsUserId,
                startdate: startDate, // Unix timestamp
                enddate: endDate      // Unix timestamp
            }
        });
        const sleepSeries = response.data.body.series || [];
        await withingsDataProcessor.processWithingsSleepData(userId, createdByUserId, sleepSeries);
        return sleepSeries;
    } catch (error) {
        log('error', `Error fetching and processing Withings sleep data for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

// Function to fetch and process workout data
async function fetchAndProcessWorkoutsData(userId, createdByUserId, startDateYMD, endDateYMD) {
    const accessToken = await getValidAccessToken(userId);
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT external_user_id FROM external_data_providers WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );
        const withingsUserId = providerResult.rows[0].external_user_id;

        const response = await axios.post(`${WITHINGS_API_BASE_URL}/v2/measure`, null, {
            params: {
                action: 'getworkouts',
                access_token: accessToken,
                userid: withingsUserId,
                startdateymd: startDateYMD,
                enddateymd: endDateYMD
            }
        });
        const workouts = response.data.body.series || [];
        await withingsDataProcessor.processWithingsWorkouts(userId, createdByUserId, workouts);
        return workouts;
    } catch (error) {
        log('error', `Error fetching and processing Withings workout data for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

// Function to disconnect Withings account
async function disconnectWithings(userId) {
    const client = await getClient(userId);
    try {
        const providerResult = await client.query(
            `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag, external_user_id
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );

        if (providerResult.rows.length === 0) {
            log('warn', `Attempted to disconnect Withings for user ${userId}, but no provider found.`);
            return { success: true }; // Already disconnected or never connected
        }

        const {
            encrypted_app_id, app_id_iv, app_id_tag,
            encrypted_app_key, app_key_iv, app_key_tag,
            external_user_id
        } = providerResult.rows[0];

        const clientId = await decrypt(encrypted_app_id, app_id_iv, app_id_tag, ENCRYPTION_KEY);
        const clientSecret = await decrypt(encrypted_app_key, app_key_iv, app_key_tag, ENCRYPTION_KEY);

        // Revoke token with Withings
        await axios.post(`${WITHINGS_API_BASE_URL}/v2/oauth2`, null, {
            params: {
                action: 'revoke',
                client_id: clientId,
                client_secret: clientSecret,
                userid: external_user_id
            }
        });

        // Clear tokens and deactivate provider in our database
        await client.query(
            `UPDATE external_data_providers
             SET encrypted_access_token = NULL, access_token_iv = NULL, access_token_tag = NULL,
                 encrypted_refresh_token = NULL, refresh_token_iv = NULL, refresh_token_tag = NULL,
                 scope = NULL, token_expires_at = NULL, external_user_id = NULL, is_active = FALSE, updated_at = NOW()
             WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );

        log('info', `Withings account disconnected for user ${userId}`);
        return { success: true };
    } catch (error) {
        log('error', `Error disconnecting Withings account for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

// Helper function to generate a random string for state parameter
function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

async function getStatus(userId) {
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `SELECT last_sync_at, token_expires_at
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'withings'`,
            [userId]
        );

        if (result.rows.length === 0) {
            return {
                connected: false,
                lastSyncAt: null,
                tokenExpiresAt: null,
            };
        }

        const { last_sync_at, token_expires_at } = result.rows[0];
        return {
            connected: true,
            lastSyncAt: last_sync_at,
            tokenExpiresAt: token_expires_at,
        };
    } catch (error) {
        log('error', `Error getting Withings status for user ${userId}: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    getAuthorizationUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getValidAccessToken,
    fetchAndProcessMeasuresData,
    fetchAndProcessHeartData,
    fetchAndProcessSleepData,
    fetchAndProcessWorkoutsData,
    disconnectWithings,
    getStatus,
};