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

jest.mock('../../src/services/api', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../src/constants/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { recordType: 'Steps', stateKey: 'isStepsSyncEnabled', unit: 'count', type: 'step' },
    { recordType: 'HeartRate', stateKey: 'isHeartRateSyncEnabled', unit: 'bpm', type: 'heart_rate' },
    { recordType: 'ActiveCaloriesBurned', stateKey: 'isCaloriesSyncEnabled', unit: 'kcal', type: 'active_calories' },
  ],
}));

const mockIsHealthDataAvailable = isHealthDataAvailable as jest.Mock;
const mockQueryStatisticsForQuantity = queryStatisticsForQuantity as jest.Mock;
const mockQueryQuantitySamples = queryQuantitySamples as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../src/services/api') as { syncHealthData: jest.Mock };

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
    // HeartRate succeeds
    const today = new Date().toISOString();
    mockQueryQuantitySamples.mockResolvedValue([
      { startDate: today, quantity: 72 },
    ]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today' as SyncDuration, {
      isStepsSyncEnabled: true,
      isHeartRateSyncEnabled: true,
    });

    expect(result.success).toBe(true);

    // Verify HeartRate data is synced with correct shape, even though Steps had no data
    expect(api.syncHealthData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'heart_rate',
          value: 72,
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          unit: 'bpm',
        }),
      ])
    );
  });
});
