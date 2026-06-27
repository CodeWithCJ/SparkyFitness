/**
 * Tests for healthConnectService.ts (Android)
 *
 * Note: We use require() to explicitly load the Android file
 * since Jest's platform resolution on macOS defaults to .ios.ts files.
 */

import { readRecords, aggregateGroupByPeriod } from 'react-native-health-connect';

import type { AggregatedHealthRecord, HealthMetricStates, SyncResult } from '../../src/types/healthRecords';

// Helpers — construct test dates in local time so day attribution in
// aggregateCumulativeMetricByDayDetailed produces predictable output
// regardless of the runtime timezone.
const localMidnight = (y: number, m1to12: number, d: number) =>
  new Date(y, m1to12 - 1, d, 0, 0, 0, 0);
const localEndOfDay = (y: number, m1to12: number, d: number) =>
  new Date(y, m1to12 - 1, d, 23, 59, 59, 999);

// Constructs an aggregateGroupByPeriod bucket scoped to a single local day.
const periodBucket = (y: number, m1to12: number, d: number, result: unknown) => ({
  result,
  startTime: new Date(y, m1to12 - 1, d, 0, 0, 0, 0).toISOString(),
  endTime: new Date(y, m1to12 - 1, d + 1, 0, 0, 0, 0).toISOString(),
});

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
    { recordType: 'HeartRate', stateKey: 'isHeartRateSyncEnabled', unit: 'bpm', type: 'heart_rate', aggregationStrategy: 'min-max-avg' },
    { recordType: 'TotalCaloriesBurned', stateKey: 'isTotalCaloriesSyncEnabled', unit: 'kcal', type: 'total_calories' },
    { recordType: 'ActiveCaloriesBurned', stateKey: 'isCaloriesSyncEnabled', unit: 'kcal', type: 'active_calories' },
    { recordType: 'Distance', stateKey: 'isDistanceSyncEnabled', unit: 'meters', type: 'distance' },
    { recordType: 'FloorsClimbed', stateKey: 'isFloorsClimbedSyncEnabled', unit: 'count', type: 'floors_climbed' },
  ],
}));

const mockReadRecords = readRecords as jest.Mock;
const mockAggregateGroupByPeriod = aggregateGroupByPeriod as jest.Mock;

// Load the Android-specific file using explicit .ts extension
// This bypasses Jest's platform resolution which would otherwise load .ios.ts
const androidService = require('../../src/services/healthConnectService.ts') as {
  getAggregatedTotalCaloriesByDate: (startDate: Date, endDate: Date) => Promise<AggregatedHealthRecord[]>;
  getAggregatedDistanceByDate: (startDate: Date, endDate: Date) => Promise<AggregatedHealthRecord[]>;
  getAggregatedFloorsClimbedByDate: (startDate: Date, endDate: Date) => Promise<AggregatedHealthRecord[]>;
  syncHealthData: (syncDuration: string, healthMetricStates?: HealthMetricStates) => Promise<SyncResult>;
};

describe('healthConnectService.ts (Android)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAggregatedTotalCaloriesByDate', () => {
    beforeEach(() => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([]);
    });

    test('returns rounded kcal total per local day from native aggregate', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 500.5 } }),
      ]);

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toEqual([
        { date: '2024-01-15', value: 501, type: 'total_calories' },
      ]);
      expect(mockAggregateGroupByPeriod).toHaveBeenCalledWith(
        expect.objectContaining({
          recordType: 'TotalCaloriesBurned',
          timeRangeSlicer: { period: 'DAYS', length: 1 },
        }),
      );
      // No dataOriginFilter: relies on HC's cross-origin dedup.
      expect(mockAggregateGroupByPeriod.mock.calls[0][0]).not.toHaveProperty('dataOriginFilter');
    });

    test('returns empty array when the aggregate envelope is empty', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([periodBucket(2024, 1, 15, {})]);

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toEqual([]);
    });

    test('emits one entry per returned bucket across a multi-day range', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 200 } }),
        periodBucket(2024, 1, 16, { ENERGY_TOTAL: { inKilocalories: 400 } }),
      ]);

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 16),
      );

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.date === '2024-01-15')?.value).toBe(200);
      expect(result.find((r) => r.date === '2024-01-16')?.value).toBe(400);
      // Single native call regardless of range length.
      expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAggregatedDistanceByDate', () => {
    beforeEach(() => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([]);
    });

    test('returns rounded meters per local day from native aggregate', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { DISTANCE: { inMeters: 3000.4 } }),
      ]);

      const result = await androidService.getAggregatedDistanceByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toEqual([
        { date: '2024-01-15', value: 3000, type: 'distance' },
      ]);
      expect(mockAggregateGroupByPeriod).toHaveBeenCalledWith(
        expect.objectContaining({ recordType: 'Distance' }),
      );
      expect(mockAggregateGroupByPeriod.mock.calls[0][0]).not.toHaveProperty('dataOriginFilter');
    });

    test('returns empty array when the aggregate envelope is empty', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([periodBucket(2024, 1, 15, {})]);

      const result = await androidService.getAggregatedDistanceByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toEqual([]);
    });
  });

  describe('getAggregatedFloorsClimbedByDate', () => {
    beforeEach(() => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([]);
    });

    test('returns floor counts per local day from native aggregate', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { FLOORS_CLIMBED_TOTAL: 8 }),
      ]);

      const result = await androidService.getAggregatedFloorsClimbedByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toEqual([
        { date: '2024-01-15', value: 8, type: 'floors_climbed' },
      ]);
      expect(mockAggregateGroupByPeriod).toHaveBeenCalledWith(
        expect.objectContaining({ recordType: 'FloorsClimbed' }),
      );
      expect(mockAggregateGroupByPeriod.mock.calls[0][0]).not.toHaveProperty('dataOriginFilter');
    });

    test('returns empty array when the aggregate envelope is empty', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([periodBucket(2024, 1, 15, {})]);

      const result = await androidService.getAggregatedFloorsClimbedByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toEqual([]);
    });
  });

  describe('syncHealthData', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAggregateGroupByPeriod.mockResolvedValue([]);
      mockApiSyncHealthData.mockResolvedValue({ success: true });
    });

    test('sends correctly shaped HealthDataPayload to API', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { COUNT_TOTAL: 5000 }),
      ]);

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      expect(mockApiSyncHealthData).toHaveBeenCalledTimes(1);
      const payload = mockApiSyncHealthData.mock.calls[0][0];

      expect(Array.isArray(payload)).toBe(true);
      expect(payload.length).toBeGreaterThan(0);
      expect(payload[0]).toMatchObject({
        value: expect.any(Number),
        type: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        unit: expect.any(String),
      });
    });

    test('Steps are aggregated via native aggregateGroupByPeriod (cross-origin dedup)', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      // Native aggregate already handles cross-origin dedup — helper just passes
      // through the value HC returned.
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { COUNT_TOTAL: 6500 }),
      ]);

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const stepRecords = payload.filter((r: { type: string }) => r.type === 'step');

      expect(stepRecords.length).toBeGreaterThanOrEqual(1);
      expect(stepRecords[0].value).toBe(6500);
    });

    test('ActiveCalories are aggregated via native aggregateGroupByPeriod', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { ACTIVE_CALORIES_TOTAL: { inKilocalories: 350 } }),
      ]);

      const healthMetricStates: HealthMetricStates = { isCaloriesSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const calorieRecords = payload.filter((r: { type: string }) => r.type === 'active_calories');

      expect(calorieRecords.length).toBeGreaterThanOrEqual(1);
      expect(calorieRecords[0].value).toBe(350);
    });

    test('HeartRate records are aggregated with min/max/avg by date', async () => {
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
      const hrMin = payload.find((r: { type: string }) => r.type === 'heart_rate_min');
      const hrMax = payload.find((r: { type: string }) => r.type === 'heart_rate_max');
      const hrAvg = payload.find((r: { type: string }) => r.type === 'heart_rate_avg');

      expect(hrMin).toBeDefined();
      expect(hrMax).toBeDefined();
      expect(hrAvg).toBeDefined();
      expect(hrMin.value).toBe(60);
      expect(hrMax.value).toBe(80);
      expect(hrAvg.value).toBe(70);
    });

    test('TotalCalories are aggregated via native aggregateGroupByPeriod', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 1100 } }),
      ]);

      const healthMetricStates: HealthMetricStates = { isTotalCaloriesSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const calorieRecords = payload.filter((r: { type: string }) => r.type === 'total_calories');

      expect(calorieRecords.length).toBeGreaterThanOrEqual(1);
      expect(calorieRecords[0].value).toBe(1100);
    });

    test('does not call API when no metrics enabled', async () => {
      const result = await androidService.syncHealthData('24h', {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('No health data to sync.');
      expect(mockApiSyncHealthData).not.toHaveBeenCalled();
    });

    test('continues sync when one metric returns no records', async () => {
      mockReadRecords.mockImplementation((recordType: string) => {
        if (recordType === 'HeartRate') {
          return Promise.resolve({
            records: [
              { startTime: '2024-01-15T10:00:00Z', samples: [{ beatsPerMinute: 72 }] },
            ],
          });
        }
        // Steps tz-offset lookup returns empty; HeartRate handled above.
        return Promise.resolve({ records: [] });
      });
      // Steps aggregate returns nothing.
      mockAggregateGroupByPeriod.mockResolvedValue([periodBucket(2024, 1, 15, { COUNT_TOTAL: 0 })]);

      const healthMetricStates: HealthMetricStates = {
        isStepsSyncEnabled: true,
        isHeartRateSyncEnabled: true,
      };

      const result = await androidService.syncHealthData('24h', healthMetricStates);

      expect(result.success).toBe(true);
      expect(mockApiSyncHealthData).toHaveBeenCalled();

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      expect(payload.some((r: { type: string }) => r.type.startsWith('heart_rate_'))).toBe(true);
      expect(payload.some((r: { type: string }) => r.type === 'step')).toBe(false);
    });

    test('returns error when API call fails', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { COUNT_TOTAL: 5000 }),
      ]);
      mockApiSyncHealthData.mockRejectedValue(new Error('Server unavailable'));

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      const result = await androidService.syncHealthData('24h', healthMetricStates);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server unavailable');
    });

    test('returns apiResponse from successful sync', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { COUNT_TOTAL: 5000 }),
      ]);
      mockApiSyncHealthData.mockResolvedValue({ processed: 1, status: 'ok' });

      const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

      const result = await androidService.syncHealthData('24h', healthMetricStates);

      expect(result.success).toBe(true);
      expect(result.apiResponse).toEqual({ processed: 1, status: 'ok' });
    });

    test('Distance is aggregated via native aggregateGroupByPeriod', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { DISTANCE: { inMeters: 3000 } }),
      ]);

      const healthMetricStates: HealthMetricStates = { isDistanceSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const distanceRecords = payload.filter((r: { type: string }) => r.type === 'distance');

      expect(distanceRecords.length).toBeGreaterThanOrEqual(1);
      expect(distanceRecords[0].value).toBe(3000);
    });

    test('FloorsClimbed is aggregated via native aggregateGroupByPeriod', async () => {
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { FLOORS_CLIMBED_TOTAL: 8 }),
      ]);

      const healthMetricStates: HealthMetricStates = { isFloorsClimbedSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const floorsRecords = payload.filter((r: { type: string }) => r.type === 'floors_climbed');

      expect(floorsRecords.length).toBeGreaterThanOrEqual(1);
      expect(floorsRecords[0].value).toBe(8);
    });
  });

  describe('per-day UTC offset metadata', () => {
    // The native aggregate path attributes records to the device-local day
    // (matching HC UI behavior). One range-wide probe read captures a UTC
    // offset that is attached to every emitted day — see the basisIsDayOnly
    // short-circuit in measurementService.resolveHealthEntryDate, which means
    // per-day offset precision is not load-bearing for server day attribution.

    test('TotalCalories: range offset captured from probe read', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 50 } }),
      ]);
      mockReadRecords.mockResolvedValue({
        records: [{ endZoneOffset: { totalSeconds: 32400 } }], // UTC+9
      });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].record_utc_offset_minutes).toBe(540);
    });

    test('Distance: range offset captured from probe read', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { DISTANCE: { inMeters: 2000 } }),
      ]);
      mockReadRecords.mockResolvedValue({
        records: [{ endZoneOffset: { totalSeconds: 32400 } }],
      });

      const result = await androidService.getAggregatedDistanceByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toHaveLength(1);
      expect(result[0].record_utc_offset_minutes).toBe(540);
    });

    test('FloorsClimbed: range offset captured from probe read', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { FLOORS_CLIMBED_TOTAL: 3 }),
      ]);
      mockReadRecords.mockResolvedValue({
        records: [{ endZoneOffset: { totalSeconds: 32400 } }],
      });

      const result = await androidService.getAggregatedFloorsClimbedByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toHaveLength(1);
      expect(result[0].record_utc_offset_minutes).toBe(540);
    });

    test('omits offset metadata when probe read returns no records', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 200 } }),
      ]);
      mockReadRecords.mockResolvedValue({ records: [] });

      const result = await androidService.getAggregatedTotalCaloriesByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 15),
      );

      expect(result).toHaveLength(1);
      expect(result[0].record_utc_offset_minutes).toBeUndefined();
    });

    test('sync sends offset metadata through the full pipeline for TotalCalories', async () => {
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 100 } }),
      ]);
      mockReadRecords.mockResolvedValue({
        records: [{ endZoneOffset: { totalSeconds: 32400 } }],
      });

      const healthMetricStates: HealthMetricStates = { isTotalCaloriesSyncEnabled: true };

      await androidService.syncHealthData('24h', healthMetricStates);

      const payload = mockApiSyncHealthData.mock.calls[0][0];
      const calRecords = payload.filter((r: { type: string }) => r.type === 'total_calories');

      expect(calRecords.length).toBeGreaterThanOrEqual(1);
      expect(calRecords[0].record_utc_offset_minutes).toBe(540);
    });
  });

});
