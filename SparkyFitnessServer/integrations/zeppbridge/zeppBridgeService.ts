/**
 * ZeppBridge integration service. Pulls Amazfit / Zepp data from the user's own
 * ZeppBridge (`zeppbridge-cli serve`) with the address stored in
 * external_data_providers.base_url and the pull token in app_key (encrypted).
 * SparkyFitness never contacts Zepp and never holds Zepp credentials.
 */
import {
  addDays,
  compareDays,
  instantToDay,
  isDayString,
  todayInZone,
} from '@workspace/shared';
import { getSystemClient } from '../../db/poolManager.js';
import { decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { resolveProviderFetchEndpoint } from '../../services/providerEndpoint.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import {
  ZeppBridgeError,
  fetchZeppBridgeInfo,
  fetchZeppBridgeWorkoutDetail,
  pullZeppBridgeRecords,
  type ZeppBridgeConnection,
} from './zeppBridgeClient.js';
import { processZeppBridgeRecords } from './zeppBridgeDataProcessor.js';
import {
  applyWorkoutDetail,
  type ZeppBridgeDetailCandidate,
} from './zeppBridgeWorkoutDetail.js';

/**
 * A first sync reaches back this far, and so does the furthest catch-up after
 * an outage; otherwise scheduled syncs re-read the last 3 days.
 */
const FIRST_SYNC_DAYS = 30;
const INCREMENTAL_SYNC_DAYS = 3;

interface ProviderRow {
  id: string;
  user_id: string;
  base_url: string | null;
  is_active: boolean;
  last_sync_at: Date | null;
  encrypted_app_key: string | null;
  app_key_iv: string | null;
  app_key_tag: string | null;
}

export interface ZeppBridgeSyncResult {
  success: boolean;
  sleepImported: number;
  workoutsImported: number;
  /** Workouts that got a route, laps or heart rate series this sync. */
  workoutDetailsImported: number;
  /** Workouts whose route or series could not be fetched or stored. The next
   * sync that covers them tries again; they do not hold back last_sync_at. */
  workoutDetailsFailed: number;
  failed: number;
  metricDays: number;
  /** Records of a kind we do not import, or that did not parse. */
  recordsSkipped: number;
}

export interface ZeppBridgeProviderStatus {
  connected: boolean;
  lastSyncAt: string | null;
}

export interface ZeppBridgeTestResult {
  version: string | null;
  recordsVersion: string | null;
}

async function findProvider(
  userId: string,
  providerId?: string
): Promise<ProviderRow | null> {
  const client = await getSystemClient();
  try {
    let query = `SELECT id, user_id, base_url, is_active, last_sync_at,
                        encrypted_app_key, app_key_iv, app_key_tag
                 FROM external_data_providers
                 WHERE user_id = $1 AND provider_type = 'zeppbridge'`;
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

async function getConnection(row: ProviderRow): Promise<ZeppBridgeConnection> {
  if (
    !row.base_url?.trim() ||
    !row.encrypted_app_key ||
    !row.app_key_iv ||
    !row.app_key_tag
  ) {
    throw new ZeppBridgeError(
      'The ZeppBridge URL or pull token is missing for this provider.',
      0,
      'missing_credentials'
    );
  }
  // Checked again on every use: the admin's network toggles and DNS can change
  // after the URL was saved. The guarded fetch never follows a redirect.
  const endpoint = await resolveProviderFetchEndpoint(
    { id: row.id, user_id: row.user_id, base_url: row.base_url },
    'ZeppBridge provider'
  );
  if (!endpoint) {
    throw new ZeppBridgeError(
      'The ZeppBridge URL is not allowed. Use an http(s) address; a private or LAN address needs an admin account or the private-network option.',
      0,
      'url_not_allowed'
    );
  }
  const token = await decrypt(
    row.encrypted_app_key,
    row.app_key_iv,
    row.app_key_tag,
    ENCRYPTION_KEY
  );
  if (!token) {
    throw new ZeppBridgeError(
      'Failed to decrypt the stored ZeppBridge pull token.',
      0,
      'missing_credentials'
    );
  }
  return {
    baseUrl: endpoint.url.replace(/\/+$/, ''),
    token,
    fetch: endpoint.fetch,
  };
}

async function loadConnection(
  userId: string,
  providerId?: string
): Promise<{ row: ProviderRow; connection: ZeppBridgeConnection }> {
  const row = await findProvider(userId, providerId);
  if (!row) {
    throw new ZeppBridgeError(
      'ZeppBridge provider not found.',
      404,
      'provider_not_found'
    );
  }
  return { row, connection: await getConnection(row) };
}

/** Checks the stored URL and token against `GET /v1`. */
async function testZeppBridge(
  userId: string,
  providerId?: string
): Promise<ZeppBridgeTestResult> {
  const { connection } = await loadConnection(userId, providerId);
  const info = await fetchZeppBridgeInfo(connection);
  return {
    version: info.version ?? null,
    recordsVersion: info.records_version ?? null,
  };
}

/**
 * Fetches the route and per-second samples of the workouts that still lack
 * them and stores them. The day range is the candidates' days padded by one day
 * each way, because ZeppBridge files a workout under its own local day, which
 * can differ from the person's. A failed fetch counts against every candidate;
 * a rejected token still stops the whole sync.
 */
async function importWorkoutDetails(
  connection: ZeppBridgeConnection,
  userId: string,
  createdByUserId: string,
  candidates: readonly ZeppBridgeDetailCandidate[],
  total: ZeppBridgeSyncResult
): Promise<void> {
  const days = candidates.map((c) => c.day).filter((d) => isDayString(d));
  if (days.length === 0) return;
  days.sort(compareDays);
  const from = addDays(days[0]!, -1);
  const to = addDays(days[days.length - 1]!, 1);

  let workouts;
  try {
    workouts = await fetchZeppBridgeWorkoutDetail(connection, from, to);
  } catch (error) {
    if (
      error instanceof ZeppBridgeError &&
      (error.status === 401 || error.status === 403)
    ) {
      throw error;
    }
    total.workoutDetailsFailed += candidates.length;
    log(
      'error',
      `[zeppBridgeService] Could not fetch workout detail for ${from} to ${to}: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
  const byId = new Map(workouts.map((w) => [String(w.workout_id), w]));
  for (const candidate of candidates) {
    // A workout that left ZeppBridge since the summary is simply skipped.
    const workout = byId.get(candidate.workoutId);
    if (!workout) continue;
    try {
      const applied = await applyWorkoutDetail(
        userId,
        createdByUserId,
        candidate.entryId,
        workout
      );
      if (applied.route || applied.heartRate) total.workoutDetailsImported += 1;
    } catch (error) {
      total.workoutDetailsFailed += 1;
      log(
        'error',
        `[zeppBridgeService] Error storing detail of workout ${candidate.workoutId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Where a sync without a range starts: the last 3 days, or from the day before
 * the last successful sync when that is earlier (so a gap longer than 3 days is
 * filled), but never further back than MAX_CATCH_UP_DAYS. The first sync, with
 * no last sync, reads 30 days.
 */
function defaultFrom(
  lastSyncAt: Date | null,
  to: string,
  timezone: string
): string {
  const floor = addDays(to, -(FIRST_SYNC_DAYS - 1));
  if (!lastSyncAt) return floor;
  const recent = addDays(to, -(INCREMENTAL_SYNC_DAYS - 1));
  const sinceLast = addDays(instantToDay(lastSyncAt, timezone), -1);
  const from = compareDays(sinceLast, recent) < 0 ? sinceLast : recent;
  return compareDays(from, floor) < 0 ? floor : from;
}

/**
 * Pull sleep, workouts and daily metrics for a calendar-day range (user
 * timezone). Defaults to the last 3 days, or 30 days on the first sync. Whole
 * days are re-read each time, so a day's samples are never written from a
 * partial answer.
 */
async function syncZeppBridgeData(
  userId: string,
  createdByUserId: string,
  providerId?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<ZeppBridgeSyncResult> {
  const { row, connection } = await loadConnection(userId, providerId);
  // Fail early, and with a clear message, if the server is not a usable ZeppBridge.
  await fetchZeppBridgeInfo(connection);

  const timezone = await loadUserTimezone(userId);
  const today = todayInZone(timezone);
  const to = endDate ?? today;
  const from = startDate ?? defaultFrom(row.last_sync_at, to, timezone);
  log(
    'info',
    `[zeppBridgeService] Syncing ZeppBridge for user ${userId} from ${from} to ${to}.`
  );

  const total: ZeppBridgeSyncResult = {
    success: true,
    sleepImported: 0,
    workoutsImported: 0,
    workoutDetailsImported: 0,
    workoutDetailsFailed: 0,
    failed: 0,
    metricDays: 0,
    recordsSkipped: 0,
  };
  await pullZeppBridgeRecords(connection, from, to, async (records) => {
    const result = await processZeppBridgeRecords(
      userId,
      createdByUserId,
      records,
      timezone
    );
    total.sleepImported += result.sleepImported;
    total.workoutsImported += result.workoutsImported;
    total.failed += result.sleepFailed + result.workoutsFailed;
    total.metricDays += result.metricDays;
    total.recordsSkipped += records.skipped + records.invalid;
    await importWorkoutDetails(
      connection,
      userId,
      createdByUserId,
      result.detailCandidates,
      total
    );
  });

  // The scheduler reads last_sync_at to decide when a daily sync is due, so a
  // sync with failed records leaves it alone to be retried next tick.
  // A manual sync of an old range must not mark the recent days as synced.
  const reachesToday = compareDays(to, today) >= 0;
  if (total.failed === 0 && reachesToday) {
    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE external_data_providers
         SET last_sync_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [row.id, userId]
      );
    } finally {
      client.release();
    }
  } else if (total.failed > 0) {
    log(
      'warn',
      `[zeppBridgeService] ZeppBridge sync for user ${userId} failed on ${total.failed} records; last_sync_at not updated.`
    );
  }
  log(
    'info',
    `[zeppBridgeService] ZeppBridge sync done for user ${userId}: ${total.sleepImported} sleep, ${total.workoutsImported} workouts (${total.workoutDetailsImported} with route or heart rate detail), ${total.metricDays} metric days, ${total.failed} failed, ${total.recordsSkipped} skipped.`
  );
  return total;
}

async function getStatus(
  userId: string,
  providerId?: string
): Promise<ZeppBridgeProviderStatus> {
  const row = await findProvider(userId, providerId);
  if (!row) return { connected: false, lastSyncAt: null };
  return {
    connected: row.is_active,
    lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
  };
}

/** Deactivates the provider row; the stored URL and token are kept. */
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

export { syncZeppBridgeData, testZeppBridge, getStatus, disconnect };
export default { syncZeppBridgeData, testZeppBridge, getStatus, disconnect };
