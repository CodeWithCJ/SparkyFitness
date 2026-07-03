import {
  triggerManualSync,
  flushPendingHealthSyncCacheRefresh,
} from '../../src/services/backgroundSyncService';
import { refreshHealthSyncCache } from '../../src/hooks/refreshHealthSyncCache';
import { TimeoutError } from '../../src/utils/concurrency';
import { AppState } from 'react-native';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/api/healthDataApi', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  loadLastSyncedTime: jest.fn(),
  saveLastSyncedTime: jest.fn(),
  loadBackgroundSyncEnabled: jest.fn(),
  savePendingHealthSyncCacheRefresh: jest.fn(),
  consumePendingHealthSyncCacheRefresh: jest.fn(),
}));

jest.mock('../../src/HealthMetrics', () => ({
  // Real derivation logic — the readKind triage depends on it.
  metricReadKind: jest.requireActual('../../src/HealthMetrics').metricReadKind,
  HEALTH_METRICS: [
    { id: 'steps', recordType: 'Steps', preferenceKey: 'isStepsSyncEnabled', label: 'Steps', readKind: 'cumulative-day' },
    { id: 'active-calories', recordType: 'ActiveCaloriesBurned', preferenceKey: 'isActiveCaloriesSyncEnabled', label: 'Active Calories', readKind: 'cumulative-day' },
    { id: 'total-calories', recordType: 'TotalCaloriesBurned', preferenceKey: 'isTotalCaloriesSyncEnabled', label: 'Total Calories', readKind: 'cumulative-day' },
    { id: 'distance', recordType: 'Distance', preferenceKey: 'isDistanceSyncEnabled', label: 'Distance', readKind: 'cumulative-day' },
    { id: 'floors', recordType: 'FloorsClimbed', preferenceKey: 'isFloorsClimbedSyncEnabled', label: 'Floors', readKind: 'cumulative-day' },
    { id: 'bmr', recordType: 'BasalMetabolicRate', preferenceKey: 'isBmrSyncEnabled', label: 'BMR', readKind: 'cumulative-day' },
    { id: 'heart-rate', recordType: 'HeartRate', preferenceKey: 'isHeartRateSyncEnabled', label: 'Heart Rate', type: 'heart_rate', unit: 'bpm', aggregationStrategy: 'min-max-avg' },
    { id: 'sleep', recordType: 'SleepSession', preferenceKey: 'isSleepSyncEnabled', label: 'Sleep' },
    { id: 'exercise', recordType: 'ExerciseSession', preferenceKey: 'isExerciseSyncEnabled', label: 'Exercise' },
    { id: 'weight', recordType: 'Weight', preferenceKey: 'isWeightSyncEnabled', label: 'Weight' },
  ],
}));

// The background service consumes the facade only for preferences, locked-device
// counters, and the healthReadProvider object — the REAL sync engine and window
// builders run under this suite. The per-metric jest.fns below are the provider's
// internals, exposed as top-level handles so tests can drive and assert reads the
// same way they always have.
jest.mock('../../src/services/healthConnectService', () => {
  const readHealthRecords = jest.fn();
  const getAggregatedStepsByDate = jest.fn();
  const getAggregatedActiveCaloriesByDate = jest.fn();
  const getAggregatedTotalCaloriesByDate = jest.fn();
  const getAggregatedDistanceByDate = jest.fn();
  const getAggregatedFloorsClimbedByDate = jest.fn();
  const transformHealthRecords = jest.fn((data: unknown[]) => data);
  const aggregateSleepSessions = jest.fn((data: unknown[]) => data);
  const enrichExerciseSessions = jest.fn(async (data: unknown[]) => data);
  // Default null = no verified day-statistics spec → raw sample fallback (Android parity).
  const readMinMaxAvgByDayDetailed = jest.fn().mockResolvedValue(null);

  // Mirrors the real provider: dispatches to the per-metric readers the tests control,
  // and returns null for anything unlisted (capability missing → raw-path fallback,
  // e.g. Android BasalMetabolicRate).
  const cumulativeReaders: Record<string, jest.Mock> = {
    Steps: getAggregatedStepsByDate,
    ActiveCaloriesBurned: getAggregatedActiveCaloriesByDate,
    TotalCaloriesBurned: getAggregatedTotalCaloriesByDate,
    Distance: getAggregatedDistanceByDate,
    FloorsClimbed: getAggregatedFloorsClimbedByDate,
  };
  const readCumulativeByDay = jest.fn(async (metric: { recordType: string }, startDate: Date, endDate: Date) => {
    const reader = cumulativeReaders[metric.recordType];
    if (!reader) return null;
    const records = await reader(startDate, endDate);
    return { records: records ?? [] };
  });

  const healthReadProvider = {
    readCumulativeByDay,
    readMinMaxAvgByDay: readMinMaxAvgByDayDetailed,
    readRaw: jest.fn(async (recordType: string, startDate: Date, endDate: Date) => {
      const records = await readHealthRecords(recordType, startDate, endDate);
      return { records: records ?? [] };
    }),
    postProcessRaw: jest.fn(async (metric: { recordType: string }, records: unknown[]) => {
      if (metric.recordType === 'SleepSession') return aggregateSleepSessions(records);
      if (metric.recordType === 'ExerciseSession') return enrichExerciseSessions(records);
      return records;
    }),
    transform: transformHealthRecords,
  };

  return {
    loadHealthPreference: jest.fn(),
    resetDatabaseInaccessibleCount: jest.fn(),
    getDatabaseInaccessibleCount: jest.fn().mockReturnValue(0),
    healthReadProvider,
    // Direct handles for the tests.
    readCumulativeByDay,
    readMinMaxAvgByDayDetailed,
    readHealthRecords,
    transformHealthRecords,
    aggregateSleepSessions,
    enrichExerciseSessions,
    getAggregatedStepsByDate,
    getAggregatedActiveCaloriesByDate,
    getAggregatedTotalCaloriesByDate,
    getAggregatedDistanceByDate,
    getAggregatedFloorsClimbedByDate,
  };
});

// The engine's aggregateByDay tail stays a controllable boundary in this suite
// (its behavior is pinned by __tests__/services/shared/dataAggregation.test.ts).
jest.mock('../../src/services/shared/dataAggregation', () => ({
  aggregateByDay: jest.fn((data: unknown[]) => data),
}));

jest.mock('../../src/hooks/refreshHealthSyncCache', () => ({
  refreshHealthSyncCache: jest.fn(),
}));

const api = require('../../src/services/api/healthDataApi') as { syncHealthData: jest.Mock };
const storage = require('../../src/services/storage') as {
  loadLastSyncedTime: jest.Mock;
  saveLastSyncedTime: jest.Mock;
  loadBackgroundSyncEnabled: jest.Mock;
  savePendingHealthSyncCacheRefresh: jest.Mock;
  consumePendingHealthSyncCacheRefresh: jest.Mock;
};
const healthService = {
  ...(require('../../src/services/healthConnectService') as {
    loadHealthPreference: jest.Mock;
    readHealthRecords: jest.Mock;
    readMinMaxAvgByDayDetailed: jest.Mock;
    readCumulativeByDay: jest.Mock;
    transformHealthRecords: jest.Mock;
    aggregateSleepSessions: jest.Mock;
    enrichExerciseSessions: jest.Mock;
    getAggregatedStepsByDate: jest.Mock;
    getAggregatedActiveCaloriesByDate: jest.Mock;
    getAggregatedTotalCaloriesByDate: jest.Mock;
    getAggregatedDistanceByDate: jest.Mock;
    getAggregatedFloorsClimbedByDate: jest.Mock;
    resetDatabaseInaccessibleCount: jest.Mock;
    getDatabaseInaccessibleCount: jest.Mock;
  }),
  aggregateByDay: (require('../../src/services/shared/dataAggregation') as { aggregateByDay: jest.Mock }).aggregateByDay,
};
const mockRefreshHealthSyncCache = refreshHealthSyncCache as jest.MockedFunction<
  typeof refreshHealthSyncCache
>;

describe('performBackgroundSync (via triggerManualSync)', () => {
  const setAppState = (state: string) => {
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: state,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T14:30:00Z'));
    jest.spyOn(console, 'log').mockImplementation();
    // clearAllMocks keeps implementations set inside earlier tests; pin the
    // identity default so per-test mockReturnValue overrides cannot leak forward
    // (the real aggregateByDay returns [] for empty input, matching identity here).
    healthService.aggregateByDay.mockImplementation((data: unknown[]) => data);
    api.syncHealthData.mockResolvedValue(undefined);
    storage.savePendingHealthSyncCacheRefresh.mockResolvedValue(undefined);
    storage.consumePendingHealthSyncCacheRefresh.mockResolvedValue(false);
    setAppState('active');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Date windows', () => {
    test('uses 24h ago when no prior sync exists', async () => {
      storage.loadLastSyncedTime.mockResolvedValue(null);
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);

      await triggerManualSync();

      const now = new Date('2024-01-15T14:30:00Z');
      const expectedSessionStart = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000);
      const expectedAggregatedStart = new Date(expectedSessionStart);
      expectedAggregatedStart.setHours(0, 0, 0, 0);

      expect(healthService.getAggregatedStepsByDate).toHaveBeenCalledWith(
        expectedAggregatedStart,
        now
      );
    });

    test('uses lastSyncedTime with 6h overlap for session queries', async () => {
      const lastSynced = new Date('2024-01-15T08:00:00Z');
      storage.loadLastSyncedTime.mockResolvedValue(lastSynced.toISOString());
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.readHealthRecords.mockResolvedValue([{ value: 72 }]);

      await triggerManualSync();

      const now = new Date('2024-01-15T14:30:00Z');
      const expectedSessionStart = new Date(lastSynced.getTime() - 6 * 60 * 60 * 1000);

      expect(healthService.readHealthRecords).toHaveBeenCalledWith(
        'HeartRate',
        expectedSessionStart,
        now
      );
    });

    test('uses start-of-day for aggregated metrics', async () => {
      const lastSynced = new Date('2024-01-15T08:00:00Z');
      storage.loadLastSyncedTime.mockResolvedValue(lastSynced.toISOString());
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);

      await triggerManualSync();

      const now = new Date('2024-01-15T14:30:00Z');
      const sessionStart = new Date(lastSynced.getTime() - 6 * 60 * 60 * 1000);
      const expectedAggregatedStart = new Date(sessionStart);
      expectedAggregatedStart.setHours(0, 0, 0, 0);

      expect(healthService.getAggregatedStepsByDate).toHaveBeenCalledWith(
        expectedAggregatedStart,
        now
      );
    });
  });

  describe('Metric routing', () => {
    beforeEach(() => {
      storage.loadLastSyncedTime.mockResolvedValue(new Date('2024-01-15T08:00:00Z').toISOString());
      healthService.getAggregatedStepsByDate.mockResolvedValue([]);
      healthService.getAggregatedActiveCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedTotalCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedDistanceByDate.mockResolvedValue([]);
      healthService.getAggregatedFloorsClimbedByDate.mockResolvedValue([]);
      healthService.readHealthRecords.mockResolvedValue([]);
    });

    test('routes Steps to getAggregatedStepsByDate', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isStepsSyncEnabled')
      );
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);

      await triggerManualSync();

      expect(healthService.getAggregatedStepsByDate).toHaveBeenCalled();
      expect(healthService.readHealthRecords).not.toHaveBeenCalledWith('Steps', expect.any(Date), expect.any(Date));
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        [{ value: 5000 }],
        expect.objectContaining({ recordType: 'Steps' })
      );
    });

    test('routes ActiveCaloriesBurned to getAggregatedActiveCaloriesByDate', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isActiveCaloriesSyncEnabled')
      );
      healthService.getAggregatedActiveCaloriesByDate.mockResolvedValue([{ value: 300 }]);

      await triggerManualSync();

      expect(healthService.getAggregatedActiveCaloriesByDate).toHaveBeenCalled();
      expect(healthService.readHealthRecords).not.toHaveBeenCalledWith('ActiveCaloriesBurned', expect.any(Date), expect.any(Date));
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        [{ value: 300 }],
        expect.objectContaining({ recordType: 'ActiveCaloriesBurned' })
      );
    });

    test('routes TotalCaloriesBurned to getAggregatedTotalCaloriesByDate', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isTotalCaloriesSyncEnabled')
      );
      healthService.getAggregatedTotalCaloriesByDate.mockResolvedValue([{ value: 1800 }]);

      await triggerManualSync();

      expect(healthService.getAggregatedTotalCaloriesByDate).toHaveBeenCalled();
      expect(healthService.readHealthRecords).not.toHaveBeenCalledWith('TotalCaloriesBurned', expect.any(Date), expect.any(Date));
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        [{ value: 1800 }],
        expect.objectContaining({ recordType: 'TotalCaloriesBurned' })
      );
    });

    test('routes Distance to getAggregatedDistanceByDate', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isDistanceSyncEnabled')
      );
      healthService.getAggregatedDistanceByDate.mockResolvedValue([{ value: 5.2 }]);

      await triggerManualSync();

      expect(healthService.getAggregatedDistanceByDate).toHaveBeenCalled();
      expect(healthService.readHealthRecords).not.toHaveBeenCalledWith('Distance', expect.any(Date), expect.any(Date));
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        [{ value: 5.2 }],
        expect.objectContaining({ recordType: 'Distance' })
      );
    });

    test('routes FloorsClimbed to getAggregatedFloorsClimbedByDate', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isFloorsClimbedSyncEnabled')
      );
      healthService.getAggregatedFloorsClimbedByDate.mockResolvedValue([{ value: 10 }]);

      await triggerManualSync();

      expect(healthService.getAggregatedFloorsClimbedByDate).toHaveBeenCalled();
      expect(healthService.readHealthRecords).not.toHaveBeenCalledWith('FloorsClimbed', expect.any(Date), expect.any(Date));
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        [{ value: 10 }],
        expect.objectContaining({ recordType: 'FloorsClimbed' })
      );
    });

    test('routes HeartRate through the native day-statistics read when a spec exists', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isHeartRateSyncEnabled')
      );
      const statsRecords = [
        { value: 48, type: 'heart_rate_min', date: '2024-01-15', unit: 'bpm', source: 'HealthKit' },
        { value: 120, type: 'heart_rate_max', date: '2024-01-15', unit: 'bpm', source: 'HealthKit' },
        { value: 72.4, type: 'heart_rate_avg', date: '2024-01-15', unit: 'bpm', source: 'HealthKit' },
      ];
      healthService.readMinMaxAvgByDayDetailed.mockResolvedValueOnce({ records: statsRecords });

      await triggerManualSync();

      // Day-aligned window (aggregatedStartDate), NOT the raw session window: the stats
      // read emits full-day min/max/avg values.
      const sessionStart = new Date(new Date('2024-01-15T08:00:00Z').getTime() - 6 * 60 * 60 * 1000);
      const expectedAggregatedStart = new Date(sessionStart);
      expectedAggregatedStart.setHours(0, 0, 0, 0);
      expect(healthService.readMinMaxAvgByDayDetailed).toHaveBeenCalledWith(
        expect.objectContaining({ recordType: 'HeartRate' }),
        expectedAggregatedStart,
        new Date('2024-01-15T14:30:00Z'),
      );

      // Output is already day-aggregated — no raw read, no transform, no re-aggregation.
      expect(healthService.readHealthRecords).not.toHaveBeenCalledWith('HeartRate', expect.any(Date), expect.any(Date));
      expect(healthService.aggregateByDay).not.toHaveBeenCalled();
      expect(api.syncHealthData).toHaveBeenCalledWith(statsRecords);
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
    });

    test('routes HeartRate through readHealthRecords then aggregateByDay when no spec exists', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isHeartRateSyncEnabled')
      );
      const rawHeartRate = [{ value: 72 }, { value: 75 }];
      const transformedHeartRate = [{ value: 72, type: 'heart_rate', date: '2024-01-15', unit: 'bpm' }, { value: 75, type: 'heart_rate', date: '2024-01-15', unit: 'bpm' }];
      const aggregatedHeartRate = [
        { value: 72, type: 'heart_rate_min', date: '2024-01-15', unit: 'bpm' },
        { value: 75, type: 'heart_rate_max', date: '2024-01-15', unit: 'bpm' },
        { value: 73.5, type: 'heart_rate_avg', date: '2024-01-15', unit: 'bpm' },
      ];
      healthService.readHealthRecords.mockResolvedValue(rawHeartRate);
      healthService.transformHealthRecords.mockReturnValue(transformedHeartRate);
      healthService.aggregateByDay.mockReturnValue(aggregatedHeartRate);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalledWith('HeartRate', expect.any(Date), expect.any(Date));
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        rawHeartRate,
        expect.objectContaining({ recordType: 'HeartRate' })
      );
      expect(healthService.aggregateByDay).toHaveBeenCalledWith(
        transformedHeartRate,
        'heart_rate',
        'bpm',
        'min-max-avg',
      );
    });

    test('routes SleepSession through readHealthRecords then aggregateSleepSessions', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isSleepSyncEnabled')
      );
      const rawSleep = [{ duration: 28800 }];
      const aggregatedSleep = [{ totalDuration: 28800 }];
      healthService.readHealthRecords.mockResolvedValue(rawSleep);
      healthService.aggregateSleepSessions.mockReturnValue(aggregatedSleep);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalledWith('SleepSession', expect.any(Date), expect.any(Date));
      expect(healthService.aggregateSleepSessions).toHaveBeenCalledWith(rawSleep);
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        aggregatedSleep,
        expect.objectContaining({ recordType: 'SleepSession' })
      );
    });

    test('routes ExerciseSession through readHealthRecords then enrichExerciseSessions', async () => {
      // Regression: background sync used to skip enrichment entirely, so Android
      // background exercise entries landed on the server without calories/distance
      // while foreground entries had them.
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isExerciseSyncEnabled')
      );
      const rawSessions = [{ exerciseType: 56 }];
      const enrichedSessions = [{ exerciseType: 56, ENERGY_TOTAL: { inKilocalories: 320 } }];
      healthService.readHealthRecords.mockResolvedValue(rawSessions);
      healthService.enrichExerciseSessions.mockResolvedValue(enrichedSessions);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalledWith('ExerciseSession', expect.any(Date), expect.any(Date));
      expect(healthService.enrichExerciseSessions).toHaveBeenCalledWith(rawSessions);
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        enrichedSessions,
        expect.objectContaining({ recordType: 'ExerciseSession' })
      );
    });

    test('does not enrich when the ExerciseSession read returns no records', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isExerciseSyncEnabled')
      );
      healthService.readHealthRecords.mockResolvedValue([]);

      await triggerManualSync();

      expect(healthService.enrichExerciseSessions).not.toHaveBeenCalled();
    });

    test('routes BasalMetabolicRate to the raw path when the provider reports no capability', async () => {
      // BMR carries readKind 'cumulative-day' (intent), but a provider with no native
      // aggregation for it returns null (Android). The metric must fall back to raw
      // records — null is capability-missing, never a query failure.
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isBmrSyncEnabled')
      );
      const rawBmr = [{ basalMetabolicRate: { inKilocaloriesPerDay: 1650 } }];
      healthService.readHealthRecords.mockResolvedValue(rawBmr);

      await triggerManualSync();

      expect(healthService.readCumulativeByDay).toHaveBeenCalledWith(
        expect.objectContaining({ recordType: 'BasalMetabolicRate' }),
        expect.any(Date),
        expect.any(Date),
      );
      expect(healthService.readHealthRecords).toHaveBeenCalledWith('BasalMetabolicRate', expect.any(Date), expect.any(Date));
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        rawBmr,
        expect.objectContaining({ recordType: 'BasalMetabolicRate' })
      );
    });

    test('routes Weight through readHealthRecords without post-processing', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isWeightSyncEnabled')
      );
      const rawWeight = [{ value: 75.5 }];
      healthService.readHealthRecords.mockResolvedValue(rawWeight);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalledWith('Weight', expect.any(Date), expect.any(Date));
      expect(healthService.aggregateByDay).not.toHaveBeenCalled();
      expect(healthService.aggregateSleepSessions).not.toHaveBeenCalled();
      expect(healthService.enrichExerciseSessions).not.toHaveBeenCalled();
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        rawWeight,
        expect.objectContaining({ recordType: 'Weight' })
      );
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      storage.loadLastSyncedTime.mockResolvedValue(new Date('2024-01-15T08:00:00Z').toISOString());
      healthService.getAggregatedStepsByDate.mockResolvedValue([]);
      healthService.getAggregatedActiveCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedTotalCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedDistanceByDate.mockResolvedValue([]);
      healthService.getAggregatedFloorsClimbedByDate.mockResolvedValue([]);
      healthService.readHealthRecords.mockResolvedValue([]);
    });

    test('skips disabled metrics', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' ? Promise.resolve(true) : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);

      await triggerManualSync();

      expect(healthService.getAggregatedStepsByDate).toHaveBeenCalled();
      expect(healthService.getAggregatedActiveCaloriesByDate).not.toHaveBeenCalled();
      expect(healthService.readHealthRecords).not.toHaveBeenCalled();
    });

    test('skips raw metrics with empty results', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.readHealthRecords.mockResolvedValue([]);
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);

      await triggerManualSync();

      expect(healthService.transformHealthRecords).toHaveBeenCalledTimes(1);
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        [{ value: 5000 }],
        expect.objectContaining({ recordType: 'Steps' })
      );
    });

    test('skips raw metrics with null results', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.readHealthRecords.mockResolvedValue(null);
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);

      await triggerManualSync();

      expect(healthService.transformHealthRecords).toHaveBeenCalledTimes(1);
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        [{ value: 5000 }],
        expect.objectContaining({ recordType: 'Steps' })
      );
    });

    test('skips metrics with empty transformed results', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.readHealthRecords.mockResolvedValue([{ value: 72 }]);
      healthService.transformHealthRecords.mockImplementation((data, metric) => {
        if (metric.recordType === 'Steps') return data;
        return [];
      });

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 5000 }]);
    });
  });

  describe('API call', () => {
    beforeEach(() => {
      storage.loadLastSyncedTime.mockResolvedValue(new Date('2024-01-15T08:00:00Z').toISOString());
      healthService.getAggregatedStepsByDate.mockResolvedValue([]);
      healthService.getAggregatedActiveCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedTotalCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedDistanceByDate.mockResolvedValue([]);
      healthService.getAggregatedFloorsClimbedByDate.mockResolvedValue([]);
      healthService.readHealthRecords.mockResolvedValue([]);
    });

    test('sends collected data and saves timestamp when data exists', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.readHealthRecords.mockImplementation((type: string) => {
        if (type === 'HeartRate') return Promise.resolve([{ value: 72 }, { value: 75 }]);
        return Promise.resolve([]);
      });
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);
      healthService.aggregateByDay.mockImplementation((data: unknown[]) => data);
      api.syncHealthData.mockResolvedValue(undefined);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith(
        expect.arrayContaining([
          { value: 5000 },
          { value: 72 },
        ])
      );
      expect(mockRefreshHealthSyncCache).toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
    });

    test('does not call API or save timestamp when no data collected', async () => {
      healthService.loadHealthPreference.mockResolvedValue(false);

      await triggerManualSync();

      expect(api.syncHealthData).not.toHaveBeenCalled();
      expect(mockRefreshHealthSyncCache).not.toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('propagates error when api.syncHealthData throws', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isStepsSyncEnabled')
      );
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.transformHealthRecords.mockImplementation((data) => data);
      api.syncHealthData.mockRejectedValue(new Error('Network error'));

      await expect(triggerManualSync()).rejects.toThrow('Network error');
      expect(mockRefreshHealthSyncCache).not.toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('does not call API when all metrics return empty', async () => {
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getAggregatedStepsByDate.mockResolvedValue([]);
      healthService.readHealthRecords.mockResolvedValue([]);

      await triggerManualSync();

      expect(api.syncHealthData).not.toHaveBeenCalled();
      expect(mockRefreshHealthSyncCache).not.toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('refreshes caches even when timestamp save is skipped after a timeout', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isActiveCaloriesSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockRejectedValue(
        new TimeoutError('Background query for Steps', 60_000),
      );
      healthService.getAggregatedActiveCaloriesByDate.mockResolvedValue([{ value: 300 }]);
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 300 }]);
      expect(mockRefreshHealthSyncCache).toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('holds the cursor when the day-statistics read reports an error', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.readMinMaxAvgByDayDetailed.mockResolvedValueOnce({
        records: [],
        error: 'Protected health data is inaccessible',
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 5000 }]);
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('syncs collected data but skips timestamp save when a metric read is partial', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isActiveCaloriesSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      // First cumulative read (Steps) reports a partial-read error envelope; the
      // second (ActiveCalories) succeeds. Error envelopes come from the provider —
      // never null, which is reserved for capability-missing fallback.
      healthService.readCumulativeByDay
        .mockResolvedValueOnce({ records: [], error: 'startTime must be before endTime' })
        .mockResolvedValueOnce({ records: [{ value: 300 }] });
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 300 }]);
      expect(mockRefreshHealthSyncCache).toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('does not refresh caches when sync finishes in the background', async () => {
      setAppState('background');
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 5000 }]);
      expect(mockRefreshHealthSyncCache).not.toHaveBeenCalled();
      expect(storage.savePendingHealthSyncCacheRefresh).toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
    });

    test('flushes the pending refresh if the app becomes active while saving it', async () => {
      setAppState('background');
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);
      storage.savePendingHealthSyncCacheRefresh.mockImplementation(async () => {
        setAppState('active');
        storage.consumePendingHealthSyncCacheRefresh.mockResolvedValueOnce(true);
      });

      await triggerManualSync();

      expect(storage.savePendingHealthSyncCacheRefresh).toHaveBeenCalled();
      expect(storage.consumePendingHealthSyncCacheRefresh).toHaveBeenCalled();
      expect(mockRefreshHealthSyncCache).toHaveBeenCalledTimes(1);
    });

    test('flushes pending refresh when the app becomes active', async () => {
      storage.consumePendingHealthSyncCacheRefresh.mockResolvedValue(true);

      const refreshed = await flushPendingHealthSyncCacheRefresh();

      expect(refreshed).toBe(true);
      expect(storage.consumePendingHealthSyncCacheRefresh).toHaveBeenCalled();
      expect(mockRefreshHealthSyncCache).toHaveBeenCalledTimes(1);
    });

    test('does not flush pending refresh while the app is backgrounded', async () => {
      setAppState('background');

      const refreshed = await flushPendingHealthSyncCacheRefresh();

      expect(refreshed).toBe(false);
      expect(storage.consumePendingHealthSyncCacheRefresh).not.toHaveBeenCalled();
      expect(mockRefreshHealthSyncCache).not.toHaveBeenCalled();
    });
  });

  describe('Per-metric errors', () => {
    beforeEach(() => {
      storage.loadLastSyncedTime.mockResolvedValue(new Date('2024-01-15T08:00:00Z').toISOString());
      healthService.getAggregatedStepsByDate.mockResolvedValue([]);
      healthService.getAggregatedActiveCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedTotalCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedDistanceByDate.mockResolvedValue([]);
      healthService.getAggregatedFloorsClimbedByDate.mockResolvedValue([]);
      healthService.readHealthRecords.mockResolvedValue([]);
    });

    test('continues with remaining metrics when one throws', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockRejectedValue(new Error('Steps fetch failed'));
      healthService.readHealthRecords.mockImplementation((type: string) => {
        if (type === 'HeartRate') return Promise.resolve([{ value: 72 }]);
        return Promise.resolve([]);
      });
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);
      healthService.aggregateByDay.mockImplementation((data: unknown[]) => data);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalled();
      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 72 }]);
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('completes sync even when all metrics throw', async () => {
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getAggregatedStepsByDate.mockRejectedValue(new Error('Aggregation failed'));
      healthService.readHealthRecords.mockRejectedValue(new Error('Read failed'));

      await triggerManualSync();

      expect(api.syncHealthData).not.toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('continues when aggregation post-processing throws', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.readHealthRecords.mockImplementation((type: string) => {
        if (type === 'HeartRate') return Promise.resolve([{ value: 72 }]);
        return Promise.resolve([]);
      });
      healthService.transformHealthRecords.mockImplementation((data: unknown[]) => data);
      healthService.aggregateByDay.mockImplementation(() => {
        throw new Error('Aggregation logic failed');
      });

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 5000 }]);
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('continues when transformation throws', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) => {
        return key === 'isStepsSyncEnabled' || key === 'isHeartRateSyncEnabled'
          ? Promise.resolve(true)
          : Promise.resolve(false);
      });
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.readHealthRecords.mockImplementation((type: string) => {
        if (type === 'HeartRate') return Promise.resolve([{ value: 72 }]);
        return Promise.resolve([]);
      });
      healthService.transformHealthRecords.mockImplementation((data: unknown[], metric: { recordType: string }) => {
        if (metric.recordType === 'HeartRate') throw new Error('Transform failed');
        return data;
      });

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 5000 }]);
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });
  });

  describe('Locked-device detection', () => {
    beforeEach(() => {
      storage.loadLastSyncedTime.mockResolvedValue(new Date('2024-01-15T08:00:00Z').toISOString());
      healthService.getAggregatedStepsByDate.mockResolvedValue([]);
      healthService.getAggregatedActiveCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedTotalCaloriesByDate.mockResolvedValue([]);
      healthService.getAggregatedDistanceByDate.mockResolvedValue([]);
      healthService.getAggregatedFloorsClimbedByDate.mockResolvedValue([]);
      healthService.readHealthRecords.mockResolvedValue([]);
    });

    test('resets counter at start of sync', async () => {
      healthService.loadHealthPreference.mockResolvedValue(false);

      await triggerManualSync();

      expect(healthService.resetDatabaseInaccessibleCount).toHaveBeenCalled();
    });

    test('skips timestamp save when all queries are inaccessible and no data collected', async () => {
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getDatabaseInaccessibleCount.mockReturnValue(3);

      await triggerManualSync();

      expect(api.syncHealthData).not.toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('proceeds with sync when some data collected despite inaccessible queries', async () => {
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.transformHealthRecords.mockImplementation((data) => data);
      healthService.getDatabaseInaccessibleCount.mockReturnValue(2);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith(
        expect.arrayContaining([{ value: 5000 }])
      );
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
    });

    test('normal sync proceeds when inaccessible count is zero', async () => {
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getAggregatedStepsByDate.mockResolvedValue([{ value: 5000 }]);
      healthService.transformHealthRecords.mockImplementation((data) => data);
      healthService.getDatabaseInaccessibleCount.mockReturnValue(0);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
    });

    test('no data + no inaccessible errors = normal "no data" behavior', async () => {
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getDatabaseInaccessibleCount.mockReturnValue(0);

      await triggerManualSync();

      expect(api.syncHealthData).not.toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });
  });
});
