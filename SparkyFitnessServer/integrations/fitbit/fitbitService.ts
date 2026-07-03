import axios from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { encrypt, decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { logRawResponse } from '../../utils/diagnosticLogger.js';
const FITBIT_API_BASE_URL = 'https://api.fitbit.com';
const FITBIT_ACCOUNT_BASE_URL = 'https://www.fitbit.com';
/**
 * Function to construct the Fitbit authorization URL
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAuthorizationUrl(userId: any, redirectUri: any) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'fitbit'`,
      [userId]
    );
    if (result.rows.length === 0) {
      throw new Error('Fitbit client credentials not found for user.');
    }
    const { encrypted_app_id, app_id_iv, app_id_tag } = result.rows[0];
    const clientId = await decrypt(
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      ENCRYPTION_KEY
    );
    // Required scopes for heart rate, steps, SpO2, temperature, weight, profile, and nutrition (for water)
    const scope =
      'activity heartrate oxygen_saturation respiratory_rate sleep weight temperature profile nutrition cardio_fitness';
    const state = userId;
    return `${FITBIT_ACCOUNT_BASE_URL}/oauth2/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}&state=${state}`;
  } finally {
    client.release();
  }
}
/**
 * Function to exchange authorization code for access and refresh tokens
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exchangeCodeForTokens(userId: any, code: any, redirectUri: any) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'fitbit'`,
      [userId]
    );
    if (providerResult.rows.length === 0) {
      throw new Error('Fitbit client credentials not found for user.');
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
      ENCRYPTION_KEY
    );
    const clientSecret = await decrypt(
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      ENCRYPTION_KEY
    );
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64'
    );
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    const response = await axios.post(
      `${FITBIT_API_BASE_URL}/oauth2/token`,
      params,
      {
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
      user_id: externalUserId,
    } = response.data;
    if (!access_token || !refresh_token) {
      throw new Error(
        'Missing access_token or refresh_token in Fitbit API response.'
      );
    }
    const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
    const encryptedRefreshToken = await encrypt(refresh_token, ENCRYPTION_KEY);
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    const updateQuery = `
            UPDATE external_data_providers
            SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
                encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
                scope = $7, token_expires_at = $8, external_user_id = $9, is_active = TRUE, updated_at = NOW()
            WHERE user_id = $10 AND provider_type = 'fitbit'
        `;
    await client.query(updateQuery, [
      encryptedAccessToken.encryptedText,
      encryptedAccessToken.iv,
      encryptedAccessToken.tag,
      encryptedRefreshToken.encryptedText,
      encryptedRefreshToken.iv,
      encryptedRefreshToken.tag,
      scope,
      tokenExpiresAt,
      externalUserId,
      userId,
    ]);
    return { success: true, externalUserId };
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error exchanging code for Fitbit tokens: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Function to refresh an expired access token
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function refreshAccessToken(userId: any) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag,
                    encrypted_refresh_token, refresh_token_iv, refresh_token_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'fitbit'`,
      [userId]
    );
    if (providerResult.rows.length === 0) {
      throw new Error('Fitbit credentials not found for token refresh.');
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
      ENCRYPTION_KEY
    );
    const clientSecret = await decrypt(
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      ENCRYPTION_KEY
    );
    const refreshToken = await decrypt(
      encrypted_refresh_token,
      refresh_token_iv,
      refresh_token_tag,
      ENCRYPTION_KEY
    );
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64'
    );
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    // @ts-expect-error TS(2345): Argument of type 'string | null' is not assignable... Remove this comment to see the full error message
    params.append('refresh_token', refreshToken);
    const response = await axios.post(
      `${FITBIT_API_BASE_URL}/oauth2/token`,
      params,
      {
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    const {
      access_token,
      refresh_token: newRefreshToken,
      expires_in,
      scope,
    } = response.data;
    const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
    const encryptedNewRefreshToken = await encrypt(
      newRefreshToken,
      ENCRYPTION_KEY
    );
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    const updateQuery = `
            UPDATE external_data_providers
            SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
                encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
                scope = $7, token_expires_at = $8, updated_at = NOW()
            WHERE user_id = $9 AND provider_type = 'fitbit'
        `;
    await client.query(updateQuery, [
      encryptedAccessToken.encryptedText,
      encryptedAccessToken.iv,
      encryptedAccessToken.tag,
      encryptedNewRefreshToken.encryptedText,
      encryptedNewRefreshToken.iv,
      encryptedNewRefreshToken.tag,
      scope,
      tokenExpiresAt,
      userId,
    ]);
    return access_token;
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error refreshing Fitbit access token: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Function to ensure a valid access token is available
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getValidAccessToken(userId: any) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_access_token, access_token_iv, access_token_tag, token_expires_at
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'fitbit'`,
      [userId]
    );
    if (result.rows.length === 0) {
      throw new Error('Fitbit provider not found for user.');
    }
    const {
      encrypted_access_token,
      access_token_iv,
      access_token_tag,
      token_expires_at,
    } = result.rows[0];
    // If no token exists, return null (need to authorize)
    if (!encrypted_access_token) {
      return null;
    }
    // If token expires in less than 5 minutes, refresh it
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
      ENCRYPTION_KEY
    );
  } finally {
    client.release();
  }
}
/**
 * Function to get connection status
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStatus(userId: any) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT is_active, last_sync_at, token_expires_at, external_user_id
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'fitbit'`,
      [userId]
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
 * Function to disconnect Fitbit
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function disconnectFitbit(userId: any) {
  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE external_data_providers
             SET encrypted_access_token = NULL, access_token_iv = NULL, access_token_tag = NULL,
                 encrypted_refresh_token = NULL, refresh_token_iv = NULL, refresh_token_tag = NULL,
                 token_expires_at = NULL, external_user_id = NULL, is_active = FALSE, updated_at = NOW()
             WHERE user_id = $1 AND provider_type = 'fitbit'`,
      [userId]
    );
    return { success: true };
  } finally {
    client.release();
  }
}
/**
 * API Fetching Functions
 */
async function fetchHeartRate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/activities/heart/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_heart_rate', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching heart rate for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}

async function fetchSteps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/activities/steps/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_steps', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching steps for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}

async function fetchWeight(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/body/log/weight/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_weight', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching weight for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}

async function fetchSpO2(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/spo2/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_spo2', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching SpO2 for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}
async function fetchTemperature(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/temp/skin/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_temperature', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching temperature for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchProfile(userId: any, providedToken = null) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/profile.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_profile', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching profile for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}

async function fetchBodyFat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  const response = await axios.get(
    `${FITBIT_API_BASE_URL}/1/user/-/body/log/fat/date/${startDate}/${endDate}.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Language': 'metric',
      },
    }
  );
  logRawResponse('fitbit', 'raw_body_fat', response.data);
  return response.data;
}

async function fetchActivities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  date = 'today',
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    // Fetching the activity list (max 100 records) after a specific date
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/activities/list.json?afterDate=${date}&sort=asc&limit=100&offset=0`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_activities_list', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching activities for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}

async function fetchSleep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1.2/user/-/sleep/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_sleep', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching sleep for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}
async function fetchRespiratoryRate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  const response = await axios.get(
    `${FITBIT_API_BASE_URL}/1/user/-/br/date/${startDate}/${endDate}.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Language': 'metric',
      },
    }
  );
  logRawResponse('fitbit', 'raw_respiratory_rate', response.data);
  return response.data;
}

async function fetchHRV(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  const response = await axios.get(
    `${FITBIT_API_BASE_URL}/1/user/-/hrv/date/${startDate}/${endDate}.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Language': 'metric',
      },
    }
  );
  logRawResponse('fitbit', 'raw_hrv', response.data);
  return response.data;
}
async function fetchActiveZoneMinutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  const response = await axios.get(
    `${FITBIT_API_BASE_URL}/1/user/-/activities/active-zone-minutes/date/${startDate}/${endDate}.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Language': 'metric',
      },
    }
  );
  logRawResponse('fitbit', 'raw_active_zone_minutes', response.data);
  return response.data;
}

async function fetchWater(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/foods/log/water/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_water', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching water for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}
async function fetchActivityMinutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  const metrics = [
    'minutesSedentary',
    'minutesLightlyActive',
    'minutesFairlyActive',
    'minutesVeryActive',
  ];
  const results = {};
  for (const metric of metrics) {
    // Add a 500ms delay between individual metric fetches to avoid 429
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/activities/tracker/${metric}/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', `raw_activity_metric_${metric}`, response.data);
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    results[metric] = response.data[`activities-tracker-${metric}`];
  }
  return results;
}
async function fetchCardioFitnessScore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/cardioscore/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_cardio_fitness', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching cardio fitness score for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}
async function fetchCoreTemperature(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  providedToken = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${FITBIT_API_BASE_URL}/1/user/-/temp/core/date/${startDate}/${endDate}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'metric',
        },
      }
    );
    logRawResponse('fitbit', 'raw_core_temperature', response.data);
    return response.data;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[fitbitIntegration] Error fetching core temperature for user ${userId}: ${error.message}${error.response ? ' - ' + JSON.stringify(error.response.data) : ''}`
    );
    throw error;
  }
}
export { getAuthorizationUrl };
export { exchangeCodeForTokens };
export { refreshAccessToken };
export { getValidAccessToken };
export { getStatus };
export { disconnectFitbit };
export { fetchHeartRate };
export { fetchSteps };
export { fetchWeight };
export { fetchSpO2 };
export { fetchTemperature };
export { fetchProfile };
export { fetchBodyFat };
export { fetchActivities };
export { fetchSleep };
export { fetchWater };
export { fetchRespiratoryRate };
export { fetchHRV };
export { fetchActiveZoneMinutes };
export { fetchActivityMinutes };
export { fetchCardioFitnessScore };
export { fetchCoreTemperature };
export default {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  getStatus,
  disconnectFitbit,
  fetchHeartRate,
  fetchSteps,
  fetchWeight,
  fetchSpO2,
  fetchTemperature,
  fetchProfile,
  fetchBodyFat,
  fetchActivities,
  fetchSleep,
  fetchWater,
  fetchRespiratoryRate,
  fetchHRV,
  fetchActiveZoneMinutes,
  fetchActivityMinutes,
  fetchCardioFitnessScore,
  fetchCoreTemperature,
};
