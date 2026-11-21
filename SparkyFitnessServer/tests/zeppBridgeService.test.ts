import { vi, beforeEach, describe, it, expect } from 'vitest';

const queries: Array<{ sql: string; params: unknown[] }> = [];
const providerRow = {
  id: 'p-1',
  user_id: 'user-1',
  base_url: 'http://serve:43921',
  is_active: true,
  last_sync_at: null as Date | null,
  encrypted_app_key: 'enc',
  app_key_iv: 'iv',
  app_key_tag: 'tag',
};

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(async () => ({
    query: vi.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return sql.startsWith('SELECT')
        ? { rows: [providerRow] }
        : { rowCount: 1, rows: [] };
    }),
    release: vi.fn(),
  })),
}));
vi.mock('../security/encryption.js', () => ({
  decrypt: vi.fn().mockResolvedValue('pull-token'),
  ENCRYPTION_KEY: 'key',
}));
vi.mock('../services/providerEndpoint.js', () => ({
  resolveProviderFetchEndpoint: vi.fn().mockResolvedValue({
    url: 'http://serve:43921/',
    fetch: vi.fn(),
  }),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('America/New_York'),
}));
vi.mock(
  '../integrations/zeppbridge/zeppBridgeClient.js',
  async (importActual) => ({
    ...(await importActual<
      typeof import('../integrations/zeppbridge/zeppBridgeClient.js')
    >()),
    fetchZeppBridgeInfo: vi.fn().mockResolvedValue({ version: '3.2.1' }),
    fetchZeppBridgeWorkoutDetail: vi.fn(),
    pullZeppBridgeRecords: vi.fn(),
  })
);
vi.mock('../integrations/zeppbridge/zeppBridgeDataProcessor.js', () => ({
  processZeppBridgeRecords: vi.fn(),
}));
vi.mock('../integrations/zeppbridge/zeppBridgeWorkoutDetail.js', () => ({
  applyWorkoutDetail: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { syncZeppBridgeData } from '../integrations/zeppbridge/zeppBridgeService.js';
import {
  ZeppBridgeError,
  fetchZeppBridgeWorkoutDetail,
  pullZeppBridgeRecords,
} from '../integrations/zeppbridge/zeppBridgeClient.js';
import { processZeppBridgeRecords } from '../integrations/zeppbridge/zeppBridgeDataProcessor.js';
import { applyWorkoutDetail } from '../integrations/zeppbridge/zeppBridgeWorkoutDetail.js';
import {
  addRecords,
  emptyRecordSet,
} from '../integrations/zeppbridge/zeppBridgeTypes.js';

const UID = 'user-1';

const processed = (over: Record<string, unknown> = {}) => ({
  sleepImported: 1,
  workoutsImported: 2,
  workoutsFailed: 0,
  sleepFailed: 0,
  metricDays: 3,
  detailCandidates: [],
  ...over,
});

/** Makes the client hand one span of records to the service. */
function pullsOneSpan() {
  vi.mocked(pullZeppBridgeRecords).mockImplementation(
    async (_c, _from, _to, onSpan) => {
      await onSpan(emptyRecordSet(), { from: _from, to: _to });
    }
  );
}

function fullWorkouts(...ids: string[]) {
  const set = emptyRecordSet();
  addRecords(
    set,
    ids.map((id) => ({
      record_type: 'workout',
      workout_id: id,
      start_time: '2026-11-03T07:30:00+02:00',
    }))
  );
  return set.workouts;
}

describe('syncZeppBridgeData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.length = 0;
    providerRow.last_sync_at = null;
    pullsOneSpan();
    vi.mocked(processZeppBridgeRecords).mockResolvedValue(processed());
  });

  const lastCallRange = () => {
    const [, from, to] = vi.mocked(pullZeppBridgeRecords).mock.calls.at(-1)!;
    return {
      from,
      to,
      days: (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1,
    };
  };
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  it('uses the requested range as it is', async () => {
    await syncZeppBridgeData(UID, UID, 'p-1', '2026-11-01', '2026-11-30');
    expect(pullZeppBridgeRecords).toHaveBeenLastCalledWith(
      expect.anything(),
      '2026-11-01',
      '2026-11-30',
      expect.any(Function)
    );
  });

  it('reads 30 days on the first sync and 3 days after a recent one', async () => {
    await syncZeppBridgeData(UID, UID, 'p-1');
    expect(lastCallRange().days).toBe(30);

    providerRow.last_sync_at = daysAgo(0);
    await syncZeppBridgeData(UID, UID, 'p-1');
    expect(lastCallRange().days).toBe(3);
  });

  it('reaches back to the last sync after an outage, up to 30 days', async () => {
    providerRow.last_sync_at = daysAgo(6);
    await syncZeppBridgeData(UID, UID, 'p-1');
    // From the day before the last sync, so the day it was cut off is re-read.
    expect(lastCallRange().days).toBeGreaterThanOrEqual(7);
    expect(lastCallRange().days).toBeLessThanOrEqual(8);

    providerRow.last_sync_at = daysAgo(200);
    await syncZeppBridgeData(UID, UID, 'p-1');
    expect(lastCallRange().days).toBe(30);
  });

  it('does not move last_sync_at for a manual range that skips days an automatic sync would read', async () => {
    // Last synced 20 days ago; a manual sync of just today would otherwise
    // move the watermark and leave the 19 days between it and today unread.
    providerRow.last_sync_at = daysAgo(20);
    const today = new Date().toISOString().slice(0, 10);
    await syncZeppBridgeData(UID, UID, 'p-1', today, today);
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      false
    );

    // A first-ever sync of one day is not a full first read either.
    providerRow.last_sync_at = null;
    await syncZeppBridgeData(UID, UID, 'p-1', today, today);
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      false
    );

    // A range reaching back past where the automatic one would start does.
    providerRow.last_sync_at = daysAgo(20);
    await syncZeppBridgeData(
      UID,
      UID,
      'p-1',
      new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10),
      today
    );
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      true
    );
  });

  it('does not move last_sync_at for a range that stops before today', async () => {
    await syncZeppBridgeData(UID, UID, 'p-1', '2026-01-01', '2026-01-07');
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      false
    );

    await syncZeppBridgeData(UID, UID, 'p-1');
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      true
    );
  });

  it('fetches detail in one request padded by a day each way', async () => {
    vi.mocked(processZeppBridgeRecords).mockResolvedValue(
      processed({
        detailCandidates: [
          { entryId: 'e-1', workoutId: 'w-1', day: '2026-11-03' },
          { entryId: 'e-2', workoutId: 'w-2', day: '2026-11-03' },
          { entryId: 'e-3', workoutId: 'w-3', day: '2026-11-05' },
        ],
      })
    );
    vi.mocked(fetchZeppBridgeWorkoutDetail).mockResolvedValue(
      fullWorkouts('w-1', 'w-2', 'w-3')
    );
    vi.mocked(applyWorkoutDetail).mockResolvedValue({
      route: true,
      heartRate: true,
    });

    const result = await syncZeppBridgeData(UID, UID, 'p-1');

    expect(fetchZeppBridgeWorkoutDetail).toHaveBeenCalledTimes(1);
    expect(fetchZeppBridgeWorkoutDetail).toHaveBeenCalledWith(
      expect.anything(),
      '2026-11-02',
      '2026-11-06'
    );
    expect(applyWorkoutDetail).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ workoutDetailsImported: 3, failed: 0 });
    // A clean sync moves last_sync_at.
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      true
    );
  });

  it('skips a workout that left ZeppBridge since the summary', async () => {
    vi.mocked(processZeppBridgeRecords).mockResolvedValue(
      processed({
        detailCandidates: [
          { entryId: 'e-1', workoutId: 'gone', day: '2026-11-03' },
        ],
      })
    );
    vi.mocked(fetchZeppBridgeWorkoutDetail).mockResolvedValue(
      fullWorkouts('other')
    );
    const result = await syncZeppBridgeData(UID, UID, 'p-1');
    expect(applyWorkoutDetail).not.toHaveBeenCalled();
    expect(result.failed).toBe(0);
  });

  it('counts a failed detail fetch without holding back last_sync_at', async () => {
    vi.mocked(processZeppBridgeRecords).mockResolvedValue(
      processed({
        detailCandidates: [
          { entryId: 'e-1', workoutId: 'w-1', day: '2026-11-03' },
          { entryId: 'e-2', workoutId: 'w-2', day: '2026-11-03' },
        ],
      })
    );
    vi.mocked(fetchZeppBridgeWorkoutDetail).mockRejectedValue(
      new ZeppBridgeError('busy', 503, 'local_data_unavailable')
    );
    const result = await syncZeppBridgeData(UID, UID, 'p-1');

    // The summary data was imported; only the optional detail is retried by a
    // later sync that covers these workouts.
    expect(result).toMatchObject({ failed: 0, workoutDetailsFailed: 2 });
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      true
    );
  });

  it('holds back last_sync_at when a record itself failed', async () => {
    vi.mocked(processZeppBridgeRecords).mockResolvedValue(
      processed({ workoutsFailed: 1 })
    );
    const result = await syncZeppBridgeData(UID, UID, 'p-1');
    expect(result.failed).toBe(1);
    expect(queries.some((q) => q.sql.includes('last_sync_at = NOW()'))).toBe(
      false
    );
  });

  it('counts a workout whose detail could not be stored, and carries on', async () => {
    vi.mocked(processZeppBridgeRecords).mockResolvedValue(
      processed({
        detailCandidates: [
          { entryId: 'e-1', workoutId: 'w-1', day: '2026-11-03' },
          { entryId: 'e-2', workoutId: 'w-2', day: '2026-11-03' },
        ],
      })
    );
    vi.mocked(fetchZeppBridgeWorkoutDetail).mockResolvedValue(
      fullWorkouts('w-1', 'w-2')
    );
    vi.mocked(applyWorkoutDetail)
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ route: false, heartRate: true });
    const result = await syncZeppBridgeData(UID, UID, 'p-1');

    expect(result).toMatchObject({
      failed: 0,
      workoutDetailsFailed: 1,
      workoutDetailsImported: 1,
    });
  });

  it('stops the whole sync when ZeppBridge rejects the token mid-way', async () => {
    vi.mocked(processZeppBridgeRecords).mockResolvedValue(
      processed({
        detailCandidates: [
          { entryId: 'e-1', workoutId: 'w-1', day: '2026-11-03' },
        ],
      })
    );
    vi.mocked(fetchZeppBridgeWorkoutDetail).mockRejectedValue(
      new ZeppBridgeError('wrong token', 401, 'unauthorized')
    );
    await expect(syncZeppBridgeData(UID, UID, 'p-1')).rejects.toMatchObject({
      status: 401,
    });
  });
});
