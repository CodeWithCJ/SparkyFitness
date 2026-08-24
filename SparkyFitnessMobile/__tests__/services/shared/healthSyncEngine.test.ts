import {
  collectHealthData,
  runForegroundSync,
  type HealthReadProvider,
  sessionTelemetryOutcomesUsable,
} from '../../../src/services/shared/healthSyncEngine';
import { createTransformHealthRecords } from '../../../src/services/shared/dataTransformation';
import type { HealthMetric } from '../../../src/HealthMetrics';
import type { SyncWindows } from '../../../src/utils/syncUtils';
import {
  createTelemetryRunContext,
  FOREGROUND_TELEMETRY_BUDGET,
} from '../../../src/services/shared/telemetryBudget';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/services/writeback', () => ({
  runWriteback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/services/api/healthDataApi', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../../src/services/api/measurementsApi', () => ({
  serverSupportsPerRecordWater: jest.fn().mockResolvedValue(true),
}));

const api = require('../../../src/services/api/healthDataApi') as { syncHealthData: jest.Mock };
const measurementsApi = require('../../../src/services/api/measurementsApi') as { serverSupportsPerRecordWater: jest.Mock };
const writeback = require('../../../src/services/writeback') as { runWriteback: jest.Mock };

const metric = (overrides: Partial<HealthMetric>): HealthMetric => ({
  id: 'test-metric',
  label: 'Test Metric',
  stateKey: 'isTestSyncEnabled',
  preferenceKey: 'syncTestEnabled',
  recordType: 'Test',
  unit: 'unit',
  icon: 0,
  permissions: [],
  type: 'test',
  ...overrides,
});

type FakeProvider = { [K in keyof HealthReadProvider]: jest.Mock };

const fakeProvider = (overrides: Partial<FakeProvider> = {}): FakeProvider => ({
  readCumulativeByDay: jest.fn().mockResolvedValue(null),
  readMinMaxAvgByDay: jest.fn().mockResolvedValue(null),
  readRaw: jest.fn().mockResolvedValue({ records: [] }),
  postProcessRaw: jest.fn(async (_metric: HealthMetric, records: unknown[]) => records),
  transform: jest.fn((records: unknown[]) => records),
  ...overrides,
});

const windows: SyncWindows = {
  sessionStart: new Date(2026, 6, 2, 15, 30, 0),
  aggregatedStart: new Date(2026, 6, 2, 0, 0, 0, 0),
  end: new Date(2026, 6, 3, 15, 30, 0),
};

describe('collectHealthData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('cumulative-day metrics read via the provider with the day-aligned window', async () => {
    const records = [{ date: '2026-07-02', value: 5000, type: 'step' }];
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockResolvedValue({ records }),
    });
    const steps = metric({ recordType: 'Steps', type: 'step', readKind: 'cumulative-day' });

    const outcomes = await collectHealthData(provider, [steps], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.readCumulativeByDay).toHaveBeenCalledWith(steps, windows.aggregatedStart, windows.end);
    expect(provider.readRaw).not.toHaveBeenCalled();
    expect(provider.transform).toHaveBeenCalledWith(records, steps);
    expect(outcomes).toEqual([
      { metric: steps, status: 'fulfilled', data: records, error: undefined },
    ]);
  });

  test('cumulative-day null (capability missing) falls back to the raw path at the session window', async () => {
    const rawRecords = [{ basalMetabolicRate: { inKilocaloriesPerDay: 1650 } }];
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: rawRecords }),
    });
    const bmr = metric({ recordType: 'BasalMetabolicRate', type: 'basal_metabolic_rate', readKind: 'cumulative-day' });

    const outcomes = await collectHealthData(provider, [bmr], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.readCumulativeByDay).toHaveBeenCalled();
    expect(provider.readRaw).toHaveBeenCalledWith('BasalMetabolicRate', windows.sessionStart, windows.end, expect.anything());
    expect(outcomes[0].data).toEqual(rawRecords);
  });

  test('cumulative-day error envelope propagates WITHOUT a raw fallback (null-vs-error contract)', async () => {
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockResolvedValue({ records: [], error: 'query failed' }),
    });
    const steps = metric({ recordType: 'Steps', type: 'step', readKind: 'cumulative-day' });

    const outcomes = await collectHealthData(provider, [steps], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.readRaw).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ status: 'fulfilled', data: [], error: 'query failed' });
  });

  test('preserves pre-aggregated record types instead of stamping the metric config type', async () => {
    // TotalCaloriesBurned's config type is the legacy 'Active Calories', but its
    // aggregate reads emit type 'total_calories'. Drive the REAL platform transform
    // through the engine (not the identity stub) so the `rec.type || metric.type`
    // preservation actually runs: a record with its own type keeps it, while a
    // type-less pre-aggregated record still falls back to the metric config type.
    const records = [
      { date: '2026-07-02', value: 2000, type: 'total_calories' },
      { date: '2026-07-02', value: 1500 },
    ];
    const realTransform = createTransformHealthRecords({
      source: 'Health Connect',
      logTag: '[TestService]',
      valueTransformers: {},
      directTransformers: {},
      extractTimezoneMetadata: () => ({}),
    });
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockResolvedValue({ records }),
      transform: jest.fn(realTransform),
    });
    const totalCalories = metric({
      recordType: 'TotalCaloriesBurned',
      type: 'Active Calories',
      readKind: 'cumulative-day',
    });

    const outcomes = await collectHealthData(provider, [totalCalories], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(outcomes[0].data).toEqual([
      expect.objectContaining({ value: 2000, type: 'total_calories' }),
      expect.objectContaining({ value: 1500, type: 'Active Calories' }),
    ]);
  });

  test('min-max-avg-day native path bypasses transform and the aggregateByDay tail', async () => {
    const dayStats = [
      { value: 48, type: 'heart_rate_min', date: '2026-07-02', unit: 'bpm', source: 'HealthKit' },
      { value: 120, type: 'heart_rate_max', date: '2026-07-02', unit: 'bpm', source: 'HealthKit' },
      { value: 72, type: 'heart_rate_avg', date: '2026-07-02', unit: 'bpm', source: 'HealthKit' },
    ];
    const provider = fakeProvider({
      readMinMaxAvgByDay: jest.fn().mockResolvedValue({ records: dayStats }),
    });
    const heartRate = metric({ recordType: 'HeartRate', type: 'heart_rate', unit: 'bpm', aggregationStrategy: 'min-max-avg' });

    const outcomes = await collectHealthData(provider, [heartRate], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.readMinMaxAvgByDay).toHaveBeenCalledWith(heartRate, windows.aggregatedStart, windows.end);
    expect(provider.readRaw).not.toHaveBeenCalled();
    // Already transformed and day-aggregated: re-running either stage would
    // re-aggregate min-of-{min,max,avg} under the same type names.
    expect(provider.transform).not.toHaveBeenCalled();
    expect(outcomes[0].data).toBe(dayStats);
  });

  test('min-max-avg-day null (no verified spec) falls back to raw samples with the DAY-ALIGNED window plus the aggregation tail', async () => {
    const rawSamples = [
      { value: 2.5, type: 'running_speed', date: '2026-07-02', unit: 'm/s' },
      { value: 4.0, type: 'running_speed', date: '2026-07-02', unit: 'm/s' },
    ];
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: rawSamples }),
    });
    const runningSpeed = metric({ recordType: 'RunningSpeed', type: 'running_speed', unit: 'm/s', aggregationStrategy: 'min-max-avg' });

    const outcomes = await collectHealthData(provider, [runningSpeed], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    // Day-aligned, not sessionStart: the aggregates land as full-day SETs on
    // the server, so a mid-day window start would clobber the stored day
    // values with partial-window ones (issue #1978 — heart_rate_min losing
    // the overnight low to an afternoon sync).
    expect(provider.readRaw).toHaveBeenCalledWith('RunningSpeed', windows.aggregatedStart, windows.end, expect.anything());
    expect(provider.transform).toHaveBeenCalledWith(rawSamples, runningSpeed);
    // The aggregateByDay tail runs: exactly 3 records per day.
    expect(outcomes[0].data.map((r: { type: string }) => r.type)).toEqual([
      'running_speed_min',
      'running_speed_max',
      'running_speed_avg',
    ]);
  });

  test('sum-strategy metrics also read from the day-aligned window on the raw path', async () => {
    const provider = fakeProvider();
    const standTime = metric({ recordType: 'AppleStandTime', type: 'apple_stand_time', unit: 'seconds', aggregationStrategy: 'sum' });

    await collectHealthData(provider, [standTime], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.readRaw).toHaveBeenCalledWith('AppleStandTime', windows.aggregatedStart, windows.end, expect.anything());
  });

  test('rollingLookbackDays widens the raw window to the day-aligned lookback', async () => {
    const provider = fakeProvider();
    const nutrition = metric({ recordType: 'Nutrition', type: 'nutrition', rollingLookbackDays: 2 });

    await collectHealthData(provider, [nutrition], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    // Lookback: midnight of (end − 2 days) = 2026-07-01 00:00, earlier than the
    // session start (2026-07-02 15:30) — the wider window wins.
    expect(provider.readRaw).toHaveBeenCalledWith('Nutrition', new Date(2026, 6, 1, 0, 0, 0, 0), windows.end, expect.anything());
  });

  test('rollingLookbackDays keeps the session window when it already reaches further back', async () => {
    const provider = fakeProvider();
    const nutrition = metric({ recordType: 'Nutrition', type: 'nutrition', rollingLookbackDays: 2 });
    const wideWindows: SyncWindows = {
      sessionStart: new Date(2026, 5, 1, 0, 0, 0, 0), // June 1 — far earlier than the lookback
      aggregatedStart: new Date(2026, 5, 1, 0, 0, 0, 0),
      end: windows.end,
    };

    await collectHealthData(provider, [nutrition], wideWindows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.readRaw).toHaveBeenCalledWith('Nutrition', wideWindows.sessionStart, wideWindows.end, expect.anything());
  });

  test('postProcessRaw runs only on non-empty raw reads', async () => {
    const provider = fakeProvider();
    const exercise = metric({ recordType: 'ExerciseSession', type: 'exercise_session' });

    const outcomes = await collectHealthData(provider, [exercise], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.postProcessRaw).not.toHaveBeenCalled();
    expect(provider.transform).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ status: 'fulfilled', data: [] });

    const rawSessions = [{ exerciseType: 56 }];
    const enriched = [{ exerciseType: 56, ENERGY_TOTAL: { inKilocalories: 320 } }];
    provider.readRaw.mockResolvedValue({ records: rawSessions });
    provider.postProcessRaw.mockResolvedValue(enriched);

    const secondOutcomes = await collectHealthData(provider, [exercise], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(provider.postProcessRaw).toHaveBeenCalledWith(exercise, rawSessions, expect.anything());
    expect(provider.transform).toHaveBeenCalledWith(enriched, exercise);
    expect(secondOutcomes[0].data).toEqual(enriched);
  });

  test('partial raw records ride along with the read error', async () => {
    const partial = [{ value: 75.5 }];
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: partial, error: 'read interrupted' }),
    });
    const weight = metric({ recordType: 'Weight', type: 'weight' });

    const outcomes = await collectHealthData(provider, [weight], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(outcomes[0]).toMatchObject({
      status: 'fulfilled',
      data: partial,
      error: 'read interrupted',
    });
  });

  test('a timed-out metric is rejected and later batches are skipped', async () => {
    jest.useFakeTimers();
    try {
      const provider = fakeProvider({
        // First batch (3 metrics) never resolves; the timeout fires for all three.
        readRaw: jest.fn(() => new Promise(() => {})),
      });
      const metrics = ['A', 'B', 'C', 'D'].map(recordType => metric({ recordType, id: recordType }));

      const pending = collectHealthData(provider, metrics, windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });
      await jest.advanceTimersByTimeAsync(60_001);
      const outcomes = await pending;

      expect(outcomes.map(o => o.status)).toEqual(['rejected', 'rejected', 'rejected', 'skipped']);
      expect(outcomes[0].error).toContain('Test query for A timed out');
      expect(outcomes[3].error).toBe('Skipped because an earlier metric query timed out.');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a custom timeoutMs overrides the 60s default', async () => {
    jest.useFakeTimers();
    try {
      const provider = fakeProvider({
        readRaw: jest.fn(() => new Promise(() => {})),
      });
      const slow = metric({ recordType: 'Slow' });

      const pending = collectHealthData(provider, [slow], windows, {
        timeoutLabelPrefix: 'Test query',
        telemetry: createTelemetryRunContext(),
        timeoutMs: 120_000,
      });
      let settled = false;
      pending.then(() => { settled = true; });

      // The default 60s deadline passes without firing under the wider budget.
      await jest.advanceTimersByTimeAsync(60_001);
      expect(settled).toBe(false);

      await jest.advanceTimersByTimeAsync(60_000);
      const outcomes = await pending;

      expect(settled).toBe(true);
      expect(outcomes[0].status).toBe('rejected');
      expect(outcomes[0].error).toContain('Test query for Slow timed out');
    } finally {
      jest.useRealTimers();
    }
  });

  test('outcomes preserve the input metric order', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockImplementation(async (recordType: string) => ({ records: [{ recordType }] })),
    });
    const metrics = ['A', 'B', 'C', 'D', 'E'].map(recordType => metric({ recordType, id: recordType }));

    const outcomes = await collectHealthData(provider, metrics, windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

    expect(outcomes.map(o => o.metric.recordType)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  // Older servers SET the day total per incoming water record (last drink
  // wins), so per-record hydration is gated on the server capability probe.
  describe('per-record water server gate', () => {
    const hydration = metric({ recordType: 'Hydration', type: 'water', unit: 'ml' });
    const drinkRecords = [
      { value: 250, date: '2026-07-02', unit: 'ml', source: 'healthkit', type: 'water', source_id: 'hk-1' },
      { value: 500, date: '2026-07-02', unit: 'ml', source: 'healthkit', type: 'water', source_id: 'hk-2' },
    ];

    test('sends individual records when the server supports per-record water', async () => {
      measurementsApi.serverSupportsPerRecordWater.mockResolvedValue(true);
      const provider = fakeProvider({
        readRaw: jest.fn().mockResolvedValue({ records: [{}, {}] }),
        transform: jest.fn(() => drinkRecords),
      });

      const outcomes = await collectHealthData(provider, [hydration], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

      expect(outcomes[0].data).toEqual(drinkRecords);
      // Per-record upsert tolerates partial-day windows — the session window is fine.
      expect(provider.readRaw).toHaveBeenCalledWith('Hydration', windows.sessionStart, windows.end, expect.anything());
    });

    test('falls back to one day-aggregate record against an older server', async () => {
      measurementsApi.serverSupportsPerRecordWater.mockResolvedValue(false);
      const provider = fakeProvider({
        readRaw: jest.fn().mockResolvedValue({ records: [{}, {}] }),
        transform: jest.fn(() => drinkRecords),
      });

      const outcomes = await collectHealthData(provider, [hydration], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

      // Summed per day, with no source_id/timestamp leaking onto the aggregate.
      expect(outcomes[0].data).toEqual([
        { value: 750, type: 'water', date: '2026-07-02', unit: 'ml', source: 'healthkit' },
      ]);
      // The aggregate is a full-day SET on the old server, so the read must
      // start at a local day boundary — a mid-day session window (background
      // sync: lastSynced − 6h) would sum only a slice of the day.
      expect(provider.readRaw).toHaveBeenCalledWith('Hydration', windows.aggregatedStart, windows.end, expect.anything());
    });

    test('does not probe the server when no per-record water metric is enabled', async () => {
      const provider = fakeProvider();
      const steps = metric({ recordType: 'Steps', type: 'step', readKind: 'cumulative-day' });

      await collectHealthData(provider, [steps], windows, { timeoutLabelPrefix: 'Test query', telemetry: createTelemetryRunContext() });

      expect(measurementsApi.serverSupportsPerRecordWater).not.toHaveBeenCalled();
    });
  });
});

describe('runForegroundSync', () => {
  const opts = {
    logTag: '[TestService]',
    emptyMessage: 'Nothing to sync.',
    timeoutLabelPrefix: 'Test query',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    writeback.runWriteback.mockResolvedValue(undefined);
  });

  test('returns the pinned empty message when no metrics are enabled', async () => {
    const provider = fakeProvider();

    const result = await runForegroundSync(provider, 'today', {}, opts);

    expect(result).toEqual({ success: true, message: 'Nothing to sync.', syncErrors: [] });
    expect(api.syncHealthData).not.toHaveBeenCalled();
  });

  test('uploads collected data and surfaces per-record server rejections as uploadErrors', async () => {
    const records = [{ date: '2026-07-02', value: 5000, type: 'step' }];
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockResolvedValue({ records }),
    });
    const recordErrors = [{ error: 'bad record', entry: records[0] }];
    api.syncHealthData.mockResolvedValue({ processed: 1, recordErrors });

    // Real HEALTH_METRICS: Steps is enabled via its stateKey.
    const result = await runForegroundSync(provider, 'today', { isStepsSyncEnabled: true }, opts);

    expect(api.syncHealthData).toHaveBeenCalledWith(records);
    expect(result.success).toBe(true);
    expect(result.uploadErrors).toEqual(recordErrors);
    // Upload rejections are not read errors — the cursor logic keys off syncErrors.
    expect(result.syncErrors).toEqual([]);
  });

  test('read errors land in syncErrors while other metrics still sync', async () => {
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockImplementation(async (m: HealthMetric) =>
        m.recordType === 'Steps'
          ? { records: [], error: 'query failed' }
          : { records: [{ date: '2026-07-02', value: 300, type: 'Active Calories' }] },
      ),
    });
    api.syncHealthData.mockResolvedValue({ processed: 1 });

    const result = await runForegroundSync(
      provider,
      'today',
      { isStepsSyncEnabled: true, isCaloriesSyncEnabled: true },
      opts,
    );

    expect(result.success).toBe(true);
    expect(result.syncErrors).toEqual([{ type: 'Steps', error: 'query failed' }]);
    expect(api.syncHealthData).toHaveBeenCalledWith([
      expect.objectContaining({ value: 300 }),
    ]);
  });

  test('an upload failure returns success false with the error and syncErrors intact', async () => {
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockResolvedValue({ records: [{ date: '2026-07-02', value: 1, type: 'step' }] }),
    });
    api.syncHealthData.mockRejectedValue(new Error('Network error'));

    const result = await runForegroundSync(provider, 'today', { isStepsSyncEnabled: true }, opts);

    expect(result).toEqual({ success: false, error: 'Network error', syncErrors: [] });
  });

  test('a writeback failure never affects the inbound result', async () => {
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockResolvedValue({ records: [{ date: '2026-07-02', value: 1, type: 'step' }] }),
    });
    writeback.runWriteback.mockRejectedValue(new Error('writeback exploded'));
    api.syncHealthData.mockResolvedValue({ processed: 1 });

    const result = await runForegroundSync(provider, 'today', { isStepsSyncEnabled: true }, opts);

    expect(writeback.runWriteback).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

describe('runForegroundSync telemetry budget (#2191)', () => {
  const opts = {
    logTag: '[TestService]',
    emptyMessage: 'Nothing to sync.',
    timeoutLabelPrefix: 'Test query',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    writeback.runWriteback.mockResolvedValue(undefined);
  });

  const runWithExerciseSession = async (provider: FakeProvider) =>
    runForegroundSync(provider, '7d', { isExerciseSessionSyncEnabled: true }, opts);

  test('hands the provider a BOUNDED context — the omission that caused #2191', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: [{ id: 'session-1' }] }),
    });

    await runWithExerciseSession(provider);

    const ctx = provider.postProcessRaw.mock.calls[0][2];
    expect(ctx).toBeDefined();

    // Exhausts after FOREGROUND_TELEMETRY_BUDGET claims rather than never.
    let claims = 0;
    while (ctx.claim() && claims < FOREGROUND_TELEMETRY_BUDGET * 10) claims++;
    expect(claims).toBe(FOREGROUND_TELEMETRY_BUDGET);
  });

  test('stays interactive — a user is present to answer a route-consent dialog', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: [{ id: 'session-1' }] }),
    });

    await runWithExerciseSession(provider);

    expect(provider.postProcessRaw.mock.calls[0][2].interactive).toBe(true);
    expect(provider.prepareInteractiveRead).toBeUndefined();
  });

  test('readRaw receives the same run context as postProcessRaw', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: [{ id: 'session-1' }] }),
    });

    await runWithExerciseSession(provider);

    expect(provider.readRaw.mock.calls[0][3]).toBe(
      provider.postProcessRaw.mock.calls[0][2],
    );
  });

  test('each run gets a fresh budget rather than a shared exhausted one', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: [{ id: 'session-1' }] }),
    });

    await runWithExerciseSession(provider);
    const first = provider.postProcessRaw.mock.calls[0][2];
    // Bounded drain: an unbounded context (the #2191 bug) must fail this test,
    // not spin forever in the drain loop.
    for (let i = 0; i < FOREGROUND_TELEMETRY_BUDGET; i++) first.claim();
    expect(first.claim()).toBe(false);

    await runWithExerciseSession(provider);
    const second = provider.postProcessRaw.mock.calls[1][2];

    expect(second).not.toBe(first);
    expect(second.claim()).toBe(true);
  });
});

describe('telemetry reuse cache commits only on a fully accepted upload', () => {
  const opts = {
    logTag: '[TestService]',
    emptyMessage: 'Nothing to sync.',
    timeoutLabelPrefix: 'Test query',
  };
  const cache = require('../../../src/services/shared/enrichedSessionCache');

  let markSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    writeback.runWriteback.mockResolvedValue(undefined);
    markSpy = jest.spyOn(cache, 'markEnrichedSessions').mockResolvedValue(undefined);
  });

  afterEach(() => {
    markSpy.mockRestore();
  });

  const runWithOneSession = () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: [{ id: 'session-1' }] }),
    });
    return runForegroundSync(provider, '7d', { isExerciseSessionSyncEnabled: true }, opts);
  };

  test('a fully accepted upload commits', async () => {
    api.syncHealthData.mockResolvedValue({ recordsSent: 1, recordErrors: [] });

    await runWithOneSession();

    expect(markSpy).toHaveBeenCalled();
  });

  test('a partially rejected upload does not commit', async () => {
    api.syncHealthData.mockResolvedValue({
      recordsSent: 1,
      recordErrors: [{ error: 'numeric field out of range' }],
    });

    await runWithOneSession();

    // Per-record rejections do not hold the sync cursor, and the foreground
    // window is the configured range rather than the cursor — so the rejected
    // workout WILL be re-sent, and caching here would strip its telemetry
    // permanently (see PR #2136, where the server rejected telemetry values).
    expect(markSpy).not.toHaveBeenCalled();
  });

  test('a thrown upload does not commit', async () => {
    api.syncHealthData.mockRejectedValue(new Error('network down'));

    await runWithOneSession();

    expect(markSpy).not.toHaveBeenCalled();
  });

  // Staging happens per session DURING the session read, before that metric's
  // outcome is known, and the 60s metric timeout is non-cancelling. Committing
  // on upload success alone marks sessions collected that never reached the
  // payload — permanently, because the cache has no expiry.
  test('a rejected session read does not commit, even when another metric uploads cleanly', async () => {
    api.syncHealthData.mockResolvedValue({ recordsSent: 1, recordErrors: [] });

    const provider = fakeProvider({
      readRaw: jest.fn(async (recordType: string) => {
        if (recordType === 'ExerciseSession') throw new Error('Health Connect read failed');
        return { records: [{ id: 'step-1' }] };
      }),
    });

    await runForegroundSync(
      provider,
      '7d',
      { isExerciseSessionSyncEnabled: true, isStepsSyncEnabled: true },
      opts,
    );

    expect(api.syncHealthData).toHaveBeenCalled();
    expect(markSpy).not.toHaveBeenCalled();
  });

  test('a rejected session read does not commit on the empty-payload path either', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockRejectedValue(new Error('Health Connect read failed')),
    });

    const result = await runForegroundSync(
      provider,
      '7d',
      { isExerciseSessionSyncEnabled: true },
      opts,
    );

    expect(api.syncHealthData).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(markSpy).not.toHaveBeenCalled();
  });

  test('a clean run with nothing to upload still commits', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: [] }),
    });

    await runForegroundSync(provider, '7d', { isExerciseSessionSyncEnabled: true }, opts);

    expect(api.syncHealthData).not.toHaveBeenCalled();
    expect(markSpy).toHaveBeenCalled();
  });
});

describe('sessionTelemetryOutcomesUsable', () => {
  const outcome = (recordType: string, status: 'fulfilled' | 'rejected' | 'skipped') =>
    ({ metric: { recordType }, status, data: [] }) as never;

  test('fulfilled session reads are usable', () => {
    expect(
      sessionTelemetryOutcomesUsable([
        outcome('ExerciseSession', 'fulfilled'),
        outcome('Steps', 'rejected'),
      ]),
    ).toBe(true);
  });

  test('a rejected or skipped session read is not', () => {
    expect(sessionTelemetryOutcomesUsable([outcome('ExerciseSession', 'rejected')])).toBe(false);
    expect(sessionTelemetryOutcomesUsable([outcome('Workout', 'skipped')])).toBe(false);
  });

  test('a run with no session metric has nothing staged to withhold', () => {
    expect(sessionTelemetryOutcomesUsable([outcome('Steps', 'rejected')])).toBe(true);
  });
});
