import axios from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { encrypt, decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { logRawResponse } from '../../utils/diagnosticLogger.js';

const OURA_API_BASE_URL = 'https://api.ouraring.com';
const OURA_AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';

// Oura caps time-series (heartrate) queries to roughly 30 days per request.
const HEART_RATE_CHUNK_DAYS = 29;

export interface OuraSleepPeriod {
  id: string;
  day: string;
  type: string | null;
  bedtime_start: string;
  bedtime_end: string;
  time_in_bed: number;
  total_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  awake_time: number | null;
  latency: number | null;
  efficiency: number | null;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  average_breath: number | null;
  sleep_phase_5_min: string | null;
}

export interface OuraDailySleep {
  id: string;
  day: string;
  score: number | null;
}

export interface OuraDailyActivity {
  id: string;
  day: string;
  steps: number;
  active_calories: number;
  total_calories: number;
  score: number | null;
}

export interface OuraDailyReadiness {
  id: string;
  day: string;
  score: number | null;
  temperature_deviation: number | null;
}

export interface OuraDailySpo2 {
  id: string;
  day: string;
  spo2_percentage: { average: number | null } | null;
  breathing_disturbance_index: number | null;
}

export interface OuraDailyStress {
  id: string;
  day: string;
  stress_high: number | null;
  recovery_high: number | null;
}

export interface OuraDailyCardiovascularAge {
  id?: string;
  day: string;
  vascular_age: number | null;
}

export interface OuraVo2Max {
  id: string;
  day: string;
  vo2_max: number | null;
}

export interface OuraHeartRateSample {
  timestamp: string;
  bpm: number;
  source: string;
}

export interface OuraWorkout {
  id: string;
  activity: string;
  calories: number | null;
  day: string;
  distance: number | null;
  start_datetime: string;
  end_datetime: string;
  intensity: string | null;
  label: string | null;
  source: string | null;
}

interface OuraPaginatedResponse<T> {
  data: T[];
  next_token: string | null;
}

/**
 * Function to construct the Oura authorization URL
 */
async function getAuthorizationUrl(userId: string, redirectUri: string) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'oura'`,
      [userId]
    );
    if (result.rows.length === 0) {
      throw new Error('Oura client credentials not found for user.');
    }
    const { encrypted_app_id, app_id_iv, app_id_tag } = result.rows[0];
    const clientId = await decrypt(
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      ENCRYPTION_KEY
    );
    const scope = 'personal daily heartrate workout spo2 heart_health';
    const state = userId;
    return `${OURA_AUTHORIZE_URL}?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  } finally {
    client.release();
  }
}

async function getClientCredentials(userId: string) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'oura'`,
      [userId]
    );
    if (providerResult.rows.length === 0) {
      throw new Error('Oura client credentials not found for user.');
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
    return { clientId, clientSecret };
  } finally {
    client.release();
  }
}

/**
 * Function to exchange authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(
  userId: string,
  code: string,
  redirectUri: string
) {
  const client = await getSystemClient();
  try {
    const { clientId, clientSecret } = await getClientCredentials(userId);
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64'
    );
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    const response = await axios.post(OURA_TOKEN_URL, params, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const { access_token, refresh_token, expires_in, scope } = response.data;
    if (!access_token || !refresh_token) {
      throw new Error(
        'Missing access_token or refresh_token in Oura API response.'
      );
    }
    const personalInfo = await fetchPersonalInfo(userId, access_token);
    const externalUserId = personalInfo?.id || null;
    const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
    const encryptedRefreshToken = await encrypt(refresh_token, ENCRYPTION_KEY);
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    const updateQuery = `
            UPDATE external_data_providers
            SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
                encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
                scope = $7, token_expires_at = $8, external_user_id = $9, is_active = TRUE, updated_at = NOW()
            WHERE user_id = $10 AND provider_type = 'oura'
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
    log(
      'error',
      `Error exchanging code for Oura tokens: ${(error as Error).message}`
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Function to refresh an expired access token.
 * Oura rotates the refresh token on every refresh, so the new one must be persisted.
 */
async function refreshAccessToken(userId: string) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag,
                    encrypted_refresh_token, refresh_token_iv, refresh_token_tag
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'oura'`,
      [userId]
    );
    if (providerResult.rows.length === 0) {
      throw new Error('Oura credentials not found for token refresh.');
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
    if (!encrypted_refresh_token) {
      throw new Error('No Oura refresh token stored for user.');
    }
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
    params.append('refresh_token', refreshToken as string);
    const response = await axios.post(OURA_TOKEN_URL, params, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
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
            WHERE user_id = $9 AND provider_type = 'oura'
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
    return access_token as string;
  } catch (error) {
    log(
      'error',
      `Error refreshing Oura access token: ${(error as Error).message}`
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Function to ensure a valid access token is available
 */
async function getValidAccessToken(userId: string) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_access_token, access_token_iv, access_token_tag, token_expires_at
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'oura'`,
      [userId]
    );
    if (result.rows.length === 0) {
      throw new Error('Oura provider not found for user.');
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
async function getStatus(userId: string) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT is_active, last_sync_at, token_expires_at, external_user_id
             FROM external_data_providers
             WHERE user_id = $1 AND provider_type = 'oura'`,
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
 * Function to disconnect Oura
 */
async function disconnectOura(userId: string) {
  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE external_data_providers
             SET encrypted_access_token = NULL, access_token_iv = NULL, access_token_tag = NULL,
                 encrypted_refresh_token = NULL, refresh_token_iv = NULL, refresh_token_tag = NULL,
                 token_expires_at = NULL, external_user_id = NULL, is_active = FALSE, updated_at = NOW()
             WHERE user_id = $1 AND provider_type = 'oura'`,
      [userId]
    );
    return { success: true };
  } finally {
    client.release();
  }
}

/**
 * Fetches every page of an Oura user-collection endpoint
 */
async function fetchPaginated<T>(
  userId: string,
  endpoint: string,
  params: Record<string, string>,
  dataType: string,
  providedToken: string | null = null
): Promise<{ data: T[] }> {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const rows: T[] = [];
    let nextToken: string | null = null;
    do {
      const response: { data: OuraPaginatedResponse<T> } = await axios.get(
        `${OURA_API_BASE_URL}/v2/usercollection/${endpoint}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: nextToken ? { ...params, next_token: nextToken } : params,
        }
      );
      rows.push(...(response.data.data || []));
      nextToken = response.data.next_token || null;
    } while (nextToken);
    const result = { data: rows };
    logRawResponse('oura', dataType, result);
    return result;
  } catch (error) {
    const err = error as Error & { response?: { data: unknown } };
    log(
      'error',
      `[ouraIntegration] Error fetching ${dataType} for user ${userId}: ${err.message}${err.response ? ' - ' + JSON.stringify(err.response.data) : ''}`
    );
    throw error;
  }
}

/**
 * API Fetching Functions
 */
async function fetchSleepPeriods(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraSleepPeriod>(
    userId,
    'sleep',
    { start_date: startDate, end_date: endDate },
    'raw_sleep',
    providedToken
  );
}

async function fetchDailySleep(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraDailySleep>(
    userId,
    'daily_sleep',
    { start_date: startDate, end_date: endDate },
    'raw_daily_sleep',
    providedToken
  );
}

async function fetchDailyActivity(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraDailyActivity>(
    userId,
    'daily_activity',
    { start_date: startDate, end_date: endDate },
    'raw_daily_activity',
    providedToken
  );
}

async function fetchDailyReadiness(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraDailyReadiness>(
    userId,
    'daily_readiness',
    { start_date: startDate, end_date: endDate },
    'raw_daily_readiness',
    providedToken
  );
}

async function fetchDailySpo2(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraDailySpo2>(
    userId,
    'daily_spo2',
    { start_date: startDate, end_date: endDate },
    'raw_daily_spo2',
    providedToken
  );
}

async function fetchDailyStress(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraDailyStress>(
    userId,
    'daily_stress',
    { start_date: startDate, end_date: endDate },
    'raw_daily_stress',
    providedToken
  );
}

async function fetchDailyCardiovascularAge(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraDailyCardiovascularAge>(
    userId,
    'daily_cardiovascular_age',
    { start_date: startDate, end_date: endDate },
    'raw_daily_cardiovascular_age',
    providedToken
  );
}

async function fetchVo2Max(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraVo2Max>(
    userId,
    'vO2_max',
    { start_date: startDate, end_date: endDate },
    'raw_vo2_max',
    providedToken
  );
}

async function fetchWorkouts(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  return fetchPaginated<OuraWorkout>(
    userId,
    'workout',
    { start_date: startDate, end_date: endDate },
    'raw_workouts',
    providedToken
  );
}

async function fetchHeartRate(
  userId: string,
  startDatetime: string,
  endDatetime: string,
  providedToken: string | null = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  const chunkMs = HEART_RATE_CHUNK_DAYS * 24 * 60 * 60 * 1000;
  const rangeStart = new Date(startDatetime).getTime();
  const rangeEnd = new Date(endDatetime).getTime();
  const rows: OuraHeartRateSample[] = [];
  let cursor = rangeStart;
  while (cursor < rangeEnd) {
    const chunkEnd = Math.min(cursor + chunkMs, rangeEnd);
    const { data } = await fetchPaginated<OuraHeartRateSample>(
      userId,
      'heartrate',
      {
        start_datetime: new Date(cursor).toISOString(),
        end_datetime: new Date(chunkEnd).toISOString(),
      },
      'raw_heart_rate',
      accessToken as string
    );
    rows.push(...data);
    cursor = chunkEnd;
  }
  return { data: rows };
}

async function fetchPersonalInfo(
  userId: string,
  providedToken: string | null = null
) {
  const accessToken = providedToken || (await getValidAccessToken(userId));
  try {
    const response = await axios.get(
      `${OURA_API_BASE_URL}/v2/usercollection/personal_info`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    logRawResponse('oura', 'raw_personal_info', response.data);
    return response.data as { id: string };
  } catch (error) {
    const err = error as Error & { response?: { data: unknown } };
    log(
      'error',
      `[ouraIntegration] Error fetching personal info for user ${userId}: ${err.message}${err.response ? ' - ' + JSON.stringify(err.response.data) : ''}`
    );
    throw error;
  }
}

export { getAuthorizationUrl };
export { exchangeCodeForTokens };
export { refreshAccessToken };
export { getValidAccessToken };
export { getStatus };
export { disconnectOura };
export { fetchSleepPeriods };
export { fetchDailySleep };
export { fetchDailyActivity };
export { fetchDailyReadiness };
export { fetchDailySpo2 };
export { fetchDailyStress };
export { fetchDailyCardiovascularAge };
export { fetchVo2Max };
export { fetchWorkouts };
export { fetchHeartRate };
export { fetchPersonalInfo };
export default {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  getStatus,
  disconnectOura,
  fetchSleepPeriods,
  fetchDailySleep,
  fetchDailyActivity,
  fetchDailyReadiness,
  fetchDailySpo2,
  fetchDailyStress,
  fetchDailyCardiovascularAge,
  fetchVo2Max,
  fetchWorkouts,
  fetchHeartRate,
  fetchPersonalInfo,
};
