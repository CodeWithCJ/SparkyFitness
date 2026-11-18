import { apiFetch } from '../../src/services/api/apiClient';
import { getCacheRow, putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import {
  DIARY_DAYS_KEPT,
  refreshRecentDiaryDays,
} from '../../src/offline/diaryDay';
import { subscribeDiaryDaySaved } from '../../src/offline/events';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
  normalizeUrl: (url: string) => url,
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const TODAY = '2026-11-17';
const SERVER = 's1';

function daySession(id: string, entryDate: string) {
  return { type: 'preset', id, entry_date: entryDate, name: `W ${id}` };
}

async function savedDay(db: OfflineDb, day: string) {
  const row = await getCacheRow(db, SERVER, CACHE_COLLECTIONS.diaryDay, day);
  return row ? (row.payload as { id: string }[]) : null;
}

describe('refreshRecentDiaryDays', () => {
  let db: OfflineDb;

  beforeEach(async () => {
    db = await createTestDb();
    mockApiFetch.mockReset();
  });

  it('saves each of the last seven days, empty days included', async () => {
    mockApiFetch.mockImplementation(async ({ endpoint }) => {
      const day = new URL(`http://x${endpoint}`).searchParams.get(
        'selectedDate'
      );
      return day === TODAY ? [daySession('a', TODAY)] : [];
    });

    await refreshRecentDiaryDays(db, SERVER, TODAY);

    expect(mockApiFetch).toHaveBeenCalledTimes(DIARY_DAYS_KEPT);
    expect((await savedDay(db, TODAY))?.map((s) => s.id)).toEqual(['a']);
    expect(await savedDay(db, '2026-11-11')).toEqual([]);
    expect(await savedDay(db, '2026-11-10')).toBeNull();
  });

  it('removes days older than the week', async () => {
    await putCacheRows(db, SERVER, CACHE_COLLECTIONS.diaryDay, [
      { key: '2026-11-10', payload: [daySession('old', '2026-11-10')] },
      { key: '2026-11-11', payload: [daySession('edge', '2026-11-11')] },
    ]);
    mockApiFetch.mockResolvedValue([]);

    await refreshRecentDiaryDays(db, SERVER, TODAY);

    expect(await savedDay(db, '2026-11-10')).toBeNull();
    expect(await savedDay(db, '2026-11-11')).toEqual([]);
  });

  it('replaces a day that changed on the server, deletions included', async () => {
    await putCacheRows(db, SERVER, CACHE_COLLECTIONS.diaryDay, [
      { key: TODAY, payload: [daySession('gone', TODAY)] },
    ]);
    mockApiFetch.mockResolvedValue([]);

    await refreshRecentDiaryDays(db, SERVER, TODAY);

    expect(await savedDay(db, TODAY)).toEqual([]);
  });

  it('keeps the copy it had when the server stops answering', async () => {
    await putCacheRows(db, SERVER, CACHE_COLLECTIONS.diaryDay, [
      { key: '2026-11-15', payload: [daySession('kept', '2026-11-15')] },
    ]);
    mockApiFetch
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('offline'));

    await expect(refreshRecentDiaryDays(db, SERVER, TODAY)).rejects.toThrow(
      'offline'
    );

    expect((await savedDay(db, '2026-11-15'))?.map((s) => s.id)).toEqual([
      'kept',
    ]);
  });

  it('tells the offline view to read again', async () => {
    mockApiFetch.mockResolvedValue([]);
    const listener = jest.fn();
    const stop = subscribeDiaryDaySaved(listener);

    await refreshRecentDiaryDays(db, SERVER, TODAY);
    stop();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
