import {
  syncHealthData,
  initHealthConnect,
} from '../../src/services/healthConnectService.ios';

import {
  isHealthDataAvailable,
  queryStatisticsCollectionForQuantity,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';

import type { HealthMetricStates } from '../../src/types/healthRecords';
import type { SyncDuration } from '../../src/services/healthkit/preferences';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/api/healthDataApi', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../src/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { recordType: 'Steps', stateKey: 'isStepsSyncEnabled', unit: 'count', type: 'step' },
    { recordType: 'HeartRate', stateKey: 'isHeartRateSyncEnabled', unit: 'bpm', type: 'heart_rate', aggregationStrategy: 'min-max-avg' },
    { recordType: 'HeartRateVariabilitySDNN', stateKey: 'isHeartRateVariabilitySyncEnabled', unit: 'ms', type: 'HRV_SDNN', aggregationStrategy: 'min-max-avg' },
    { recordType: 'ActiveCaloriesBurned', stateKey: 'isCaloriesSyncEnabled', unit: 'kcal', type: 'active_calories' },
    { recordType: 'TotalCaloriesBurned', stateKey: 'isTotalCaloriesSyncEnabled', unit: 'kcal', type: 'total_calories' },
    { recordType: 'RunningSpeed', stateKey: 'isRunningSpeedSyncEnabled', unit: 'm/s', type: 'running_speed', aggregationStrategy: 'min-max-avg' },
  ],
}));

const mockIsHealthDataAvailable = isHealthDataAvailable as jest.Mock;
const mockQueryStatisticsCollection = queryStatisticsCollectionForQuantity as jest.Mock;
const mockQueryQuantitySamples = queryQuantitySamples as jest.Mock;

const api = require('../../src/services/api/healthDataApi') as { syncHealthData: jest.Mock };

const startOfToday = () => {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
};

const startOfTomorrow = () => {
  const day = startOfToday();
  day.setDate(day.getDate() + 1);
  return day;
};

// Today's statistics-collection bucket with a cumulative sum.
const sumBucket = (quantity: number, unit = 'kcal') => ({
  startDate: startOfToday(),
  endDate: startOfTomorrow(),
  sumQuantity: { unit, quantity },
});

// Today's statistics-collection bucket with discrete min/max/avg.
const statsBucket = (min: number, max: number, avg: number, unit = 'count/min') => ({
  startDate: startOfToday(),
  endDate: startOfTomorrow(),
  minimumQuantity: { unit, quantity: min },
  maximumQuantity: { unit, quantity: max },
  averageQuantity: { unit, quantity: avg },
});

describe('syncHealthData (iOS)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Initialize HealthKit as available for most tests
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockQueryStatisticsCollection.mockReset().mockResolvedValue([]);
    await initHealthConnect();
  });

  test('returns success with no data when no metrics enabled', async () => {
    const result = await syncHealthData('24h' as SyncDuration, {} as HealthMetricStates);

    expect(result.success).toBe(true);
    expect(result.message).toBe('No new health data to sync.');
    expect(api.syncHealthData).not.toHaveBeenCalled();
  });

  test('sends transformed data to API and returns response', async () => {
    // Steps aggregation: one statistics-collection bucket for today
    mockQueryStatisticsCollection.mockResolvedValue([sumBucket(5000, 'count')]);
    api.syncHealthData.mockResolvedValue({ processed: 1, success: true });

    const result = await syncHealthData('today' as SyncDuration, { isStepsSyncEnabled: true });

    expect(result.success).toBe(true);
    expect(result.apiResponse).toEqual({ processed: 1, success: true });

    // Verify the data shape sent to API - this catches transformation bugs
    expect(api.syncHealthData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'step',
          value: 5000,
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          unit: 'count',
        }),
      ])
    );
  });

  test('returns error when API call fails', async () => {
    mockQueryStatisticsCollection.mockResolvedValue([sumBucket(5000, 'count')]);
    api.syncHealthData.mockRejectedValue(new Error('Network error'));

    const result = await syncHealthData('today' as SyncDuration, { isStepsSyncEnabled: true });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  test('continues processing when one metric returns no data', async () => {
    // Steps collection returns no buckets; HeartRate day statistics succeed
    mockQueryStatisticsCollection.mockImplementation((identifier: string) => {
      if (identifier === 'HKQuantityTypeIdentifierHeartRate') {
        return Promise.resolve([statsBucket(64, 80, 72)]);
      }
      return Promise.resolve([]);
    });
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isStepsSyncEnabled: true,
      isHeartRateSyncEnabled: true,
    });

    expect(result.success).toBe(true);

    // HeartRate day statistics map to min/max/avg records
    const sentData = api.syncHealthData.mock.calls[0][0];
    const types = sentData.map((r: { type: string }) => r.type);

    expect(types).toContain('heart_rate_min');
    expect(types).toContain('heart_rate_max');
    expect(types).toContain('heart_rate_avg');
    expect(types).not.toContain('heart_rate');

    const minRecord = sentData.find((r: { type: string }) => r.type === 'heart_rate_min');
    const maxRecord = sentData.find((r: { type: string }) => r.type === 'heart_rate_max');
    const avgRecord = sentData.find((r: { type: string }) => r.type === 'heart_rate_avg');

    expect(minRecord.value).toBe(64);
    expect(maxRecord.value).toBe(80);
    expect(avgRecord.value).toBe(72);
    expect(minRecord.unit).toBe('bpm');
  });

  test('HeartRate uses native day statistics, not raw samples', async () => {
    mockQueryStatisticsCollection.mockResolvedValue([statsBucket(48, 120, 72.4)]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, { isHeartRateSyncEnabled: true });

    expect(result.success).toBe(true);
    // No raw sample read for HeartRate — one discrete-statistics collection query instead.
    expect(mockQueryQuantitySamples).not.toHaveBeenCalled();
    expect(mockQueryStatisticsCollection).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierHeartRate',
      ['discreteMin', 'discreteMax', 'discreteAverage'],
      expect.any(Date),
      { day: 1 },
      expect.objectContaining({ unit: 'count/min' }),
    );
  });

  test('aggregates HeartRateVariabilitySDNN into min/max/avg daily HRV records via day statistics', async () => {
    mockQueryStatisticsCollection.mockResolvedValue([statsBucket(30, 52, 43.333, 'ms')]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isHeartRateVariabilitySyncEnabled: true,
    });

    expect(result.success).toBe(true);
    expect(api.syncHealthData).toHaveBeenCalledTimes(1);
    expect(mockQueryQuantitySamples).not.toHaveBeenCalled();

    const sentData = api.syncHealthData.mock.calls[0][0];
    const types = sentData.map((r: { type: string }) => r.type);

    // Apple HRV is SDNN (a distinct metric from RMSSD), sent as HRV_SDNN
    expect(types).toContain('HRV_SDNN_min');
    expect(types).toContain('HRV_SDNN_max');
    expect(types).toContain('HRV_SDNN_avg');
    expect(types).not.toContain('HRV_SDNN');

    const minRecord = sentData.find((r: { type: string }) => r.type === 'HRV_SDNN_min');
    const maxRecord = sentData.find((r: { type: string }) => r.type === 'HRV_SDNN_max');
    const avgRecord = sentData.find((r: { type: string }) => r.type === 'HRV_SDNN_avg');

    expect(minRecord.value).toBe(30);
    expect(maxRecord.value).toBe(52);
    expect(avgRecord.value).toBe(43.33);
    expect(minRecord.unit).toBe('ms');
  });

  test('aggregates RunningSpeed into min/max/avg records via the raw sample fallback', async () => {
    const today = new Date();
    const todayStr = today.toISOString();

    // RunningSpeed has no verified day-statistics spec, so it stays on
    // queryQuantitySamples (standard quantity handler) + aggregateByDay.
    mockQueryQuantitySamples.mockResolvedValue([
      { startDate: todayStr, endDate: todayStr, quantity: 2.5 },
      { startDate: todayStr, endDate: todayStr, quantity: 3.0 },
      { startDate: todayStr, endDate: todayStr, quantity: 4.0 },
    ]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isRunningSpeedSyncEnabled: true,
    });

    expect(result.success).toBe(true);
    expect(api.syncHealthData).toHaveBeenCalledTimes(1);
    // The fallback must not issue a day-statistics query.
    expect(mockQueryStatisticsCollection).not.toHaveBeenCalled();

    const sentData = api.syncHealthData.mock.calls[0][0];
    const types = sentData.map((r: { type: string }) => r.type);

    // Should contain aggregated types, not raw running_speed
    expect(types).toContain('running_speed_min');
    expect(types).toContain('running_speed_max');
    expect(types).toContain('running_speed_avg');
    expect(types).not.toContain('running_speed');

    // Verify values
    const minRecord = sentData.find((r: { type: string }) => r.type === 'running_speed_min');
    const maxRecord = sentData.find((r: { type: string }) => r.type === 'running_speed_max');
    const avgRecord = sentData.find((r: { type: string }) => r.type === 'running_speed_avg');

    expect(minRecord.value).toBe(2.5);
    expect(maxRecord.value).toBe(4.0);
    expect(avgRecord.value).toBeCloseTo(3.17, 2);
  });

  test('TotalCaloriesBurned uses aggregation API, not raw records', async () => {
    // The collection query runs twice: basal + active energy (1000 kcal each)
    mockQueryStatisticsCollection.mockResolvedValue([sumBucket(1000)]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isTotalCaloriesSyncEnabled: true,
    });

    expect(result.success).toBe(true);

    // Should NOT read raw samples — only the statistics API should be used
    expect(mockQueryQuantitySamples).not.toHaveBeenCalled();
    expect(mockQueryStatisticsCollection).toHaveBeenCalledTimes(2);

    const sentData = api.syncHealthData.mock.calls[0][0];
    const calorieRecords = sentData.filter((r: { type: string }) => r.type === 'total_calories');
    expect(calorieRecords.length).toBeGreaterThan(0);
    // 1000 basal + 1000 active = 2000
    expect(calorieRecords[0].value).toBe(2000);
  });

  test('puts a failed metric read into syncErrors while other metrics still sync', async () => {
    mockQueryStatisticsCollection.mockImplementation((identifier: string) => {
      if (identifier === 'HKQuantityTypeIdentifierStepCount') {
        return Promise.reject(new Error('Query failed'));
      }
      return Promise.resolve([statsBucket(64, 80, 72)]); // HeartRate
    });
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isStepsSyncEnabled: true,
      isHeartRateSyncEnabled: true,
    });

    expect(result.success).toBe(true);
    expect(result.syncErrors).toEqual([{ type: 'Steps', error: 'Query failed' }]);

    const sentData = api.syncHealthData.mock.calls[0][0];
    const types = sentData.map((r: { type: string }) => r.type);
    expect(types).toContain('heart_rate_min');
  });

  test('locked-device read failures surface as sync errors instead of "synced, 0 records"', async () => {
    // Regression: read errors used to be swallowed (log + return []), so a locked-device
    // sync looked successful, syncErrors stayed empty, and the cursor advanced past the
    // unread window. useSyncHealthData holds lastSyncedTime whenever syncErrors is
    // non-empty, so surfacing the error here is what keeps the cursor in place.
    mockQueryQuantitySamples.mockRejectedValue(new Error('Protected health data is inaccessible'));
    mockQueryStatisticsCollection.mockResolvedValue([sumBucket(5000, 'count')]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isStepsSyncEnabled: true,
      isRunningSpeedSyncEnabled: true,
    });

    expect(result.success).toBe(true);
    expect(result.syncErrors).toEqual([
      { type: 'RunningSpeed', error: expect.stringContaining('Protected health data') },
    ]);
    // Partial data (Steps) still syncs.
    expect(api.syncHealthData).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'step', value: 5000 })])
    );
  });
});
