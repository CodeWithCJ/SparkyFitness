import {
  syncHealthData,
  initHealthConnect,
} from '../../src/services/healthConnectService.ios';

import {
  isHealthDataAvailable,
  queryStatisticsForQuantity,
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
    { recordType: 'ActiveCaloriesBurned', stateKey: 'isCaloriesSyncEnabled', unit: 'kcal', type: 'active_calories' },
    { recordType: 'RunningSpeed', stateKey: 'isRunningSpeedSyncEnabled', unit: 'm/s', type: 'running_speed', aggregationStrategy: 'min-max-avg' },
  ],
}));

const mockIsHealthDataAvailable = isHealthDataAvailable as jest.Mock;
const mockQueryStatisticsForQuantity = queryStatisticsForQuantity as jest.Mock;
const mockQueryQuantitySamples = queryQuantitySamples as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../src/services/api/healthDataApi') as { syncHealthData: jest.Mock };

describe('syncHealthData (iOS)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Initialize HealthKit as available for most tests
    mockIsHealthDataAvailable.mockResolvedValue(true);
    await initHealthConnect();
  });

  test('returns success with no data when no metrics enabled', async () => {
    const result = await syncHealthData('24h' as SyncDuration, {} as HealthMetricStates);

    expect(result.success).toBe(true);
    expect(result.message).toBe('No new health data to sync.');
    expect(api.syncHealthData).not.toHaveBeenCalled();
  });

  test('sends transformed data to API and returns response', async () => {
    // Mock Steps aggregation query
    mockQueryStatisticsForQuantity.mockResolvedValue({
      sumQuantity: { quantity: 5000 },
    });
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
    mockQueryStatisticsForQuantity.mockResolvedValue({
      sumQuantity: { quantity: 5000 },
    });
    api.syncHealthData.mockRejectedValue(new Error('Network error'));

    const result = await syncHealthData('today' as SyncDuration, { isStepsSyncEnabled: true });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  test('continues processing when one metric returns no data', async () => {
    // Steps returns no data (this is the behavior when query fails - it returns empty)
    mockQueryStatisticsForQuantity.mockResolvedValue(null);
    // HeartRate succeeds with raw samples
    const today = new Date().toISOString();
    mockQueryQuantitySamples.mockResolvedValue([
      { startDate: today, endDate: today, quantity: 72 },
      { startDate: today, endDate: today, quantity: 80 },
      { startDate: today, endDate: today, quantity: 64 },
    ]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isStepsSyncEnabled: true,
      isHeartRateSyncEnabled: true,
    });

    expect(result.success).toBe(true);

    // HeartRate now aggregates to min/max/avg
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
  });

  test('aggregates RunningSpeed into min/max/avg records', async () => {
    const today = new Date();
    const todayStr = today.toISOString();

    // RunningSpeed uses queryQuantitySamples (standard quantity handler)
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
});
