import axios from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { encrypt, decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { logRawResponse } from '../../utils/diagnosticLogger.js';

function anonymizeGoogleHealthData(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(anonymizeGoogleHealthData);
  if (data !== null && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (k === 'name' && typeof v === 'string' && v.includes('users/')) {
        result[k] = v.replace(/users\/[^/]+/, 'users/REDACTED');
      } else if (k === 'dataPointId') {
        result[k] = 'REDACTED';
      } else {
        result[k] = anonymizeGoogleHealthData(v);
      }
    }
    return result;
  }
  return data;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// v4 is the current production version of the Google Health API
const GOOGLE_HEALTH_BASE_URL =
  'https://health.googleapis.com/v4/users/me/dataTypes';

// Scopes use the googlehealth.* namespace (NOT health.* — confirmed from working oauth flow)
const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly',
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
].join(' ');

// Converts duration to seconds.
// Handles Google Health plain-seconds format ("1829s", "1829.5s")
// and ISO 8601 format ("PT1H30M", "PT3600S").
function parseDurationToSeconds(
  duration: string | null | undefined
): number | null {
  if (!duration) return null;
  // Plain seconds: "1829s" or "1829.5s" (case-insensitive)
  const plainMatch = duration.match(/^(\d+(?:\.\d+)?)s$/i);
  if (plainMatch) return Math.round(parseFloat(plainMatch[1]));
  // ISO 8601: "PT1H30M45S"
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return null;
  const hours = parseFloat(match[1] || '0');
  const minutes = parseFloat(match[2] || '0');
  const seconds = parseFloat(match[3] || '0');
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}

// Converts a Google Health date+time object to an ISO string
function googleTimeToIso(t: unknown): string | null {
  if (!t) return null;
  try {
    // Handle { date: { year, month, day }, time: { hours, minutes, seconds } }
    const obj = t as Record<string, unknown>;
    if (obj.date) {
      const d = obj.date as Record<string, number>;
      const ti = (obj.time as Record<string, number>) || {};
      const date = new Date(
        Date.UTC(
          d.year,
          d.month - 1,
          d.day,
          ti.hours || 0,
          ti.minutes || 0,
          Math.floor(ti.seconds || 0)
        )
      );
      return isNaN(date.getTime()) ? null : date.toISOString();
    }
    // Handle raw ISO string
    if (typeof t === 'string') {
      const date = new Date(t);
      return isNaN(date.getTime()) ? null : date.toISOString();
    }
  } catch {
    log('warn', 'Failed to parse Google Health time: ' + JSON.stringify(t));
  }
  return null;
}

async function getAuthorizationUrl(userId: string, redirectUri: string) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'googlehealth'`,
      [userId]
    );
    if (result.rows.length === 0) {
      throw new Error('Google Health client credentials not found for user.');
    }
    const { encrypted_app_id, app_id_iv, app_id_tag } = result.rows[0];
    const clientId = await decrypt(
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      ENCRYPTION_KEY
    );
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId as string,
      redirect_uri: redirectUri,
      scope: GOOGLE_HEALTH_SCOPES,
      access_type: 'offline',
      prompt: 'consent', // force refresh_token to always be returned
      state: userId,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  } finally {
    client.release();
  }
}

async function exchangeCodeForTokens(
  userId: string,
  code: string,
  redirectUri: string
) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'googlehealth'`,
      [userId]
    );
    if (providerResult.rows.length === 0) {
      throw new Error('Google Health client credentials not found for user.');
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

    // Google uses POST body params (not HTTP Basic auth)
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', clientId as string);
    params.append('client_secret', clientSecret as string);

    const response = await axios.post(GOOGLE_TOKEN_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, expires_in, scope } = response.data;
    if (!access_token || !refresh_token) {
      throw new Error(
        'Missing access_token or refresh_token in Google OAuth response.'
      );
    }

    const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
    const encryptedRefreshToken = await encrypt(refresh_token, ENCRYPTION_KEY);
    const expiresIn = Number(expires_in) || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await client.query(
      `UPDATE external_data_providers
       SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
           encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
           scope = $7, token_expires_at = $8, external_user_id = $9, is_active = TRUE, updated_at = NOW()
       WHERE user_id = $10 AND provider_type = 'googlehealth'`,
      [
        encryptedAccessToken.encryptedText,
        encryptedAccessToken.iv,
        encryptedAccessToken.tag,
        encryptedRefreshToken.encryptedText,
        encryptedRefreshToken.iv,
        encryptedRefreshToken.tag,
        scope,
        tokenExpiresAt,
        'google',
        userId,
      ]
    );
    return { success: true, externalUserId: 'google' };
  } catch (error) {
    log(
      'error',
      `Error exchanging code for Google Health tokens: ${(error as Error).message}`
    );
    throw error;
  } finally {
    client.release();
  }
}

async function refreshAccessToken(userId: string) {
  const client = await getSystemClient();
  try {
    const providerResult = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag, encrypted_app_key, app_key_iv, app_key_tag,
              encrypted_refresh_token, refresh_token_iv, refresh_token_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'googlehealth'`,
      [userId]
    );
    if (providerResult.rows.length === 0) {
      throw new Error('Google Health credentials not found for token refresh.');
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

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    // @ts-expect-error TS(2345)
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId as string);
    params.append('client_secret', clientSecret as string);

    const response = await axios.post(GOOGLE_TOKEN_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const {
      access_token,
      refresh_token: newRefreshToken,
      expires_in,
      scope,
    } = response.data;

    const encryptedAccessToken = await encrypt(access_token, ENCRYPTION_KEY);
    const expiresIn = Number(expires_in) || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Google may or may not return a new refresh token on each refresh
    if (newRefreshToken) {
      const encryptedNewRefreshToken = await encrypt(
        newRefreshToken,
        ENCRYPTION_KEY
      );
      await client.query(
        `UPDATE external_data_providers
         SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
             encrypted_refresh_token = $4, refresh_token_iv = $5, refresh_token_tag = $6,
             scope = $7, token_expires_at = $8, updated_at = NOW()
         WHERE user_id = $9 AND provider_type = 'googlehealth'`,
        [
          encryptedAccessToken.encryptedText,
          encryptedAccessToken.iv,
          encryptedAccessToken.tag,
          encryptedNewRefreshToken.encryptedText,
          encryptedNewRefreshToken.iv,
          encryptedNewRefreshToken.tag,
          scope,
          tokenExpiresAt,
          userId,
        ]
      );
    } else {
      await client.query(
        `UPDATE external_data_providers
         SET encrypted_access_token = $1, access_token_iv = $2, access_token_tag = $3,
             scope = $4, token_expires_at = $5, updated_at = NOW()
         WHERE user_id = $6 AND provider_type = 'googlehealth'`,
        [
          encryptedAccessToken.encryptedText,
          encryptedAccessToken.iv,
          encryptedAccessToken.tag,
          scope,
          tokenExpiresAt,
          userId,
        ]
      );
    }
    return access_token;
  } catch (error) {
    const googleError = (error as { response?: { data?: unknown } })?.response
      ?.data;
    const detail = googleError
      ? ` — Google: ${JSON.stringify(googleError)}`
      : '';
    log(
      'error',
      `Error refreshing Google Health access token: ${(error as Error).message}${detail}`
    );
    throw error;
  } finally {
    client.release();
  }
}

async function getValidAccessToken(userId: string) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_access_token, access_token_iv, access_token_tag, token_expires_at
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'googlehealth'`,
      [userId]
    );
    if (result.rows.length === 0)
      throw new Error('Google Health provider not found for user.');
    const {
      encrypted_access_token,
      access_token_iv,
      access_token_tag,
      token_expires_at,
    } = result.rows[0];
    if (!encrypted_access_token) return null;
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

async function getStatus(userId: string) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT is_active, last_sync_at, token_expires_at, external_user_id
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'googlehealth'`,
      [userId]
    );
    if (result.rows.length === 0) return { connected: false, isActive: false };
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

async function disconnectGoogleHealth(userId: string) {
  const client = await getSystemClient();
  try {
    // Attempt to revoke the access token with Google before clearing DB tokens.
    // Revocation failure is non-fatal — tokens are cleared regardless.
    try {
      const tokenResult = await client.query(
        `SELECT encrypted_access_token, access_token_iv, access_token_tag
         FROM external_data_providers
         WHERE user_id = $1 AND provider_type = 'googlehealth'`,
        [userId]
      );
      if (tokenResult.rows.length > 0) {
        const { encrypted_access_token, access_token_iv, access_token_tag } =
          tokenResult.rows[0];
        if (encrypted_access_token) {
          const accessToken = await decrypt(
            encrypted_access_token,
            access_token_iv,
            access_token_tag,
            ENCRYPTION_KEY
          );
          await axios.post(
            `https://oauth2.googleapis.com/revoke?token=${accessToken}`
          );
          log('info', `Revoked Google Health access token for user ${userId}.`);
        }
      }
    } catch (revokeError) {
      log(
        'warn',
        `Failed to revoke Google Health token for user ${userId} (non-fatal): ${(revokeError as Error).message}`
      );
    }

    await client.query(
      `UPDATE external_data_providers
       SET encrypted_access_token = NULL, access_token_iv = NULL, access_token_tag = NULL,
           encrypted_refresh_token = NULL, refresh_token_iv = NULL, refresh_token_tag = NULL,
           token_expires_at = NULL, external_user_id = NULL, is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND provider_type = 'googlehealth'`,
      [userId]
    );
    return { success: true };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Data-fetching helpers
// ──────────────────────────────────────────────────────────────────────────────

// GET .../dataTypes/{type}/dataPoints?startTime=...&endTime=...
// Convert hyphenated data type to camelCase payload key (mirrors Python get_google_payload_key).
// e.g. "daily-resting-heart-rate" → "dailyRestingHeartRate"
function toCamelCaseKey(dataType: string): string {
  const parts = dataType.split('-');
  return (
    parts[0] +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('')
  );
}

// Client-side date filter for daily-aggregate types that don't support server-side filter.
// Each data point carries its date in payload.date = { year, month, day }.
function filterByDateRange(
  points: Record<string, unknown>[],
  dataType: string,
  startDate: string,
  endDate: string
): Record<string, unknown>[] {
  const payloadKey = toCamelCaseKey(dataType);
  return points.filter((point) => {
    const raw = point[payloadKey];
    if (!raw) return true;
    const payload = raw as Record<string, unknown>;

    const d = payload.date as Record<string, number> | undefined;
    if (d?.year) {
      const s = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
      return s >= startDate && s <= endDate;
    }
    // Interval-based payloads: use civilStartTime.date
    const interval = payload.interval as Record<string, unknown> | undefined;
    const civilStart = interval?.civilStartTime as
      | Record<string, unknown>
      | undefined;
    const csd = civilStart?.date as Record<string, number> | undefined;
    if (csd?.year) {
      const s = `${csd.year}-${String(csd.month).padStart(2, '0')}-${String(csd.day).padStart(2, '0')}`;
      return s >= startDate && s <= endDate;
    }
    return true;
  });
}

// Google Health uses CEL filter expressions on GET .../dataPoints — NOT startTime/endTime params.
// Filter field paths differ per data type; fall back through alternatives then to no filter.
async function fetchDataPointsRange(
  accessToken: string,
  dataType: string,
  startDate: string,
  endDate: string
): Promise<{ dataPoints: Record<string, unknown>[] }> {
  // Session-type data (sleep, exercise, activity-level) is capped to ~30 days per unfiltered
  // fetch by the Google Health API — the civil_start_time filter returns HTTP 400, and the
  // unfiltered fallback only surfaces the most recent ~30 days of sessions regardless of the
  // requested range. Break wide ranges into 30-day chunks so every chunk stays within the
  // window the API reliably serves, then aggregate all results.
  if (['exercise', 'sleep', 'activity-level'].includes(dataType)) {
    const rangeStart = new Date(`${startDate}T00:00:00Z`);
    const rangeEnd = new Date(`${endDate}T00:00:00Z`);
    const diffDays = Math.round(
      (rangeEnd.getTime() - rangeStart.getTime()) / 86400000
    );
    if (diffDays > 30) {
      const allPoints: Record<string, unknown>[] = [];
      let chunkStart = new Date(rangeStart);
      while (chunkStart <= rangeEnd) {
        const chunkEnd = new Date(chunkStart);
        chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 29); // 30-day inclusive window
        if (chunkEnd > rangeEnd) chunkEnd.setTime(rangeEnd.getTime());
        const chunk = await fetchDataPointsRange(
          accessToken,
          dataType,
          chunkStart.toISOString().split('T')[0],
          chunkEnd.toISOString().split('T')[0]
        );
        allPoints.push(...(chunk.dataPoints || []));
        chunkStart = new Date(chunkEnd);
        chunkStart.setUTCDate(chunkStart.getUTCDate() + 1);
      }
      return { dataPoints: allPoints };
    }
  }

  // Exclusive upper-bound date string (e.g. "2026-06-08" for endDate "2026-06-07")
  const endExclusive = new Date(`${endDate}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const endNext = endExclusive.toISOString().split('T')[0];

  const startIso = `${startDate}T00:00:00Z`;
  const endIso = `${endNext}T00:00:00Z`;
  const ft = dataType.replace(/-/g, '_'); // filter field prefix uses underscores

  type FilterOrNull = string | null;
  let filtersToTry: FilterOrNull[];

  if (
    [
      'heart-rate',
      'oxygen-saturation',
      'weight',
      'body-fat',
      'height',
      'core-body-temperature',
    ].includes(dataType)
  ) {
    // Sample-time data: each point has a sampleTime.physicalTime
    filtersToTry = [
      `${ft}.sample_time.physical_time >= "${startIso}" AND ${ft}.sample_time.physical_time < "${endIso}"`,
      null,
    ];
  } else if (['exercise', 'sleep', 'activity-level'].includes(dataType)) {
    // Session data: civil_start_time filter (falls back to civil_end_time then unfiltered)
    filtersToTry = [
      `${ft}.interval.civil_start_time >= "${startDate}T00:00:00" AND ${ft}.interval.civil_start_time < "${endNext}T00:00:00"`,
      `${ft}.interval.civil_end_time >= "${startDate}T00:00:00" AND ${ft}.interval.civil_end_time < "${endNext}T00:00:00"`,
      null,
    ];
  } else {
    // Daily-aggregate types (daily-resting-heart-rate, daily-heart-rate-variability, etc.)
    // don't support server-side filters — fetch all, then filter client-side by payload.date
    filtersToTry = [null];
  }

  for (const filter of filtersToTry) {
    try {
      const baseParams: Record<string, string | number> = { pageSize: 1000 };
      if (filter) baseParams.filter = filter;

      // Paginate through all pages — Google Health may return fewer records than
      // pageSize and include a nextPageToken for subsequent pages.
      const allPoints: Record<string, unknown>[] = [];
      let nextPageToken: string | undefined;
      do {
        const reqParams: Record<string, string | number> = { ...baseParams };
        if (nextPageToken) reqParams.pageToken = nextPageToken;
        const response = await axios.get(
          `${GOOGLE_HEALTH_BASE_URL}/${dataType}/dataPoints`,
          {
            params: reqParams,
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const page = response.data?.dataPoints || [];
        allPoints.push(...page);
        nextPageToken = response.data?.nextPageToken || undefined;
      } while (nextPageToken);

      logRawResponse(
        'googlehealth',
        `raw_${dataType.replace(/-/g, '_')}`,
        anonymizeGoogleHealthData({ dataPoints: allPoints })
      );
      if (!filter) {
        return {
          dataPoints: filterByDateRange(
            allPoints,
            dataType,
            startDate,
            endDate
          ),
        };
      }
      return { dataPoints: allPoints };
    } catch (error: unknown) {
      if (
        filter !== null &&
        (error as { response?: { status?: number } })?.response?.status === 400
      ) {
        continue;
      }
      throw error;
    }
  }

  return { dataPoints: [] };
}

// GET .../dataPoints?pageSize=... (no date filter — for exercise and height)
// Paginates automatically if the API returns a nextPageToken.
async function fetchDataPointsList(
  accessToken: string,
  dataType: string,
  params: Record<string, string | number> = {}
) {
  const allPoints: Record<string, unknown>[] = [];
  let nextPageToken: string | undefined;
  do {
    const reqParams: Record<string, string | number> = {
      pageSize: 100,
      ...params,
    };
    if (nextPageToken) reqParams.pageToken = nextPageToken;
    const response = await axios.get(
      `${GOOGLE_HEALTH_BASE_URL}/${dataType}/dataPoints`,
      { params: reqParams, headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const page = response.data?.dataPoints || [];
    allPoints.push(...page);
    nextPageToken = response.data?.nextPageToken || undefined;
  } while (nextPageToken);
  logRawResponse(
    'googlehealth',
    `raw_list_${dataType.replace(/-/g, '_')}`,
    anonymizeGoogleHealthData({ dataPoints: allPoints })
  );
  return { dataPoints: allPoints };
}

// POST .../dataPoints:dailyRollup — used for steps and active-zone-minutes
async function fetchDailyRollup(
  accessToken: string,
  dataType: string,
  date: string
) {
  const [year, month, day] = date.split('-').map(Number);
  const payload = {
    range: {
      start: {
        date: { year, month, day },
        time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
      },
      end: {
        date: { year, month, day },
        time: { hours: 23, minutes: 59, seconds: 59, nanos: 0 },
      },
    },
    windowSizeDays: 1,
  };
  const response = await axios.post(
    `${GOOGLE_HEALTH_BASE_URL}/${dataType}/dataPoints:dailyRollUp`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

// Iterates date range day-by-day and collects rollup points for a data type
async function fetchDailyRollupRange(
  accessToken: string,
  dataType: string,
  startDate: string,
  endDate: string
) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const allPoints: Record<string, unknown>[] = [];
  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    try {
      const response = await fetchDailyRollup(accessToken, dataType, dateStr);
      if (response?.rollupDataPoints?.length) {
        allPoints.push(...response.rollupDataPoints);
      }
    } catch {
      // individual day failure is non-fatal
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  logRawResponse(
    'googlehealth',
    `raw_rollup_${dataType.replace(/-/g, '_')}`,
    anonymizeGoogleHealthData({ rollupDataPoints: allPoints })
  );
  return { rollupDataPoints: allPoints };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public fetch functions (mirror fitbitService shape for the sync orchestrator)
// ──────────────────────────────────────────────────────────────────────────────

async function fetchHeartRate(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'daily-resting-heart-rate',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching resting heart rate for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchSteps(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDailyRollupRange(
      accessToken,
      'steps',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching steps for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchWeight(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'weight',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching weight for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchSpO2(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'oxygen-saturation',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching SpO2 for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchTemperature(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'daily-sleep-temperature-derivations',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching skin temperature for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

// Fetches height (latest entry only — used for BMI computation)
async function fetchProfile(
  userId: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsList(accessToken, 'height', { pageSize: 100 });
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching height for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchActivities(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'exercise',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching activities for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchSleep(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(accessToken, 'sleep', startDate, endDate);
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching sleep for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchRespiratoryRate(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'daily-respiratory-rate',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching respiratory rate for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchHRV(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'daily-heart-rate-variability',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching HRV for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchActiveZoneMinutes(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDailyRollupRange(
      accessToken,
      'active-zone-minutes',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching AZM for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchBodyFat(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'body-fat',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching body fat for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchWater(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    // hydration-log supports dailyRollUp which sums millilitersSum per day
    return await fetchDailyRollupRange(
      accessToken,
      'hydration-log',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching hydration log for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

async function fetchCoreTemperature(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'core-body-temperature',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching core body temperature for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

// VO2 Max — matches Fitbit's cardioFitnessScore
// Google data type: daily-vo2-max (daily aggregate)
async function fetchVO2Max(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'daily-vo2-max',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching VO2 Max for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

// Activity Minutes breakdown — matches Fitbit's minutesSedentary/LightlyActive/FairlyActive/VeryActive
// Google data type: activity-level (session segments, aggregated per day in processor)
async function fetchActivityMinutes(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDataPointsRange(
      accessToken,
      'activity-level',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching activity minutes for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

// Distance — new metric not in Fitbit integration
// Google data type: distance (dailyRollup, distanceMeters sum)
async function fetchDistance(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDailyRollupRange(
      accessToken,
      'distance',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching distance for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

// Floors — new metric not in Fitbit integration
// Google data type: floors (dailyRollup, floorCountSum)
async function fetchFloors(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDailyRollupRange(
      accessToken,
      'floors',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching floors for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

// Daily Calories — new metric not in Fitbit integration
// Google data type: total-calories (dailyRollup, kilocaloriesSum)
async function fetchCalories(
  userId: string,
  startDate: string,
  endDate: string,
  providedToken: string | null = null
) {
  const accessToken =
    providedToken || ((await getValidAccessToken(userId)) as string);
  try {
    return await fetchDailyRollupRange(
      accessToken,
      'total-calories',
      startDate,
      endDate
    );
  } catch (error) {
    log(
      'error',
      `[googleHealthService] Error fetching daily calories for user ${userId}: ${(error as Error).message}`
    );
    throw error;
  }
}

export { getAuthorizationUrl };
export { exchangeCodeForTokens };
export { refreshAccessToken };
export { getValidAccessToken };
export { getStatus };
export { disconnectGoogleHealth };
export { fetchHeartRate };
export { fetchSteps };
export { fetchWeight };
export { fetchSpO2 };
export { fetchTemperature };
export { fetchProfile };
export { fetchActivities };
export { fetchSleep };
export { fetchRespiratoryRate };
export { fetchHRV };
export { fetchActiveZoneMinutes };
export { fetchBodyFat };
export { fetchWater };
export { fetchCoreTemperature };
export { fetchVO2Max };
export { fetchActivityMinutes };
export { fetchDistance };
export { fetchFloors };
export { fetchCalories };
export { parseDurationToSeconds };
export { googleTimeToIso };
export default {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  getStatus,
  disconnectGoogleHealth,
  fetchHeartRate,
  fetchSteps,
  fetchWeight,
  fetchSpO2,
  fetchTemperature,
  fetchProfile,
  fetchActivities,
  fetchSleep,
  fetchRespiratoryRate,
  fetchHRV,
  fetchActiveZoneMinutes,
  fetchBodyFat,
  fetchWater,
  fetchCoreTemperature,
  fetchVO2Max,
  fetchActivityMinutes,
  fetchDistance,
  fetchFloors,
  fetchCalories,
  parseDurationToSeconds,
  googleTimeToIso,
};
