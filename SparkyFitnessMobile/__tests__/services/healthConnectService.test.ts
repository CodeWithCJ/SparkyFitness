/**
 * Tests for healthConnectService.ts (Android)
 *
 * Note: We use require() to explicitly load the Android file
 * since Jest's platform resolution on macOS defaults to .ios.ts files.
 */

import { readRecords } from 'react-native-health-connect';

import type { AggregatedHealthRecord, HealthMetricStates, SyncResult } from '../../src/types/healthRecords';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockApiSyncHealthData = jest.fn();
jest.mock('../../src/services/api/healthDataApi', () => ({
  syncHealthData: (...args: unknown[]) => mockApiSyncHealthData(...args),
}));

jest.mock('../../src/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { recordType: 'Steps', stateKey: 'isStepsSyncEnabled', unit: 'count', type: 'step' },
    { recordType: 'HeartRate', stateKey: 'isHeartRateSyncEnabled', unit: 'bpm', type: 'heart_rate' },
    { recordType: 'TotalCaloriesBurned', stateKey: 'isTotalCaloriesSyncEnabled', unit: 'kcal', type: 'total_calories' },
    { recordType: 'ActiveCaloriesBurned', stateKey: 'isCaloriesSyncEnabled', unit: 'kcal', type: 'active_calories' },
  ],
}));

const mockReadRecords = readRecords as jest.Mock;

// Load the Android-specific file using explicit .ts extension
// This bypasses Jest's platform resolution which would otherwise load .ios.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const androidService = require('../../src/services/healthConnectService.ts') as {
  getAggregatedTotalCaloriesByDate: (startDate: Date, endDate: Date) => Promise<AggregatedHealthRecord[]>;
  getAggregatedDistanceByDate: (startDate: Date, endDate: Date) => Promise<AggregatedHealthRecord[]>;
  getAggregatedFloorsClimbedByDate: (startDate: Date, endDate: Date) => Promise<AggregatedHealthRecord[]>;
  syncHealthData: (syncDuration: string, healthMetricStates?: HealthMetricStates) => Promise<SyncResult>;
  readStressRecords: (startDate: Date, endDate: Date) => Promise<unknown[]>;
};

describe('healthConnectService.ts (Android)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAggregatedTotalCaloriesByDate', () => {
    test('aggregates calories by date from multiple records', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', energy: { inKilocalories: 200 } },
          { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 300 } },
        ],
      });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        date: '2024-01-15',
        value: 500,
        type: 'total_calories',
      });
    });

    test('returns empty array when no records', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });

    test('handles records with time field (fallback from startTime)', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { time: '2024-01-16T10:00:00Z', energy: { inKilocalories: 150 } },
        ],
      });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        new Date('2024-01-16T00:00:00Z'),
        new Date('2024-01-16T23:59:59Z')
      );

      expect(result[0].date).toBe('2024-01-16');
    });

    test('handles missing energy property (treats as 0)', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z' },
          { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 300 } },
        ],
      });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result[0].value).toBe(300);
    });

    test('rounds calorie values', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', energy: { inKilocalories: 200.7 } },
          { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 299.8 } },
        ],
      });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result[0].value).toBe(501);
    });

    test('groups multiple days correctly', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T10:00:00Z', energy: { inKilocalories: 200 } },
          { startTime: '2024-01-16T10:00:00Z', energy: { inKilocalories: 300 } },
          { startTime: '2024-01-16T14:00:00Z', energy: { inKilocalories: 100 } },
        ],
      });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-16T23:59:59Z')
      );

      expect(result).toHaveLength(2);
      expect(result.find(r => r.date === '2024-01-15')?.value).toBe(200);
      expect(result.find(r => r.date === '2024-01-16')?.value).toBe(400);
    });

    test('skips records with missing timestamp', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { energy: { inKilocalories: 100 } }, // No startTime or time
          { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 200 } },
        ],
      });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(200);
    });
  });

  describe('getAggregatedDistanceByDate', () => {
    test('aggregates distance by date', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', distance: { inMeters: 1000 } },
          { startTime: '2024-01-15T12:00:00Z', distance: { inMeters: 2000 } },
        ],
      });

      const result = await androidService.getAggregatedDistanceByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        date: '2024-01-15',
        value: 3000,
        type: 'distance',
      });
    });

    test('returns empty array when no records', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });

      const result = await androidService.getAggregatedDistanceByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });

    test('handles missing distance property', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z' },
          { startTime: '2024-01-15T12:00:00Z', distance: { inMeters: 2000 } },
        ],
      });

      const result = await androidService.getAggregatedDistanceByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result[0].value).toBe(2000);
    });

    test('skips records with missing timestamp', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { distance: { inMeters: 500 } }, // No startTime or time
          { startTime: '2024-01-15T12:00:00Z', distance: { inMeters: 1000 } },
        ],
      });

      const result = await androidService.getAggregatedDistanceByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1000);
    });
  });

  describe('getAggregatedFloorsClimbedByDate', () => {
    test('aggregates floors by date', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', floors: 5 },
          { startTime: '2024-01-15T12:00:00Z', floors: 3 },
        ],
      });

      const result = await androidService.getAggregatedFloorsClimbedByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        date: '2024-01-15',
        value: 8,
        type: 'floors_climbed',
      });
    });

    test('returns empty array when no records', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });

      const result = await androidService.getAggregatedFloorsClimbedByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });

    test('handles missing floors property', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z' },
          { startTime: '2024-01-15T12:00:00Z', floors: 3 },
        ],
      });

      const result = await androidService.getAggregatedFloorsClimbedByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result[0].value).toBe(3);
    });

    test('skips records with missing timestamp', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { floors: 2 }, // No startTime or time
          { startTime: '2024-01-15T12:00:00Z', floors: 5 },
        ],
      });

      const result = await androidService.getAggregatedFloorsClimbedByDate(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(5);
    });
  });

  describe('syncHealthData', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockApiSyncHealthData.mockResolvedValue({ success: true });
    });

    test('sends correctly shaped HealthDataPayload to API', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 5000 },
        ],
      });

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      expect(mockApiSyncHealthData).toHaveBeenCalledTimes(1);
      const payload = mockApiSyncHealthData.mock.calls[0][0];

      // Verify the payload structure
      expect(Array.isArray(payload)).toBe(true);
      expect(payload.length).toBeGreaterThan(0);
      expect(payload[0]).toMatchObject({
        value: expect.any(Number),
        type: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        unit: expect.any(String),
      });
    });

    test('Steps records are deduplicated and aggregated by date', async () => {
      // Multiple step records on same day should be summed into single daily total
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 2000 },
          { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 3000 },
          { startTime: '2024-01-15T18:00:00Z', endTime: '2024-01-15T19:00:00Z', count: 1500 },
        ],
      });

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const stepRecords = payload.filter((r: { type: string }) => r.type === 'step');

      // Should have single aggregated record, not 3 raw records
      expect(stepRecords).toHaveLength(1);
      expect(stepRecords[0].value).toBe(6500); // 2000 + 3000 + 1500
      expect(stepRecords[0].date).toBe('2024-01-15');
    });

    test('ActiveCalories records are deduplicated and aggregated by date', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', energy: { inKilocalories: 150 } },
          { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', energy: { inKilocalories: 200 } },
        ],
      });

      const healthMetricStates: HealthMetricStates = { isCaloriesSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      // Type is preserved from the aggregation function output ('active_calories' from getAggregatedActiveCaloriesByDate)
      const calorieRecords = payload.filter((r: { type: string }) => r.type === 'active_calories');

      expect(calorieRecords).toHaveLength(1);
      expect(calorieRecords[0].value).toBe(350); // 150 + 200
    });

    test('HeartRate records are averaged by date', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 60 }] },
          { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 80 }] },
          { startTime: '2024-01-15T18:00:00Z', samples: [{ beatsPerMinute: 70 }] },
        ],
      });

      const healthMetricStates: HealthMetricStates = { isHeartRateSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const hrRecords = payload.filter((r: { type: string }) => r.type === 'heart_rate');

      expect(hrRecords).toHaveLength(1);
      expect(hrRecords[0].value).toBe(70); // Average of 60, 80, 70
    });

    test('TotalCalories records are aggregated by date', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T08:00:00Z', energy: { inKilocalories: 500 } },
          { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 600 } },
        ],
      });

      const healthMetricStates: HealthMetricStates = { isTotalCaloriesSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const calorieRecords = payload.filter((r: { type: string }) => r.type === 'total_calories');

      expect(calorieRecords).toHaveLength(1);
      expect(calorieRecords[0].value).toBe(1100); // 500 + 600
    });

    test('does not call API when no metrics enabled', async () => {
      const result = await androidService.syncHealthData('24h', {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('No health data to sync.');
      expect(mockApiSyncHealthData).not.toHaveBeenCalled();
    });

    test('continues sync when one metric returns no records', async () => {
      // Steps returns no records, HeartRate has data
      mockReadRecords.mockImplementation((recordType: string) => {
        if (recordType === 'Steps') {
          // No steps found
          return Promise.resolve({ records: [] });
        }
        if (recordType === 'HeartRate') {
          return Promise.resolve({
            records: [
              { startTime: '2024-01-15T10:00:00Z', samples: [{ beatsPerMinute: 72 }] },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      const healthMetricStates: HealthMetricStates = {
        isStepsSyncEnabled: true,
        isHeartRateSyncEnabled: true,
      };

      const result = await androidService.syncHealthData('24h', healthMetricStates);

      // Should succeed with partial data
      expect(result.success).toBe(true);
      expect(mockApiSyncHealthData).toHaveBeenCalled();

      // HeartRate data should be synced despite Steps having no data
      const payload = mockApiSyncHealthData.mock.calls[0][0];
      expect(payload.some((r: { type: string }) => r.type === 'heart_rate')).toBe(true);

      // Steps should not be in the payload (no records)
      expect(payload.some((r: { type: string }) => r.type === 'step')).toBe(false);
    });

    test('returns error when API call fails', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', count: 5000 },
        ],
      });
      mockApiSyncHealthData.mockRejectedValue(new Error('Server unavailable'));

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      const result = await androidService.syncHealthData('24h', healthMetricStates);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server unavailable');
    });

    test('returns apiResponse from successful sync', async () => {
      mockReadRecords.mockResolvedValue({
        records: [
          { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', count: 5000 },
        ],
      });
      mockApiSyncHealthData.mockResolvedValue({ processed: 1, status: 'ok' });

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      const result = await androidService.syncHealthData('24h', healthMetricStates);

      expect(result.success).toBe(true);
      expect(result.apiResponse).toEqual({ processed: 1, status: 'ok' });
    });
  });

  describe('readStressRecords', () => {
    test('returns empty array on Android (iOS-only metric)', async () => {
      const result = await androidService.readStressRecords(
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });
  });

});
