import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { runBackfill, type BackfillProgress } from '../../src/services/backfillService';
import {
  tryClaimAutoSync,
  isSyncClaimed,
  isBackfillRunning,
  markSyncInFlight,
} from '../../src/services/autoSyncCoordinator';
import {
  loadBackfillCheckpoint,
  saveBackfillCheckpoint,
  type BackfillCheckpoint,
} from '../../src/services/backfillCheckpoint';
import { refreshHealthSyncCache } from '../../src/hooks/refreshHealthSyncCache';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/api/healthDataApi', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  saveLastSyncedTime: jest.fn(),
}));

jest.mock('../../src/services/shared/healthSyncEngine', () => ({
  collectHealthData: jest.fn(),
}));

jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));

jest.mock('../../src/hooks/refreshHealthSyncCache', () => ({
  refreshHealthSyncCache: jest.fn(),
}));

jest.mock('../../src/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { id: 'steps', recordType: 'Steps', preferenceKey: 'syncStepsEnabled', label: 'Steps', permissions: [{ accessType: 'read', recordType: 'Steps' }] },
    { id: 'weight', recordType: 'Weight', preferenceKey: 'syncWeightEnabled', label: 'Weight', permissions: [{ accessType: 'read', recordType: 'Weight' }] },
    { id: 'heartRate', recordType: 'HeartRate', preferenceKey: 'syncHeartRateEnabled', label: 'Heart Rate', permissions: [{ accessType: 'read', recordType: 'HeartRate' }] },
  ],
}));

jest.mock('../../src/services/healthConnectService', () => {
  const readEarliestRecord = jest.fn();
  return {
    loadHealthPreference: jest.fn(),
    ensureHistoryReadPermission: jest.fn(),
    requestHealthPermissions: jest.fn(),
    resetDatabaseInaccessibleCount: jest.fn(),
    getDatabaseInaccessibleCount: jest.fn().mockReturnValue(0),
    healthReadProvider: { readEarliestRecord },
    readEarliestRecord,
  };
});

type MetricLike = { id: string; recordType: string; preferenceKey: string; label: string };
type WindowsLike = { sessionStart: Date; aggregatedStart: Date; end: Date };

const api = require('../../src/services/api/healthDataApi') as { syncHealthData: jest.Mock };
const storage = require('../../src/services/storage') as {
  getActiveServerConfig: jest.Mock;
  saveLastSyncedTime: jest.Mock;
};
const engine = require('../../src/services/shared/healthSyncEngine') as { collectHealthData: jest.Mock };
const healthService = require('../../src/services/healthConnectService') as {
  loadHealthPreference: jest.Mock;
  ensureHistoryReadPermission: jest.Mock;
  requestHealthPermissions: jest.Mock;
  resetDatabaseInaccessibleCount: jest.Mock;
  getDatabaseInaccessibleCount: jest.Mock;
  readEarliestRecord: jest.Mock;
};
const mockRefreshHealthSyncCache = refreshHealthSyncCache as jest.MockedFunction<typeof refreshHealthSyncCache>;

// All fixture dates are LOCAL so window math is timezone-independent.
// "Now" = 2026-08-03 15:00 local → endEdge = Aug 3 local midnight.
// Steps history starts Jun 20 → floor Jun 20; windows: [Jul 4, Aug 3), [Jun 20, Jul 4).
const NOW = new Date(2026, 7, 3, 15, 0, 0);
const AUG_3 = new Date(2026, 7, 3, 0, 0, 0, 0);
const JUL_4 = new Date(2026, 6, 4, 0, 0, 0, 0);
const JUN_20 = new Date(2026, 5, 20, 0, 0, 0, 0);
const STEPS_EARLIEST = new Date(2026, 5, 20, 10, 0).toISOString();
const WEIGHT_EARLIEST = new Date(2026, 6, 20, 8, 0).toISOString();

const runOpts = (overrides: { shouldCancel?: () => boolean; onProgress?: (p: BackfillProgress) => void } = {}) => ({
  shouldCancel: overrides.shouldCancel ?? (() => false),
  onProgress: overrides.onProgress ?? jest.fn(),
});

const inProgressCheckpoint = (overrides: Partial<BackfillCheckpoint> = {}): BackfillCheckpoint => ({
  version: 1,
  status: 'in-progress',
  endEdge: AUG_3.toISOString(),
  cursor: JUL_4.toISOString(),
  floor: JUN_20.toISOString(),
  earliestByRecordType: { Steps: STEPS_EARLIEST },
  enabledRecordTypes: ['Steps'],
  recordsUploaded: 5,
  startedAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...overrides,
});

describe('runBackfill', () => {
  let appStateHandler: ((state: string) => void) | null;
  let removeSubscription: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    await AsyncStorage.clear();

    appStateHandler = null;
    removeSubscription = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      appStateHandler = handler as unknown as (state: string) => void;
      return { remove: removeSubscription } as ReturnType<typeof AppState.addEventListener>;
    });

    storage.getActiveServerConfig.mockResolvedValue({ id: 'server-1' });
    healthService.loadHealthPreference.mockImplementation((key: string) =>
      Promise.resolve(key === 'syncStepsEnabled' || key === 'syncWeightEnabled'),
    );
    healthService.ensureHistoryReadPermission.mockResolvedValue(true);
    healthService.requestHealthPermissions.mockResolvedValue(true);
    healthService.getDatabaseInaccessibleCount.mockReturnValue(0);
    healthService.readEarliestRecord.mockImplementation(async (metric: MetricLike) => {
      if (metric.recordType === 'Steps') return { records: [{ startTime: STEPS_EARLIEST }] };
      if (metric.recordType === 'Weight') return { records: [{ startTime: WEIGHT_EARLIEST }] };
      return { records: [] };
    });
    engine.collectHealthData.mockImplementation(
      async (_provider: unknown, metrics: MetricLike[], windows: WindowsLike) =>
        metrics.map(metric => ({
          metric,
          status: 'fulfilled' as const,
          data: [{ type: metric.recordType, date: windows.end.toISOString() }],
          error: undefined,
        })),
    );
    api.syncHealthData.mockImplementation(async (payload: unknown[]) => ({
      recordsSent: payload.length,
      recordErrors: [],
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('happy path: probes, walks windows newest-first, uploads per window, completes', async () => {
    const onProgress = jest.fn();

    const result = await runBackfill(runOpts({ onProgress }));

    expect(result.outcome).toBe('completed');
    // Window 1 [Jul 4, Aug 3): Steps + Weight = 2 records. Window 2 [Jun 20, Jul 4):
    // Steps only (Weight history starts Jul 20) = 1 record.
    expect(result.recordsUploaded).toBe(3);

    expect(engine.collectHealthData).toHaveBeenCalledTimes(2);
    const firstWindows = engine.collectHealthData.mock.calls[0][2] as WindowsLike;
    const secondWindows = engine.collectHealthData.mock.calls[1][2] as WindowsLike;
    expect(firstWindows.sessionStart).toEqual(JUL_4);
    expect(firstWindows.aggregatedStart).toEqual(JUL_4);
    expect(firstWindows.end).toEqual(AUG_3);
    expect(secondWindows.sessionStart).toEqual(JUN_20);
    expect(secondWindows.end).toEqual(JUL_4);

    const firstMetrics = (engine.collectHealthData.mock.calls[0][1] as MetricLike[]).map(m => m.recordType);
    const secondMetrics = (engine.collectHealthData.mock.calls[1][1] as MetricLike[]).map(m => m.recordType);
    expect(firstMetrics).toEqual(['Steps', 'Weight']);
    expect(secondMetrics).toEqual(['Steps']);

    // One window = one upload; contiguous spans only.
    expect(api.syncHealthData).toHaveBeenCalledTimes(2);
    expect(api.syncHealthData.mock.calls[0][0]).toHaveLength(2);
    expect(api.syncHealthData.mock.calls[1][0]).toHaveLength(1);

    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.status).toBe('done');
    expect(saved?.recordsUploaded).toBe(3);
    expect(saved?.enabledRecordTypes).toEqual(['Steps', 'Weight']);

    // Backfill NEVER stamps the normal sync cursor.
    expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    expect(mockRefreshHealthSyncCache).toHaveBeenCalled();

    expect(onProgress.mock.calls[0][0].phase).toBe('probing');
    const lastProgress = onProgress.mock.calls[onProgress.mock.calls.length - 1][0] as BackfillProgress;
    expect(lastProgress.totalDays).toBe(44);
    expect(lastProgress.importedDays).toBe(44);

    // Claim, flag, and AppState listener all released.
    expect(isSyncClaimed()).toBe(false);
    expect(isBackfillRunning()).toBe(false);
    expect(removeSubscription).toHaveBeenCalled();
  });

  test('returns no-server without claiming when no config is active', async () => {
    storage.getActiveServerConfig.mockResolvedValue(null);

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('no-server');
    expect(isSyncClaimed()).toBe(false);
  });

  test('returns already-running while another sync holds the claim', async () => {
    const release = tryClaimAutoSync();
    try {
      const result = await runBackfill(runOpts());
      expect(result.outcome).toBe('already-running');
    } finally {
      release?.();
    }
  });

  test('returns already-running while a sync without the claim is in flight', async () => {
    // The OS background task and manual Sync Now run without the auto-sync
    // claim; the in-flight marker is the only thing excluding them.
    const syncDone = markSyncInFlight();
    try {
      const result = await runBackfill(runOpts());

      expect(result.outcome).toBe('already-running');
      expect(healthService.readEarliestRecord).not.toHaveBeenCalled();
      expect(engine.collectHealthData).not.toHaveBeenCalled();
      expect(api.syncHealthData).not.toHaveBeenCalled();
      // The refused run must not leave the claim held.
      expect(isSyncClaimed()).toBe(false);
    } finally {
      syncDone();
    }
  });

  test('returns no-metrics when nothing is enabled', async () => {
    healthService.loadHealthPreference.mockResolvedValue(false);

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('no-metrics');
    expect(healthService.readEarliestRecord).not.toHaveBeenCalled();
    expect(isSyncClaimed()).toBe(false);
  });

  test('returns no-history when every probe finds nothing, without persisting a checkpoint', async () => {
    healthService.readEarliestRecord.mockResolvedValue({ records: [] });

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('no-history');
    expect(engine.collectHealthData).not.toHaveBeenCalled();
    await expect(loadBackfillCheckpoint('server-1')).resolves.toBeNull();
  });

  test('a quota error during probing stops immediately without a probe retry', async () => {
    healthService.readEarliestRecord.mockResolvedValue({ records: [], error: 'API call quota exceeded' });

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('quota');
    expect(healthService.readEarliestRecord).toHaveBeenCalledTimes(1);
  });

  test('a transient probe error is retried once and the run proceeds', async () => {
    healthService.readEarliestRecord
      .mockResolvedValueOnce({ records: [], error: 'transient' })
      .mockResolvedValueOnce({ records: [{ startTime: STEPS_EARLIEST }] })
      .mockResolvedValue({ records: [] });

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
  });

  test('a persistent probe error stops the run without guessing a floor', async () => {
    healthService.readEarliestRecord.mockResolvedValue({ records: [], error: 'probe broke' });

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('window-failed');
    expect(result.error).toBe('probe broke');
    expect(healthService.readEarliestRecord).toHaveBeenCalledTimes(2);
    await expect(loadBackfillCheckpoint('server-1')).resolves.toBeNull();
  });

  test('a quota error in a window stops without retrying or advancing', async () => {
    engine.collectHealthData.mockImplementation(
      async (_provider: unknown, metrics: MetricLike[]) =>
        metrics.map(metric => ({
          metric,
          status: 'fulfilled' as const,
          data: [],
          error: 'Health Connect API call quota exceeded',
        })),
    );

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('quota');
    expect(engine.collectHealthData).toHaveBeenCalledTimes(1);
    expect(api.syncHealthData).not.toHaveBeenCalled();

    // Checkpoint survives with the cursor unmoved so tomorrow resumes here.
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.status).toBe('in-progress');
    expect(saved?.cursor).toBe(AUG_3.toISOString());
  });

  test('a failing window is retried once, then stops without advancing', async () => {
    engine.collectHealthData.mockImplementation(
      async (_provider: unknown, metrics: MetricLike[]) =>
        metrics.map(metric => ({ metric, status: 'rejected' as const, data: [], error: 'read exploded' })),
    );

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('window-failed');
    expect(engine.collectHealthData).toHaveBeenCalledTimes(2);
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.cursor).toBe(AUG_3.toISOString());
  });

  test('a transient window error recovers on the retry', async () => {
    let calls = 0;
    engine.collectHealthData.mockImplementation(
      async (_provider: unknown, metrics: MetricLike[], windows: WindowsLike) => {
        calls++;
        if (calls === 1) {
          return metrics.map(metric => ({ metric, status: 'rejected' as const, data: [], error: 'flaky' }));
        }
        return metrics.map(metric => ({
          metric,
          status: 'fulfilled' as const,
          data: [{ type: metric.recordType, date: windows.end.toISOString() }],
          error: undefined,
        }));
      },
    );

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
    expect(engine.collectHealthData).toHaveBeenCalledTimes(3);
  });

  test('device-locked reads stop the run even when outcomes look clean', async () => {
    // Probes succeed; the device locks during the first window's reads.
    let locked = false;
    healthService.getDatabaseInaccessibleCount.mockImplementation(() => (locked ? 2 : 0));
    engine.collectHealthData.mockImplementation(
      async (_provider: unknown, metrics: MetricLike[], windows: WindowsLike) => {
        locked = true;
        return metrics.map(metric => ({
          metric,
          status: 'fulfilled' as const,
          data: [{ type: metric.recordType, date: windows.end.toISOString() }],
          error: undefined,
        }));
      },
    );

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('device-locked');
    expect(api.syncHealthData).not.toHaveBeenCalled();
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.cursor).toBe(AUG_3.toISOString());
  });

  test('an app-inactive transition mid-window discards its results without advancing', async () => {
    engine.collectHealthData.mockImplementation(
      async (_provider: unknown, metrics: MetricLike[], windows: WindowsLike) => {
        // Locked-mid-window reads can return silently empty; the AppState flag is
        // the only signal. Simulate the app leaving 'active' during the read.
        appStateHandler?.('background');
        return metrics.map(metric => ({
          metric,
          status: 'fulfilled' as const,
          data: [{ type: metric.recordType, date: windows.end.toISOString() }],
          error: undefined,
        }));
      },
    );

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('app-inactive');
    expect(api.syncHealthData).not.toHaveBeenCalled();
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.cursor).toBe(AUG_3.toISOString());
  });

  test('a server switch at a window boundary stops without advancing further', async () => {
    storage.getActiveServerConfig
      .mockResolvedValueOnce({ id: 'server-1' }) // run entry
      .mockResolvedValueOnce({ id: 'server-1' }) // window 1 boundary
      .mockResolvedValueOnce({ id: 'server-1' }) // window 1 pre-upload
      .mockResolvedValue({ id: 'server-2' }); // window 2 boundary onwards

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('server-changed');
    expect(api.syncHealthData).toHaveBeenCalledTimes(1);
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.status).toBe('in-progress');
    expect(saved?.cursor).toBe(JUL_4.toISOString());
  });

  test('a server switch caught right before an upload discards that window', async () => {
    storage.getActiveServerConfig
      .mockResolvedValueOnce({ id: 'server-1' }) // run entry
      .mockResolvedValueOnce({ id: 'server-1' }) // window 1 boundary
      .mockResolvedValue({ id: 'server-2' }); // window 1 pre-upload onwards

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('server-changed');
    expect(api.syncHealthData).not.toHaveBeenCalled();
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.cursor).toBe(AUG_3.toISOString());
  });

  test('cancel between windows keeps the finished window and returns cancelled', async () => {
    // Cancel lands at the first window boundary AFTER an upload — the in-flight
    // window finishes; the next one never starts.
    const result = await runBackfill(runOpts({
      shouldCancel: () => api.syncHealthData.mock.calls.length >= 1,
    }));

    expect(result.outcome).toBe('cancelled');
    expect(result.recordsUploaded).toBe(2);
    expect(api.syncHealthData).toHaveBeenCalledTimes(1);
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.status).toBe('in-progress');
    expect(saved?.cursor).toBe(JUL_4.toISOString());
  });

  test('resume skips probes and uses the frozen metric set over current toggles', async () => {
    await saveBackfillCheckpoint('server-1', inProgressCheckpoint());

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
    expect(healthService.readEarliestRecord).not.toHaveBeenCalled();
    expect(healthService.loadHealthPreference).not.toHaveBeenCalled();

    // Only the frozen Steps set runs, even though Weight is currently enabled.
    expect(engine.collectHealthData).toHaveBeenCalledTimes(1);
    const metricsUsed = (engine.collectHealthData.mock.calls[0][1] as MetricLike[]).map(m => m.recordType);
    expect(metricsUsed).toEqual(['Steps']);

    // recordsUploaded accumulates on top of the checkpoint's prior total.
    expect(result.recordsUploaded).toBe(6);
  });

  test('resume re-aligns checkpoint instants after a timezone change, rounding the cursor up', async () => {
    // Stored instants are midnights of a timezone 7 hours ahead of the current
    // one. The cursor bounds the already-covered span, so it must round UP to
    // Jul 5 and re-import the seam day; rounding it down to Jul 4 would mark the
    // never-imported 7 hours of Jul 4 as covered and silently skip them.
    const skewMs = 7 * 60 * 60 * 1000;
    await saveBackfillCheckpoint('server-1', inProgressCheckpoint({
      endEdge: new Date(AUG_3.getTime() + skewMs).toISOString(),
      cursor: new Date(JUL_4.getTime() + skewMs).toISOString(),
      floor: new Date(JUN_20.getTime() + skewMs).toISOString(),
    }));

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
    expect(engine.collectHealthData).toHaveBeenCalledTimes(1);
    const windows = engine.collectHealthData.mock.calls[0][2] as WindowsLike;
    expect(windows.sessionStart).toEqual(JUN_20);
    expect(windows.end).toEqual(new Date(2026, 6, 5, 0, 0, 0, 0));
  });

  test('a window with a very large record set uploads without hitting the argument limit', async () => {
    engine.collectHealthData.mockImplementation(
      async (_provider: unknown, metrics: MetricLike[]) => [{
        metric: metrics[0],
        status: 'fulfilled' as const,
        data: Array.from({ length: 200_000 }, (_, i) => ({ type: 'Steps', date: String(i) })),
        error: undefined,
      }],
    );

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
    expect(api.syncHealthData.mock.calls[0][0]).toHaveLength(200_000);
  });

  test('server-rejected records are not counted as written', async () => {
    api.syncHealthData.mockImplementation(async (payload: unknown[]) => ({
      recordsSent: payload.length,
      recordErrors: [{ error: 'invalid entry' }],
    }));

    const result = await runBackfill(runOpts());

    // Rejections never hold the checkpoint — the run still completes.
    expect(result.outcome).toBe('completed');
    // 3 records sent across 2 windows, 1 rejected per window.
    expect(result.recordsUploaded).toBe(1);
    const saved = await loadBackfillCheckpoint('server-1');
    expect(saved?.status).toBe('done');
    expect(saved?.recordsUploaded).toBe(1);
  });

  test('requests read authorization for the metric set before any reads (iOS)', async () => {
    // HealthKit throws on never-requested types instead of reading empty, so the
    // run must settle authorization before the first probe.
    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
    expect(healthService.requestHealthPermissions).toHaveBeenCalledWith([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'Weight' },
    ]);
    expect(healthService.requestHealthPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      healthService.readEarliestRecord.mock.invocationCallOrder[0],
    );
  });

  test('a failed permission request stops the run before any reads', async () => {
    healthService.requestHealthPermissions.mockResolvedValue(false);

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('window-failed');
    expect(healthService.readEarliestRecord).not.toHaveBeenCalled();
    expect(engine.collectHealthData).not.toHaveBeenCalled();
  });

  test('a done checkpoint short-circuits to completed without touching anything', async () => {
    await saveBackfillCheckpoint('server-1', inProgressCheckpoint({ status: 'done' }));

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
    expect(engine.collectHealthData).not.toHaveBeenCalled();
    expect(healthService.readEarliestRecord).not.toHaveBeenCalled();
  });

  test('an unexpected throw still releases the claim, flag, and AppState listener', async () => {
    healthService.ensureHistoryReadPermission.mockRejectedValue(new Error('bridge died'));

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('window-failed');
    expect(result.error).toBe('bridge died');
    expect(isSyncClaimed()).toBe(false);
    expect(isBackfillRunning()).toBe(false);
    expect(removeSubscription).toHaveBeenCalled();
  });

  test('metrics whose history starts later are dropped from older windows', async () => {
    // Steps is frozen as the late starter (history from Jul 20), so window 2
    // [Jun 20, Jul 4) must read Weight only.
    await saveBackfillCheckpoint('server-1', inProgressCheckpoint({
      cursor: AUG_3.toISOString(),
      earliestByRecordType: { Steps: WEIGHT_EARLIEST, Weight: STEPS_EARLIEST },
      enabledRecordTypes: ['Steps', 'Weight'],
      recordsUploaded: 0,
    }));

    const result = await runBackfill(runOpts());

    expect(result.outcome).toBe('completed');
    const firstMetrics = (engine.collectHealthData.mock.calls[0][1] as MetricLike[]).map(m => m.recordType);
    const secondMetrics = (engine.collectHealthData.mock.calls[1][1] as MetricLike[]).map(m => m.recordType);
    expect(firstMetrics).toEqual(['Steps', 'Weight']);
    expect(secondMetrics).toEqual(['Weight']);
  });
});
