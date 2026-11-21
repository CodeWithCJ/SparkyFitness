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
  for (let back = 0; back < DIARY_DAYS_KEPT; back += 1) {
    if (accountGeneration() !== startedUnder) return;
    const day = addDays(today, -back);
    const summary = await apiFetch<DailySummaryApiResponse>({
      endpoint: `/api/daily-summary?date=${encodeURIComponent(day)}`,
      serviceName: 'Offline pack',
      operation: "fetch the day's summary",
    });
    if (accountGeneration() !== startedUnder) return;
    await storeDailySummary(db, serverConfigId, day, summary);
  }
  await db.run(
    `DELETE FROM cache WHERE server_config_id = ? AND collection = ? AND key < ?`,
    [
      serverConfigId,
      CACHE_COLLECTIONS.dailySummary,
      addDays(today, -(DIARY_DAYS_KEPT - 1)),
    ]
  );
}
