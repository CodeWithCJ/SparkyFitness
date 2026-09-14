/**
 * Liftosaur integration service. Talks to the Liftosaur REST API v1
 * (https://www.liftosaur.com/api/v1) using the user's Liftosaur API key
 * (`lftsk_...`, stored encrypted in external_data_providers.encrypted_app_key),
 * parses the returned Liftohistory text records, and persists them through
 * liftosaurDataProcessor. Mirrors the Hevy service
 * (integrations/hevy/hevyService.ts) for provider lookup, pagination, status,
 * and last-sync bookkeeping.
 */
import axios, { AxiosError } from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';
import { logRawResponse } from '../../utils/diagnosticLogger.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import { dayToUtcRange, instantToDay } from '@workspace/shared';
import { parseLiftohistory } from './liftohistoryParser.js';
import liftosaurDataProcessor from './liftosaurDataProcessor.js';
import {
  LiftosaurApiEnvelope,
  LiftosaurHistoryResponseData,
  LiftosaurProviderStatus,
  LiftosaurSyncResult,
} from './liftosaurTypes.js';
import {
  importMeasurementsFromLiftosaur,
  exportMeasurementsToLiftosaur,
} from './liftosaurMeasurementsService.js';
import {
  exportWorkoutsToLiftosaur,
  getValidatedLiftosaurBaseUrl,
} from './liftosaurWorkoutExportService.js';

const HISTORY_PAGE_SIZE = 200; // Liftosaur API cap

interface ProviderRow {
  id: string;
  is_active: boolean;
  last_sync_at: Date | null;
  encrypted_app_key: string | null;
  app_key_iv: string | null;
  app_key_tag: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve the Liftosaur API key for a provider instance.
 */
async function getLiftosaurApiKey(
  userId: string,
  providerId?: string
): Promise<string> {
  const client = await getSystemClient();
  try {
    let query = `SELECT encrypted_app_key, app_key_iv, app_key_tag
                 FROM external_data_providers
                 WHERE user_id = $1 AND provider_type = 'liftosaur'`;
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
    if (result.rows.length === 0) {
      throw new Error('Liftosaur provider not found.');
    }
    const { encrypted_app_key, app_key_iv, app_key_tag } = result.rows[0]!;
    if (!encrypted_app_key || !app_key_iv || !app_key_tag) {
      throw new Error('Liftosaur API key is missing for this provider.');
    }
    const decrypted = await decrypt(
      encrypted_app_key,
      app_key_iv,
      app_key_tag,
      ENCRYPTION_KEY
    );
    if (typeof decrypted !== 'string' || decrypted === '') {
      throw new Error('Failed to decrypt the stored Liftosaur API key.');
    }
    return decrypted;
  } finally {
    client.release();
  }
}

/**
 * Resolve a Liftosaur provider id for a user (prefers active rows).
 */
async function getLiftosaurProviderId(userId: string): Promise<string | null> {
  const client = await getSystemClient();
  try {
    const result = (await client.query(
      `SELECT id FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'liftosaur'
       ORDER BY is_active DESC, created_at DESC LIMIT 1`,
      [userId]
    )) as { rows: { id: string }[] };
    return result.rows[0]?.id ?? null;
  } finally {
    client.release();
  }
}

/**
 * Fetch one page of history records from the Liftosaur API.
 */
async function getHistoryPage(
  userId: string,
  providerId: string,
  params: {
    startDate?: string;
    endDate?: string;
    cursor?: number;
  }
): Promise<LiftosaurHistoryResponseData> {
  const apiKey = await getLiftosaurApiKey(userId, providerId);
  try {
    const response = await axios.get<
      LiftosaurApiEnvelope<LiftosaurHistoryResponseData>
    >(`${getValidatedLiftosaurBaseUrl()}/api/v1/history`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        ...(params.startDate ? { startDate: params.startDate } : {}),
        ...(params.endDate ? { endDate: params.endDate } : {}),
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        limit: HISTORY_PAGE_SIZE,
      },
      timeout: 10000,
    });
    logRawResponse(
      'liftosaur',
      `raw_history_page${params.cursor ?? ''}`,
      response.data
    );
    return response.data.data ?? { records: [], hasMore: false };
  } catch (error) {
    log(
      'error',
      `Error fetching Liftosaur history for user ${userId}: ${errorMessage(error)}`
    );
    throw error;
  }
}

/**
 * Extract a machine-readable reason from a Liftosaur API error so routes can
 * surface friendly messages (invalid key vs. missing subscription).
 */
export function liftosaurErrorReason(error: unknown): {
  status: number;
  code: string;
} {
  const axiosError = error as AxiosError<{ error?: { code?: string } }>;
  const status = axiosError?.response?.status ?? 0;
  const code = axiosError?.response?.data?.error?.code ?? '';
  return { status, code };
}

/**
 * Synchronize Liftosaur data for a user.
 *
 * @param fullSync  Fetch the entire history (ignores the 7-day window).
 * @param providerId Optional provider id (recommended).
 * @param startDate Optional calendar-day start (YYYY-MM-DD, user timezone).
 * @param endDate   Optional calendar-day end (YYYY-MM-DD, user timezone).
 */
async function syncLiftosaurData(
  userId: string,
  createdByUserId: string,
  fullSync = false,
  providerId?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<LiftosaurSyncResult> {
  const tz = await loadUserTimezone(userId);
  log(
    'info',
    `Starting Liftosaur ${fullSync ? 'FULL' : 'INCREMENTAL'} synchronization for user ${userId}${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}...`
  );

  const resolvedProviderId =
    providerId ?? (await getLiftosaurProviderId(userId));
  if (!resolvedProviderId) {
    throw new Error('Liftosaur provider not found.');
  }

  // Calendar-day ranges are converted to UTC instants in the user's timezone so
  // the Liftosaur API filters by the same day the user sees in the UI.
  let startInstant: string | undefined;
  let endInstant: string | undefined;
  if (startDate && endDate) {
    const range = dayRangeToInstants(startDate, endDate, tz);
    startInstant = range.start;
    endInstant = range.end;
  }

  // Incremental syncs stop once a fetched page's newest record predates the
  // 7-day window (mirrors the Hevy service's stop condition).
  const cutoffMs = fullSync ? 0 : Date.now() - 7 * 24 * 60 * 60 * 1000;

  const allWorkouts = [];
  let skippedCount = 0;
  let cursor: number | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await getHistoryPage(userId, resolvedProviderId, {
      startDate: startInstant,
      endDate: endInstant,
      cursor,
    });
    const records = page.records ?? [];
    if (records.length === 0) {
      break;
    }

    let newestWorkoutDate = 0;
    for (const record of records) {
      const parsed = parseLiftohistory(record.text);
      for (const err of parsed.errors) {
        log(
          'warn',
          `[liftosaurService] Record ${record.id} line ${err.line}: ${err.message}`
        );
        skippedCount += 1;
      }
      for (const workout of parsed.workouts) {
        allWorkouts.push(workout);
        const workoutMs = new Date(workout.date).getTime();
        if (workoutMs > newestWorkoutDate) {
          newestWorkoutDate = workoutMs;
        }
      }
    }

    // Records come back newest-first; in incremental mode (no explicit date
    // range) stop once the newest workout on this page predates the window.
    const withinWindow =
      fullSync || startInstant !== undefined || newestWorkoutDate >= cutoffMs;
    hasMore = !!page.hasMore && withinWindow;
    cursor = page.nextCursor;
  }

  log(
    'debug',
    `[liftosaurService] Parsed ${allWorkouts.length} workouts for user ${userId}.`
  );
  if (allWorkouts.length > 0) {
    await liftosaurDataProcessor.processLiftosaurWorkouts(
      userId,
      createdByUserId,
      allWorkouts,
      tz
    );
  }
  const workoutsImported = allWorkouts.length;

  const apiKey = await getLiftosaurApiKey(userId, resolvedProviderId);

  // 2. Ingest measurements from Liftosaur into SparkyFitness
  let measurementsImported = 0;
  try {
    measurementsImported = await importMeasurementsFromLiftosaur(
      userId,
      createdByUserId,
      apiKey,
      tz,
      cutoffMs
    );
    log(
      'info',
      `[liftosaurService] Imported ${measurementsImported} measurement records for user ${userId}.`
    );
  } catch (mErr) {
    log(
      'error',
      `[liftosaurService] Error importing measurements for user ${userId}: ${errorMessage(mErr)}`
    );
  }

  const exportStartDate =
    startDate ?? (fullSync ? undefined : instantToDay(new Date(cutoffMs), tz));
  const exportEndDate = endDate;

  // 3. Export non-Liftosaur workouts to Liftosaur
  let workoutsExported = 0;
  try {
    workoutsExported = await exportWorkoutsToLiftosaur(
      userId,
      apiKey,
      tz,
      exportStartDate,
      exportEndDate
    );
    log(
      'info',
      `[liftosaurService] Exported ${workoutsExported} workouts for user ${userId}.`
    );
  } catch (wErr) {
    log(
      'error',
      `[liftosaurService] Error exporting workouts for user ${userId}: ${errorMessage(wErr)}`
    );
  }

  // 4. Export SparkyFitness measurements to Liftosaur
  let measurementsExported = 0;
  try {
    measurementsExported = await exportMeasurementsToLiftosaur(
      userId,
      apiKey,
      tz,
      exportStartDate,
      exportEndDate
    );
    log(
      'info',
      `[liftosaurService] Exported ${measurementsExported} measurements for user ${userId}.`
    );
  } catch (mExpErr) {
    log(
      'error',
      `[liftosaurService] Error exporting measurements for user ${userId}: ${errorMessage(mExpErr)}`
    );
  }

  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE external_data_providers
       SET last_sync_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [resolvedProviderId]
    );
  } finally {
    client.release();
  }

  const totalProcessed =
    workoutsImported +
    measurementsImported +
    workoutsExported +
    measurementsExported;

  log(
    'info',
    `Liftosaur bidirectional synchronization completed for user ${userId}. Total processed: ${totalProcessed} (workouts: +${workoutsImported}/-${workoutsExported}, measurements: +${measurementsImported}/-${measurementsExported})`
  );
  return {
    success: true,
    processedCount: totalProcessed,
    parsedCount: workoutsImported,
    skippedCount,
    workoutsImported,
    workoutsExported,
    measurementsImported,
    measurementsExported,
    source: 'live_api',
  };
}

/**
 * Connection status for a user's Liftosaur provider.
 */
async function getStatus(
  userId: string,
  providerId?: string
): Promise<LiftosaurProviderStatus> {
  const client = await getSystemClient();
  try {
    let query = `SELECT is_active, last_sync_at
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'liftosaur'`;
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
    const row = result.rows[0];
    if (!row) {
      return { connected: false, lastSyncAt: null };
    }
    return {
      connected: row.is_active,
      lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
    };
  } finally {
    client.release();
  }
}

/**
 * Disconnect a user's Liftosaur provider: revokes the API key usage by
 * deactivating the provider row (the stored key is retained so a later
 * reconnect can re-enable it without re-entering credentials).
 */
async function disconnect(
  userId: string,
  providerId?: string
): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const resolvedProviderId =
      providerId ?? (await getLiftosaurProviderId(userId));
    if (!resolvedProviderId) {
      return false;
    }
    const result = await client.query(
      `UPDATE external_data_providers
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [resolvedProviderId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

function dayRangeToInstants(
  startDate: string,
  endDate: string,
  tz: string
): { start: string; end: string } {
  const { start } = dayToUtcRange(startDate, tz);
  const { end } = dayToUtcRange(endDate, tz);
  return { start: start.toISOString(), end: end.toISOString() };
}

export { getLiftosaurApiKey };
export { getLiftosaurProviderId };
export { syncLiftosaurData };
export { getStatus };
export { disconnect };
export default {
  getLiftosaurApiKey,
  getLiftosaurProviderId,
  syncLiftosaurData,
  getStatus,
  disconnect,
};
