/**
 * Intervals.icu integration service. Pulls activities and wellness from the
 * Intervals.icu API (https://intervals.icu/api/v1) with the user's athlete ID
 * (external_data_providers.app_id) and API key (app_key), both stored
 * encrypted. Mirrors the Liftosaur service for provider lookup, status and
 * disconnect.
 */
import axios, { AxiosError } from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { setMockDataContext } from '../../utils/mockDataContext.js';
import { loadRawBundle, logRawResponse } from '../../utils/diagnosticLogger.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { addDays, todayInZone } from '@workspace/shared';
import intervalsDataProcessor, {
  IntervalsActivity,
  IntervalsWellness,
} from './intervalsDataProcessor.js';

const INTERVALS_API_BASE_URL = 'https://intervals.icu/api/v1';
const WELLNESS_FIELDS =
  'id,weight,bodyFat,steps,restingHR,vo2max,hrv,hrvSDNN,floorsClimbed,ctl,atl,spO2,respiration';
// Intervals does not document its rate limits; wait out one 429 and give up after.
const MAX_RETRY_AFTER_MS = 60_000;

interface IntervalsCredentials {
  providerId: string;
  athleteId: string;
  apiKey: string;
}

interface ProviderRow {
  id: string;
  is_active: boolean;
  last_sync_at: Date | null;
  encrypted_app_id: string | null;
  app_id_iv: string | null;
  app_id_tag: string | null;
  encrypted_app_key: string | null;
  app_key_iv: string | null;
  app_key_tag: string | null;
}

export interface IntervalsSyncResult {
  success: boolean;
  activitiesImported: number;
  activitiesSkipped: number;
  activitiesFailed: number;
  activitiesRemoved: number;
  wellnessDays: number;
}

export interface IntervalsProviderStatus {
  connected: boolean;
  lastSyncAt: string | null;
}

async function findProvider(
  userId: string,
  providerId?: string
): Promise<ProviderRow | null> {
  const client = await getSystemClient();
  try {
    let query = `SELECT id, is_active, last_sync_at,
                        encrypted_app_id, app_id_iv, app_id_tag,
                        encrypted_app_key, app_key_iv, app_key_tag
                 FROM external_data_providers
                 WHERE user_id = $1 AND provider_type = 'intervals'`;
    const params: string[] = [userId];
    if (providerId) {
      query += ' AND id = $2';
      params.push(providerId);
    } else {
      query += ' ORDER BY is_active DESC, created_at DESC LIMIT 1';
    }
    const result = (await client.query(query, params)) as {
      rows: ProviderRow[];
    };
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function getIntervalsCredentials(
  userId: string,
  providerId?: string
): Promise<IntervalsCredentials> {
  const row = await findProvider(userId, providerId);
  if (!row) {
    throw new Error('Intervals.icu provider not found.');
  }
  if (
    !row.encrypted_app_id ||
    !row.app_id_iv ||
    !row.app_id_tag ||
    !row.encrypted_app_key ||
    !row.app_key_iv ||
    !row.app_key_tag
  ) {
    throw new Error(
      'Intervals.icu athlete ID or API key is missing for this provider.'
    );
  }
  const athleteId = await decrypt(
    row.encrypted_app_id,
    row.app_id_iv,
    row.app_id_tag,
    ENCRYPTION_KEY
  );
  const apiKey = await decrypt(
    row.encrypted_app_key,
    row.app_key_iv,
    row.app_key_tag,
    ENCRYPTION_KEY
  );
  if (!athleteId || !apiKey) {
    throw new Error('Failed to decrypt the stored Intervals.icu credentials.');
  }
  return { providerId: row.id, athleteId, apiKey };
}

function retryAfterMs(error: unknown): number | null {
  const response = (error as AxiosError)?.response;
  if (response?.status !== 429) return null;
  const seconds = Number(response.headers?.['retry-after']);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : 5_000;
}

async function intervalsGet<T>(
  creds: IntervalsCredentials,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = `${INTERVALS_API_BASE_URL}/athlete/${encodeURIComponent(creds.athleteId)}${path}`;
  const config = {
    auth: { username: 'API_KEY', password: creds.apiKey },
    params,
  };
  try {
    return (await axios.get<T>(url, config)).data;
  } catch (error) {
    const wait = retryAfterMs(error);
    if (wait === null) throw error;
    log('warn', `[intervalsService] Rate limited; retrying in ${wait}ms.`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    return (await axios.get<T>(url, config)).data;
  }
}

/** HTTP status of an Intervals.icu API error (0 when there is none). */
export function intervalsErrorStatus(error: unknown): number {
  return (error as AxiosError)?.response?.status ?? 0;
}

async function hasActiveGarminProvider(userId: string): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT 1 FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'garmin' AND is_active = TRUE
       LIMIT 1`,
      [userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Pull activities and wellness for a calendar-day range (user timezone).
 * Defaults to yesterday and today.
 */
async function syncIntervalsData(
  userId: string,
  createdByUserId: string,
  providerId?: string,
  startDate?: string | null,
  endDate?: string | null,
  mock: { dataSource?: string; saveMockData?: boolean } = {}
): Promise<IntervalsSyncResult> {
  setMockDataContext(mock);
  // 'local' replays the responses a capture saved instead of calling Intervals.
  const replay =
    mock.dataSource === 'local' ? loadRawBundle('intervals') : undefined;
  if (replay !== undefined && !replay?.responses) {
    throw new Error(
      'Raw diagnostic bundle not found. Run a sync with "Sync and save ' +
        'this sync\'s raw responses" selected first to capture one.'
    );
  }
  const creds = await getIntervalsCredentials(userId, providerId);
  const today = todayInZone(await loadUserTimezone(userId));
  const oldest = startDate ?? addDays(today, -1);
  const newest = endDate ?? today;
  log(
    'info',
    `[intervalsService] Syncing Intervals.icu for user ${userId} from ${oldest} to ${newest}.`
  );

  // `newest` is compared as a timestamp; without the time the last day is cut off.
  const activities: IntervalsActivity[] = replay
    ? (replay.responses.raw_activities?.data ?? [])
    : await intervalsGet<IntervalsActivity[]>(creds, '/activities', {
        oldest,
        newest: `${newest}T23:59:59`,
      });
  logRawResponse('intervals', 'raw_activities', activities);
  const { imported, skipped, failed, removed } =
    await intervalsDataProcessor.processIntervalsActivities(
      userId,
      createdByUserId,
      activities ?? [],
      await hasActiveGarminProvider(userId)
    );

  const wellness: IntervalsWellness[] = replay
    ? (replay.responses.raw_wellness?.data ?? [])
    : await intervalsGet<IntervalsWellness[]>(creds, '/wellness', {
        oldest,
        newest,
        fields: WELLNESS_FIELDS,
      });
  logRawResponse('intervals', 'raw_wellness', wellness);
  const wellnessDays = await intervalsDataProcessor.processIntervalsWellness(
    userId,
    createdByUserId,
    wellness ?? []
  );

  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE external_data_providers
       SET last_sync_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [creds.providerId]
    );
  } finally {
    client.release();
  }

  log(
    'info',
    `[intervalsService] Intervals.icu sync done for user ${userId}: ${imported} activities imported, ${skipped} skipped, ${failed} failed, ${removed} earlier copies removed as Garmin duplicates, ${wellnessDays} wellness days.`
  );
  return {
    success: true,
    activitiesImported: imported,
    activitiesSkipped: skipped,
    activitiesFailed: failed,
    activitiesRemoved: removed,
    wellnessDays,
  };
}

async function getStatus(
  userId: string,
  providerId?: string
): Promise<IntervalsProviderStatus> {
  const row = await findProvider(userId, providerId);
  if (!row) {
    return { connected: false, lastSyncAt: null };
  }
  return {
    connected: row.is_active,
    lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
  };
}

/** Deactivates the provider row; stored credentials are kept for a later reconnect. */
async function disconnect(
  userId: string,
  providerId?: string
): Promise<boolean> {
  const row = await findProvider(userId, providerId);
  if (!row) return false;
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE external_data_providers
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [row.id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export { syncIntervalsData, getStatus, disconnect };
export default { syncIntervalsData, getStatus, disconnect };
