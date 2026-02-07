import { triggerManualSync } from '../../src/services/backgroundSyncService';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/api', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  loadLastSyncedTime: jest.fn(),
  saveLastSyncedTime: jest.fn(),
  loadBackgroundSyncEnabled: jest.fn(),
}));

jest.mock('../../src/constants/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { id: 'steps', recordType: 'Steps', preferenceKey: 'isStepsSyncEnabled', label: 'Steps' },
    { id: 'active-calories', recordType: 'ActiveCaloriesBurned', preferenceKey: 'isActiveCaloriesSyncEnabled', label: 'Active Calories' },
    { id: 'total-calories', recordType: 'TotalCaloriesBurned', preferenceKey: 'isTotalCaloriesSyncEnabled', label: 'Total Calories' },
    { id: 'distance', recordType: 'Distance', preferenceKey: 'isDistanceSyncEnabled', label: 'Distance' },
    { id: 'floors', recordType: 'FloorsClimbed', preferenceKey: 'isFloorsClimbedSyncEnabled', label: 'Floors' },
    { id: 'heart-rate', recordType: 'HeartRate', preferenceKey: 'isHeartRateSyncEnabled', label: 'Heart Rate' },
    { id: 'sleep', recordType: 'SleepSession', preferenceKey: 'isSleepSyncEnabled', label: 'Sleep' },
    { id: 'weight', recordType: 'Weight', preferenceKey: 'isWeightSyncEnabled', label: 'Weight' },
  ],
}));

jest.mock('../../src/services/healthConnectService', () => ({
  loadHealthPreference: jest.fn(),
  readHealthRecords: jest.fn(),
  transformHealthRecords: jest.fn((data) => data),
  aggregateSleepSessions: jest.fn((data) => data),
  aggregateHeartRateByDate: jest.fn((data) => data),
  getAggregatedStepsByDate: jest.fn(),
  getAggregatedActiveCaloriesByDate: jest.fn(),
  getAggregatedTotalCaloriesByDate: jest.fn(),
  getAggregatedDistanceByDate: jest.fn(),
  getAggregatedFloorsClimbedByDate: jest.fn(),
}));

const api = require('../../src/services/api') as { syncHealthData: jest.Mock };
const storage = require('../../src/services/storage') as {
  loadLastSyncedTime: jest.Mock;
  saveLastSyncedTime: jest.Mock;
  loadBackgroundSyncEnabled: jest.Mock;
};
const healthService = require('../../src/services/healthConnectService') as {
  loadHealthPreference: jest.Mock;
  readHealthRecords: jest.Mock;
  transformHealthRecords: jest.Mock;
  aggregateSleepSessions: jest.Mock;
  aggregateHeartRateByDate: jest.Mock;
  getAggregatedStepsByDate: jest.Mock;
  getAggregatedActiveCaloriesByDate: jest.Mock;
  getAggregatedTotalCaloriesByDate: jest.Mock;
  getAggregatedDistanceByDate: jest.Mock;
  getAggregatedFloorsClimbedByDate: jest.Mock;
};

describe('performBackgroundSync (via triggerManualSync)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T14:30:00Z'));
    jest.spyOn(console, 'log').mockImplementation();
    api.syncHealthData.mockResolvedValue(undefined);
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

    test('routes HeartRate through readHealthRecords then aggregateHeartRateByDate', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isHeartRateSyncEnabled')
      );
      const rawHeartRate = [{ value: 72 }, { value: 75 }];
      const aggregatedHeartRate = [{ avg: 73.5 }];
      healthService.readHealthRecords.mockResolvedValue(rawHeartRate);
      healthService.aggregateHeartRateByDate.mockReturnValue(aggregatedHeartRate);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalledWith('HeartRate', expect.any(Date), expect.any(Date));
      expect(healthService.aggregateHeartRateByDate).toHaveBeenCalledWith(rawHeartRate);
      expect(healthService.transformHealthRecords).toHaveBeenCalledWith(
        aggregatedHeartRate,
        expect.objectContaining({ recordType: 'HeartRate' })
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

    test('routes Weight through readHealthRecords without post-processing', async () => {
      healthService.loadHealthPreference.mockImplementation((key: string) =>
        Promise.resolve(key === 'isWeightSyncEnabled')
      );
      const rawWeight = [{ value: 75.5 }];
      healthService.readHealthRecords.mockResolvedValue(rawWeight);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalledWith('Weight', expect.any(Date), expect.any(Date));
      expect(healthService.aggregateHeartRateByDate).not.toHaveBeenCalled();
      expect(healthService.aggregateSleepSessions).not.toHaveBeenCalled();
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
      healthService.aggregateHeartRateByDate.mockImplementation((data) => data);
      healthService.transformHealthRecords.mockImplementation((data) => data);
      api.syncHealthData.mockResolvedValue(undefined);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith(
        expect.arrayContaining([
          { value: 5000 },
          { value: 72 },
        ])
      );
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
    });

    test('does not call API or save timestamp when no data collected', async () => {
      healthService.loadHealthPreference.mockResolvedValue(false);

      await triggerManualSync();

      expect(api.syncHealthData).not.toHaveBeenCalled();
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
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
    });

    test('does not call API when all metrics return empty', async () => {
      healthService.loadHealthPreference.mockResolvedValue(true);
      healthService.getAggregatedStepsByDate.mockResolvedValue([]);
      healthService.readHealthRecords.mockResolvedValue([]);

      await triggerManualSync();

      expect(api.syncHealthData).not.toHaveBeenCalled();
      expect(storage.saveLastSyncedTime).not.toHaveBeenCalled();
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
      healthService.aggregateHeartRateByDate.mockImplementation((data) => data);
      healthService.transformHealthRecords.mockImplementation((data) => data);

      await triggerManualSync();

      expect(healthService.readHealthRecords).toHaveBeenCalled();
      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 72 }]);
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
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
      healthService.aggregateHeartRateByDate.mockImplementation(() => {
        throw new Error('Aggregation logic failed');
      });
      healthService.transformHealthRecords.mockImplementation((data) => data);

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 5000 }]);
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
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
      healthService.aggregateHeartRateByDate.mockImplementation((data) => data);
      healthService.transformHealthRecords.mockImplementation((data, metric) => {
        if (metric.recordType === 'HeartRate') throw new Error('Transform failed');
        return data;
      });

      await triggerManualSync();

      expect(api.syncHealthData).toHaveBeenCalledWith([{ value: 5000 }]);
      expect(storage.saveLastSyncedTime).toHaveBeenCalled();
    });
  });
});
