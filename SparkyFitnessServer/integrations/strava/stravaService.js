// SparkyFitnessServer/integrations/strava/stravaService.js

const axios = require("axios");
const { getSystemClient } = require("../../db/poolManager");
const {
  encrypt,
  decrypt,
  ENCRYPTION_KEY,
} = require("../../security/encryption");
const { log } = require("../../config/logging");

const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_AUTH_BASE_URL = "https://www.strava.com/oauth";

/**
 * Construct the Strava authorization URL
 */
async function getAuthorizationUrl(userId, redirectUri) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'strava'`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new Error("Strava client credentials not found for user.");
    }

    const { encrypted_app_id, app_id_iv, app_id_tag } = result.rows[0];
    const clientId = await decrypt(
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      ENCRYPTION_KEY,
    );

    const scope = "read,activity:read_all,profile:read_all";
    const state = userId;

    return `${STRAVA_AUTH_BASE_URL}/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&approval_prompt=auto&scope=${scope}&state=${state}`;
  } finally {
    client.release();
  }
}

/**
 * Exchange authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(userId, code, redirectUri) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'strava'`,
      [userId],
    );

    if (providerResult.rows.length === 0) {
      throw new Error("Strava client credentials not found for user.");
    }

    const {
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
    } = providerResult.rows[0];

    const clientId = await decrypt(
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      ENCRYPTION_KEY,
    );
    const clientSecret = await decrypt(
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      ENCRYPTION_KEY,
    );

    // Strava uses POST body params (not Basic auth header like Fitbit)
    const response = await axios.post(`${STRAVA_AUTH_BASE_URL}/token`, {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
    });

    const {
      access_token,
      refresh_token,
      expires_at, // Strava returns expires_at (epoch seconds), not expires_in
      athlete,
    } = response.data;

    if (!access_token || !refresh_token) {
      throw new Error(
        "Missing access_token or refresh_token in Strava API response.",
      );
    }

    const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
    const encryptedRefreshToken = await encrypt(refresh_token, ENCRYPTION_KEY);
    // Strava returns expires_at as Unix epoch seconds
    const tokenExpiresAt = new Date(expires_at * 1000);

    const externalUserId = athlete ? athlete.id.toString() : null;

    const updateQuery = `
      UPDATE external_data_providers
      SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
          encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
          scope = $7, token_expires_at = $8, external_user_id = $9, is_active = TRUE, updated_at = NOW()
      WHERE user_id = $10 AND provider_type = 'strava'
    `;

    await client.query(updateQuery, [
      encryptedAccessToken.encryptedText,
      encryptedAccessToken.iv,
      encryptedAccessToken.tag,
      encryptedRefreshToken.encryptedText,
      encryptedRefreshToken.iv,
      encryptedRefreshToken.tag,
      "read,activity:read_all,profile:read_all",
      tokenExpiresAt,
      externalUserId,
      userId,
    ]);

    return { success: true, externalUserId };
  } catch (error) {
    log("error", `Error exchanging code for Strava tokens: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(userId) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag,
              encrypted_refresh_token, refresh_token_iv, refresh_token_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'strava'`,
      [userId],
    );

    if (providerResult.rows.length === 0) {
      throw new Error("Strava credentials not found for token refresh.");
    }

    const {
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      encrypted_refresh_token,
      refresh_token_iv,
      refresh_token_tag,
    } = providerResult.rows[0];

    const clientId = await decrypt(
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      ENCRYPTION_KEY,
    );
    const clientSecret = await decrypt(
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      ENCRYPTION_KEY,
    );
    const refreshToken = await decrypt(
      encrypted_refresh_token,
      refresh_token_iv,
      refresh_token_tag,
      ENCRYPTION_KEY,
    );

    // Strava uses POST body params for token refresh
    const response = await axios.post(`${STRAVA_AUTH_BASE_URL}/token`, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const {
      access_token,
      refresh_token: newRefreshToken,
      expires_at,
    } = response.data;

    const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
    const encryptedNewRefreshToken = await encrypt(
      newRefreshToken,
      ENCRYPTION_KEY,
    );
    // Strava returns expires_at as Unix epoch seconds
    const tokenExpiresAt = new Date(expires_at * 1000);

    const updateQuery = `
      UPDATE external_data_providers
      SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
          encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
          token_expires_at = $7, updated_at = NOW()
      WHERE user_id = $8 AND provider_type = 'strava'
    `;

    await client.query(updateQuery, [
      encryptedAccessToken.encryptedText,
      encryptedAccessToken.iv,
      encryptedAccessToken.tag,
      encryptedNewRefreshToken.encryptedText,
      encryptedNewRefreshToken.iv,
      encryptedNewRefreshToken.tag,
      tokenExpiresAt,
      userId,
    ]);

    return access_token;
  } catch (error) {
    log("error", `Error refreshing Strava access token: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ensure a valid access token is available
 */
async function getValidAccessToken(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_access_token, access_token_iv, access_token_tag, token_expires_at
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'strava'`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new Error("Strava provider not found for user.");
    }

    const {
      encrypted_access_token,
      access_token_iv,
      access_token_tag,
      token_expires_at,
    } = result.rows[0];

    if (!encrypted_access_token) {
      return null;
    }

    // Strava tokens expire every 6 hours; refresh if within 5 minutes of expiry
    if (
      !token_expires_at ||
      new Date(token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)
    ) {
      return await refreshAccessToken(userId);
    }

    return await decrypt(
      encrypted_access_token,
      access_token_iv,
      access_token_tag,
      ENCRYPTION_KEY,
    );
  } finally {
    client.release();
  }
}

/**
 * Get connection status
 */
async function getStatus(userId) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT is_active, last_sync_at, token_expires_at, external_user_id
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'strava'`,
      [userId],
    );

    if (result.rows.length === 0) {
      return { connected: false, isActive: false };
    }

    const { is_active, last_sync_at, token_expires_at, external_user_id } =
      result.rows[0];
    return {
      connected: !!external_user_id,
      isActive: is_active,
      lastSyncAt: last_sync_at,
      tokenExpiresAt: token_expires_at,
      externalUserId: external_user_id,
    };
  } finally {
    client.release();
  }
}

/**
 * Disconnect Strava
 */
async function disconnectStrava(userId) {
  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE external_data_providers
       SET encrypted_access_token = NULL, access_token_iv = NULL, access_token_tag = NULL,
           encrypted_refresh_token = NULL, refresh_token_iv = NULL, refresh_token_tag = NULL,
           token_expires_at = NULL, external_user_id = NULL, is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND provider_type = 'strava'`,
      [userId],
    );
    return { success: true };
  } finally {
    client.release();
  }
}

// =============================================================================
// Strava API Fetching Functions
// =============================================================================

/**
 * Fetch athlete activities with date range and pagination
 * @param {string} accessToken - Valid Strava access token
 * @param {number|null} after - Epoch timestamp (seconds) - activities after this time
 * @param {number|null} before - Epoch timestamp (seconds) - activities before this time
 * @param {number} page - Page number (default 1)
 * @param {number} perPage - Items per page (default 30, max ~200)
 * @returns {Array} List of SummaryActivity objects
 */
async function fetchAthleteActivities(
  accessToken,
  after = null,
  before = null,
  page = 1,
  perPage = 30,
) {
  try {
    const params = { page, per_page: perPage };
    if (after) params.after = after;
    if (before) params.before = before;

    const response = await axios.get(
      `${STRAVA_API_BASE_URL}/athlete/activities`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      },
    );
    const { logRawResponse } = require("../../utils/diagnosticLogger");
    logRawResponse("strava", "raw_activities_list", response.data);
    return response.data;
  } catch (error) {
    log(
      "error",
      `[stravaIntegration] Error fetching activities: ${error.message}${error.response ? " - " + JSON.stringify(error.response.data) : ""}`,
    );
    throw error;
  }
}

/**
 * Fetch detailed activity by ID (includes laps, splits, GPS, segments)
 * @param {string} accessToken - Valid Strava access token
 * @param {number} activityId - Strava activity ID
 * @returns {Object} DetailedActivity object
 */
async function fetchActivityById(accessToken, activityId) {
  try {
    const response = await axios.get(
      `${STRAVA_API_BASE_URL}/activities/${activityId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { include_all_efforts: true },
      },
    );
    const { logRawResponse } = require("../../utils/diagnosticLogger");
    logRawResponse(
      "strava",
      `raw_activity_detail_${activityId}`,
      response.data,
    );
    return response.data;
  } catch (error) {
    log(
      "error",
      `[stravaIntegration] Error fetching activity ${activityId}: ${error.message}${error.response ? " - " + JSON.stringify(error.response.data) : ""}`,
    );
    throw error;
  }
}

/**
 * Fetch authenticated athlete profile (includes weight)
 * @param {string} accessToken - Valid Strava access token
 * @returns {Object} DetailedAthlete object
 */
async function fetchAthlete(accessToken) {
  try {
    const response = await axios.get(`${STRAVA_API_BASE_URL}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { logRawResponse } = require("../../utils/diagnosticLogger");
    logRawResponse("strava", "raw_athlete", response.data);
    return response.data;
  } catch (error) {
    log(
      "error",
      `[stravaIntegration] Error fetching athlete profile: ${error.message}${error.response ? " - " + JSON.stringify(error.response.data) : ""}`,
    );
    throw error;
  }
}

/**
 * Fetch all activities within a date range, handling pagination
 * @param {string} accessToken - Valid Strava access token
 * @param {number} afterEpoch - Epoch timestamp (seconds)
 * @param {number} beforeEpoch - Epoch timestamp (seconds)
 * @returns {Array} All activities in the date range
 */
async function fetchAllActivitiesInRange(accessToken, afterEpoch, beforeEpoch) {
  const allActivities = [];
  let page = 1;
  const perPage = 100; // Use larger page size for efficiency

  while (true) {
    const activities = await fetchAthleteActivities(
      accessToken,
      afterEpoch,
      beforeEpoch,
      page,
      perPage,
    );

    if (!activities || activities.length === 0) {
      break;
    }

    allActivities.push(...activities);

    // If we got fewer than perPage, there are no more pages
    if (activities.length < perPage) {
      break;
    }

    page++;

    // Small delay between pages to be respectful of rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return allActivities;
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  getStatus,
  disconnectStrava,
  fetchAthleteActivities,
  fetchActivityById,
  fetchAthlete,
  fetchAllActivitiesInRange,
};
