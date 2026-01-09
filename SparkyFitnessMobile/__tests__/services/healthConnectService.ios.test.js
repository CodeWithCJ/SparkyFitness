import {
  syncHealthData,
  initHealthConnect,
} from '../../src/services/healthConnectService.ios';

import {
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';

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

const api = require('../../src/services/api');

describe('syncHealthData (iOS)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Initialize HealthKit as available for most tests
    isHealthDataAvailable.mockResolvedValue(true);
    await initHealthConnect();
  });

  test('returns success with no data when no metrics enabled', async () => {
    const result = await syncHealthData('24h', {});

    expect(result.success).toBe(true);
    expect(result.message).toBe('No new health data to sync.');
    expect(api.syncHealthData).not.toHaveBeenCalled();
  });

  test('sends transformed data to API and returns response', async () => {
    // Mock Steps aggregation query
    queryStatisticsForQuantity.mockResolvedValue({
      sumQuantity: { quantity: 5000 },
    });
    api.syncHealthData.mockResolvedValue({ processed: 1, success: true });

    const result = await syncHealthData('today', { isStepsSyncEnabled: true });

    expect(result.success).toBe(true);
    expect(result.apiResponse).toEqual({ processed: 1, success: true });
    expect(api.syncHealthData).toHaveBeenCalled();
  });

  test('returns error when API call fails', async () => {
    queryStatisticsForQuantity.mockResolvedValue({
      sumQuantity: { quantity: 5000 },
    });
    api.syncHealthData.mockRejectedValue(new Error('Network error'));

    const result = await syncHealthData('today', { isStepsSyncEnabled: true });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  test('continues processing when one metric returns no data', async () => {
    // Steps returns no data (this is the behavior when query fails - it returns empty)
    queryStatisticsForQuantity.mockResolvedValue(null);
    // HeartRate succeeds
    queryQuantitySamples.mockResolvedValue([
      { startDate: new Date().toISOString(), quantity: 72 },
    ]);
    api.syncHealthData.mockResolvedValue({ success: true });

    const result = await syncHealthData('today', {
      isStepsSyncEnabled: true,
      isHeartRateSyncEnabled: true,
    });

    expect(result.success).toBe(true);
    // HeartRate data should still be synced even though Steps had no data
    expect(api.syncHealthData).toHaveBeenCalled();
  });
});
