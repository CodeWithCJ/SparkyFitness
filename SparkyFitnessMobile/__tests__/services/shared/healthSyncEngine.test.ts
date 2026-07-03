import {
  collectHealthData,
  runForegroundSync,
  type HealthReadProvider,
} from '../../../src/services/shared/healthSyncEngine';
import { createTransformHealthRecords } from '../../../src/services/shared/dataTransformation';
import type { HealthMetric } from '../../../src/HealthMetrics';
import type { SyncWindows } from '../../../src/utils/syncUtils';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/services/writeback', () => ({
  runWriteback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/services/api/healthDataApi', () => ({
  syncHealthData: jest.fn(),
}));

const api = require('../../../src/services/api/healthDataApi') as { syncHealthData: jest.Mock };
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

    const outcomes = await collectHealthData(provider, [steps], windows, { timeoutLabelPrefix: 'Test query' });

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

    const outcomes = await collectHealthData(provider, [bmr], windows, { timeoutLabelPrefix: 'Test query' });

    expect(provider.readCumulativeByDay).toHaveBeenCalled();
    expect(provider.readRaw).toHaveBeenCalledWith('BasalMetabolicRate', windows.sessionStart, windows.end);
    expect(outcomes[0].data).toEqual(rawRecords);
  });

  test('cumulative-day error envelope propagates WITHOUT a raw fallback (null-vs-error contract)', async () => {
    const provider = fakeProvider({
      readCumulativeByDay: jest.fn().mockResolvedValue({ records: [], error: 'query failed' }),
    });
    const steps = metric({ recordType: 'Steps', type: 'step', readKind: 'cumulative-day' });

    const outcomes = await collectHealthData(provider, [steps], windows, { timeoutLabelPrefix: 'Test query' });

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

    const outcomes = await collectHealthData(provider, [totalCalories], windows, { timeoutLabelPrefix: 'Test query' });

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

    const outcomes = await collectHealthData(provider, [heartRate], windows, { timeoutLabelPrefix: 'Test query' });

    expect(provider.readMinMaxAvgByDay).toHaveBeenCalledWith(heartRate, windows.aggregatedStart, windows.end);
    expect(provider.readRaw).not.toHaveBeenCalled();
    // Already transformed and day-aggregated: re-running either stage would
    // re-aggregate min-of-{min,max,avg} under the same type names.
    expect(provider.transform).not.toHaveBeenCalled();
    expect(outcomes[0].data).toBe(dayStats);
  });

  test('min-max-avg-day null (no verified spec) falls back to raw samples with the ORIGINAL window plus the aggregation tail', async () => {
    const rawSamples = [
      { value: 2.5, type: 'running_speed', date: '2026-07-02', unit: 'm/s' },
      { value: 4.0, type: 'running_speed', date: '2026-07-02', unit: 'm/s' },
    ];
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: rawSamples }),
    });
    const runningSpeed = metric({ recordType: 'RunningSpeed', type: 'running_speed', unit: 'm/s', aggregationStrategy: 'min-max-avg' });

    const outcomes = await collectHealthData(provider, [runningSpeed], windows, { timeoutLabelPrefix: 'Test query' });

    expect(provider.readRaw).toHaveBeenCalledWith('RunningSpeed', windows.sessionStart, windows.end);
    expect(provider.transform).toHaveBeenCalledWith(rawSamples, runningSpeed);
    // The aggregateByDay tail runs: exactly 3 records per day.
    expect(outcomes[0].data.map((r: { type: string }) => r.type)).toEqual([
      'running_speed_min',
      'running_speed_max',
      'running_speed_avg',
    ]);
  });

  test('rollingLookbackDays widens the raw window to the day-aligned lookback', async () => {
    const provider = fakeProvider();
    const nutrition = metric({ recordType: 'Nutrition', type: 'nutrition', rollingLookbackDays: 2 });

    await collectHealthData(provider, [nutrition], windows, { timeoutLabelPrefix: 'Test query' });

    // Lookback: midnight of (end − 2 days) = 2026-07-01 00:00, earlier than the
    // session start (2026-07-02 15:30) — the wider window wins.
    expect(provider.readRaw).toHaveBeenCalledWith('Nutrition', new Date(2026, 6, 1, 0, 0, 0, 0), windows.end);
  });

  test('rollingLookbackDays keeps the session window when it already reaches further back', async () => {
    const provider = fakeProvider();
    const nutrition = metric({ recordType: 'Nutrition', type: 'nutrition', rollingLookbackDays: 2 });
    const wideWindows: SyncWindows = {
      sessionStart: new Date(2026, 5, 1, 0, 0, 0, 0), // June 1 — far earlier than the lookback
      aggregatedStart: new Date(2026, 5, 1, 0, 0, 0, 0),
      end: windows.end,
    };

    await collectHealthData(provider, [nutrition], wideWindows, { timeoutLabelPrefix: 'Test query' });

    expect(provider.readRaw).toHaveBeenCalledWith('Nutrition', wideWindows.sessionStart, wideWindows.end);
  });

  test('postProcessRaw runs only on non-empty raw reads', async () => {
    const provider = fakeProvider();
    const exercise = metric({ recordType: 'ExerciseSession', type: 'exercise_session' });

    const outcomes = await collectHealthData(provider, [exercise], windows, { timeoutLabelPrefix: 'Test query' });

    expect(provider.postProcessRaw).not.toHaveBeenCalled();
    expect(provider.transform).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ status: 'fulfilled', data: [] });

    const rawSessions = [{ exerciseType: 56 }];
    const enriched = [{ exerciseType: 56, ENERGY_TOTAL: { inKilocalories: 320 } }];
    provider.readRaw.mockResolvedValue({ records: rawSessions });
    provider.postProcessRaw.mockResolvedValue(enriched);

    const secondOutcomes = await collectHealthData(provider, [exercise], windows, { timeoutLabelPrefix: 'Test query' });

    expect(provider.postProcessRaw).toHaveBeenCalledWith(exercise, rawSessions);
    expect(provider.transform).toHaveBeenCalledWith(enriched, exercise);
    expect(secondOutcomes[0].data).toEqual(enriched);
  });

  test('partial raw records ride along with the read error', async () => {
    const partial = [{ value: 75.5 }];
    const provider = fakeProvider({
      readRaw: jest.fn().mockResolvedValue({ records: partial, error: 'read interrupted' }),
    });
    const weight = metric({ recordType: 'Weight', type: 'weight' });

    const outcomes = await collectHealthData(provider, [weight], windows, { timeoutLabelPrefix: 'Test query' });

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

      const pending = collectHealthData(provider, metrics, windows, { timeoutLabelPrefix: 'Test query' });
      await jest.advanceTimersByTimeAsync(60_001);
      const outcomes = await pending;

      expect(outcomes.map(o => o.status)).toEqual(['rejected', 'rejected', 'rejected', 'skipped']);
      expect(outcomes[0].error).toContain('Test query for A timed out');
      expect(outcomes[3].error).toBe('Skipped because an earlier metric query timed out.');
    } finally {
      jest.useRealTimers();
    }
  });

  test('outcomes preserve the input metric order', async () => {
    const provider = fakeProvider({
      readRaw: jest.fn().mockImplementation(async (recordType: string) => ({ records: [{ recordType }] })),
    });
    const metrics = ['A', 'B', 'C', 'D', 'E'].map(recordType => metric({ recordType, id: recordType }));

    const outcomes = await collectHealthData(provider, metrics, windows, { timeoutLabelPrefix: 'Test query' });

    expect(outcomes.map(o => o.metric.recordType)).toEqual(['A', 'B', 'C', 'D', 'E']);
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
