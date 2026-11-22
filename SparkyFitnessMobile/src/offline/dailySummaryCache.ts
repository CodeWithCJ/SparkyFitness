import type { WaterIntakeLogEntry } from '@workspace/shared';
import { apiFetch } from '../services/api/apiClient';
import type { DailySummaryApiResponse } from '../services/api/dailySummaryApi';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { accountGeneration } from './accountGeneration';
import { getCacheRow, putCacheRows } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import { DIARY_DAYS_KEPT } from './diaryDay';
import type { OfflineDb } from './types';

/** The server's summary of a day as this phone last saw it; null if never. */
export async function readSavedDailySummary(
  db: OfflineDb,
  serverConfigId: string,
  date: string
): Promise<DailySummaryApiResponse | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.dailySummary,
    date
  );
  return row ? (row.payload as DailySummaryApiResponse) : null;
}

export function storeDailySummary(
  db: OfflineDb,
  serverConfigId: string,
  date: string,
  summary: DailySummaryApiResponse
): Promise<void> {
  return putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.dailySummary, [
    { key: date, payload: summary },
  ]);
}

/**
 * Saves the server's summary of the last week, so the Diary's totals and goals
 * can be shown with no connection whether or not each day was opened while
 * online. Goes straight to the server, like the rest of the pack. A day that
 * cannot be loaded keeps the copy it had. Days older than the week go.
 */
export async function refreshRecentDailySummaries(
  db: OfflineDb,
  serverConfigId: string,
  today: string = getTodayDate(),
  startedUnder: number = accountGeneration()
): Promise<void> {
  let failed: unknown = null;
  for (let back = 0; back < DIARY_DAYS_KEPT; back += 1) {
    if (accountGeneration() !== startedUnder) return;
    const day = addDays(today, -back);
    // The day's totals and its itemized drinks are separate requests: one
    // failing never keeps the other from updating, and either failure leaves
    // the refresh marked incomplete so the pack tries again.
    try {
      const summary = await apiFetch<DailySummaryApiResponse>({
        endpoint: `/api/daily-summary?date=${encodeURIComponent(day)}`,
        serviceName: 'Offline pack',
        operation: "fetch the day's summary",
      });
      if (accountGeneration() !== startedUnder) return;
      await storeDailySummary(db, serverConfigId, day, summary);
    } catch (error) {
      failed = error;
    }
    try {
      // The day's itemized drinks, so the latest one can be taken off offline.
      const waterLog = await apiFetch<WaterIntakeLogEntry[]>({
        endpoint: `/api/v2/measurements/water-intake/${encodeURIComponent(day)}/log`,
        serviceName: 'Offline pack',
        operation: "fetch the day's drinks",
      });
      if (accountGeneration() !== startedUnder) return;
      await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.waterLog, [
        { key: day, payload: waterLog },
      ]);
    } catch (error) {
      failed = error;
    }
  }
  for (const collection of [
    CACHE_COLLECTIONS.dailySummary,
    CACHE_COLLECTIONS.waterLog,
  ]) {
    await db.run(
      `DELETE FROM cache WHERE server_config_id = ? AND collection = ? AND key < ?`,
      [serverConfigId, collection, addDays(today, -(DIARY_DAYS_KEPT - 1))]
    );
  }
  // Told to the caller once every day has had its turn, so the pack knows the
  // totals did not fully refresh and tries again.
  if (failed) throw failed;
}
