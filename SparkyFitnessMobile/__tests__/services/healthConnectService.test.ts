/**
 * Tests for healthConnectService.ts (Android)
 *
 * Note: We use require() to explicitly load the Android file
 * since Jest's platform resolution on macOS defaults to .ios.ts files.
 */

import { readRecords } from 'react-native-health-connect';

import type { AggregatedHealthRecord } from '../../src/types/healthRecords';

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
    { recordType: 'TotalCaloriesBurned', stateKey: 'isTotalCaloriesSyncEnabled', unit: 'kcal', type: 'total_calories' },
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
  });

});
