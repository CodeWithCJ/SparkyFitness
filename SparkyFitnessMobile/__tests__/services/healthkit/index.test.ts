import {
  getSyncStartDate,
  initHealthConnect,
  getAggregatedStepsByDate,
  getAggregatedTotalCaloriesByDate,
  readHealthRecords,
} from '../../../src/services/healthkit/index';

import {
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  queryQuantitySamples,
  queryWorkoutSamples,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';

import type { SyncDuration } from '../../../src/services/healthkit/preferences';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockIsHealthDataAvailable = isHealthDataAvailable as jest.Mock;
const mockQueryStatisticsForQuantity = queryStatisticsForQuantity as jest.Mock;
const mockQueryQuantitySamples = queryQuantitySamples as jest.Mock;
const mockQueryWorkoutSamples = queryWorkoutSamples as jest.Mock;
const mockQueryCategorySamples = queryCategorySamples as jest.Mock;

describe('getSyncStartDate', () => {
  test('all known durations return midnight (00:00:00.000)', () => {
    const durations: SyncDuration[] = ['today', '24h', '3d', '7d', '30d', '90d'];
    durations.forEach(duration => {
      const result = getSyncStartDate(duration);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  test("'today' returns today's date at midnight", () => {
    const result = getSyncStartDate('today');
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expect(result.toISOString().split('T')[0]).toBe(expected.toISOString().split('T')[0]);
  });

  test("'7d' returns 6 days ago at midnight", () => {
    const result = getSyncStartDate('7d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 6);
    expected.setHours(0, 0, 0, 0);
    expect(result.toISOString().split('T')[0]).toBe(expected.toISOString().split('T')[0]);
  });

  test("'3d' returns 2 days ago at midnight", () => {
    const result = getSyncStartDate('3d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 2);
    expected.setHours(0, 0, 0, 0);
    expect(result.toISOString().split('T')[0]).toBe(expected.toISOString().split('T')[0]);
  });

  test("'30d' returns 29 days ago at midnight", () => {
    const result = getSyncStartDate('30d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 29);
    expected.setHours(0, 0, 0, 0);
    expect(result.toISOString().split('T')[0]).toBe(expected.toISOString().split('T')[0]);
  });

  test("'90d' returns 89 days ago at midnight", () => {
    const result = getSyncStartDate('90d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 89);
    expected.setHours(0, 0, 0, 0);
    expect(result.toISOString().split('T')[0]).toBe(expected.toISOString().split('T')[0]);
  });
});

describe('initHealthConnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true when isHealthDataAvailable returns true', async () => {
    mockIsHealthDataAvailable.mockResolvedValue(true);

    const result = await initHealthConnect();

    expect(result).toBe(true);
    expect(mockIsHealthDataAvailable).toHaveBeenCalled();
  });

  test('returns false when isHealthDataAvailable returns false', async () => {
    mockIsHealthDataAvailable.mockResolvedValue(false);

    const result = await initHealthConnect();

    expect(result).toBe(false);
  });

  test('returns false and handles error when isHealthDataAvailable throws', async () => {
    mockIsHealthDataAvailable.mockRejectedValue(new Error('HealthKit not supported'));

    const result = await initHealthConnect();

    expect(result).toBe(false);
  });
});

describe('getAggregatedStepsByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset HealthKit availability state by calling initHealthConnect
    mockIsHealthDataAvailable.mockResolvedValue(true);
  });

  test('returns empty array when HealthKit is unavailable', async () => {
    // Set HealthKit as unavailable
    mockIsHealthDataAvailable.mockResolvedValue(false);
    await initHealthConnect();

    const startDate = new Date('2024-01-15');
    const endDate = new Date('2024-01-15');

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(result).toEqual([]);
  });

  test('returns formatted result for single day with data', async () => {
    // Initialize HealthKit as available
    await initHealthConnect();

    mockQueryStatisticsForQuantity.mockResolvedValue({
      sumQuantity: { quantity: 5000 },
    });

    // Use local dates to avoid timezone issues
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const expectedDateStr = startDate.toISOString().split('T')[0];

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: expectedDateStr,
      value: 5000,
      type: 'step',
    });
  });

  test('queries each day separately for multiple days', async () => {
    await initHealthConnect();

    mockQueryStatisticsForQuantity
      .mockResolvedValueOnce({ sumQuantity: { quantity: 5000 } })
      .mockResolvedValueOnce({ sumQuantity: { quantity: 6000 } })
      .mockResolvedValueOnce({ sumQuantity: { quantity: 7000 } });

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-17T23:59:59Z');

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(mockQueryStatisticsForQuantity).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  test('skips days with no data (null or zero)', async () => {
    await initHealthConnect();

    mockQueryStatisticsForQuantity
      .mockResolvedValueOnce({ sumQuantity: { quantity: 5000 } })
      .mockResolvedValueOnce(null) // No data
      .mockResolvedValueOnce({ sumQuantity: { quantity: 0 } }); // Zero steps

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-17T23:59:59Z');

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(result).toHaveLength(1); // Only the day with 5000 steps
    expect(result[0].value).toBe(5000);
  });

  test('rounds step count to integer', async () => {
    await initHealthConnect();

    mockQueryStatisticsForQuantity.mockResolvedValue({
      sumQuantity: { quantity: 5432.7 },
    });

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-15T23:59:59Z');

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(result[0].value).toBe(5433);
    expect(Number.isInteger(result[0].value)).toBe(true);
  });

  test('handles query errors gracefully and continues', async () => {
    await initHealthConnect();

    mockQueryStatisticsForQuantity
      .mockRejectedValueOnce(new Error('Query failed'))
      .mockResolvedValueOnce({ sumQuantity: { quantity: 6000 } });

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-16T23:59:59Z');

    const result = await getAggregatedStepsByDate(startDate, endDate);

    // Should still return results from successful day
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(6000);
  });
});

describe('getAggregatedTotalCaloriesByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
  });

  test('returns empty array when HealthKit is unavailable', async () => {
    mockIsHealthDataAvailable.mockResolvedValue(false);
    await initHealthConnect();

    const startDate = new Date('2024-01-15');
    const endDate = new Date('2024-01-15');

    const result = await getAggregatedTotalCaloriesByDate(startDate, endDate);

    expect(result).toEqual([]);
  });

  test('sums basal + active energy correctly', async () => {
    await initHealthConnect();

    // Mock Promise.all returning both basal and active
    mockQueryStatisticsForQuantity
      .mockResolvedValueOnce({ sumQuantity: { quantity: 1500 } }) // basal
      .mockResolvedValueOnce({ sumQuantity: { quantity: 500 } }); // active

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const expectedDateStr = startDate.toISOString().split('T')[0];

    const result = await getAggregatedTotalCaloriesByDate(startDate, endDate);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: expectedDateStr,
      value: 2000, // 1500 + 500
      type: 'total_calories',
    });
  });

  test('uses only active when basal returns null', async () => {
    await initHealthConnect();

    mockQueryStatisticsForQuantity
      .mockResolvedValueOnce(null) // basal is null
      .mockResolvedValueOnce({ sumQuantity: { quantity: 500 } }); // active

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const result = await getAggregatedTotalCaloriesByDate(startDate, endDate);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(500);
  });

  test('uses only basal when active returns null', async () => {
    await initHealthConnect();

    mockQueryStatisticsForQuantity
      .mockResolvedValueOnce({ sumQuantity: { quantity: 1500 } }) // basal
      .mockResolvedValueOnce(null); // active is null

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const result = await getAggregatedTotalCaloriesByDate(startDate, endDate);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1500);
  });

  test('skips day when both basal and active return null/zero', async () => {
    await initHealthConnect();

    mockQueryStatisticsForQuantity
      .mockResolvedValueOnce(null) // basal is null
      .mockResolvedValueOnce({ sumQuantity: { quantity: 0 } }); // active is zero

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const result = await getAggregatedTotalCaloriesByDate(startDate, endDate);

    expect(result).toHaveLength(0);
  });
});

describe('readHealthRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
  });

  test('returns empty array when HealthKit is unavailable', async () => {
    mockIsHealthDataAvailable.mockResolvedValue(false);
    await initHealthConnect();

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15'),
      new Date('2024-01-16')
    );

    expect(result).toEqual([]);
  });

  test('returns empty array for unsupported record type', async () => {
    await initHealthConnect();

    const result = await readHealthRecords(
      'UnsupportedType',
      new Date('2024-01-15'),
      new Date('2024-01-16')
    );

    expect(result).toEqual([]);
  });

  test('filters out records outside the date range (iOS workaround)', async () => {
    await initHealthConnect();

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-16T23:59:59Z');

    mockQueryQuantitySamples.mockResolvedValue([
      { startDate: '2024-01-14T23:00:00Z', quantity: 100 }, // Before range
      { startDate: '2024-01-15T12:00:00Z', quantity: 200 }, // In range
      { startDate: '2024-01-16T12:00:00Z', quantity: 300 }, // In range
      { startDate: '2024-01-17T01:00:00Z', quantity: 400 }, // After range
    ]);

    const result = await readHealthRecords('Steps', startDate, endDate);

    expect(result).toHaveLength(2);
    expect((result[0] as { value: number }).value).toBe(200);
    expect((result[1] as { value: number }).value).toBe(300);
  });

  test('transforms Steps records to expected format', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue([
      {
        startDate: '2024-01-15T10:00:00Z',
        endDate: '2024-01-15T10:30:00Z',
        quantity: 500,
      },
    ]);

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T10:30:00Z',
      time: '2024-01-15T10:00:00Z',
      value: 500,
    });
  });

  test('transforms HeartRate records with samples array', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue([
      {
        startDate: '2024-01-15T10:00:00Z',
        endDate: '2024-01-15T10:00:00Z',
        quantity: 72,
      },
    ]);

    const result = await readHealthRecords(
      'HeartRate',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect((result[0] as { samples: Array<{ beatsPerMinute: number }> }).samples).toEqual([{ beatsPerMinute: 72 }]);
  });

  test('transforms Weight records with weight object', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue([
      {
        startDate: '2024-01-15T08:00:00Z',
        endDate: '2024-01-15T08:00:00Z',
        quantity: 75.5,
      },
    ]);

    const result = await readHealthRecords(
      'Weight',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect((result[0] as { weight: { inKilograms: number } }).weight).toEqual({ inKilograms: 75.5 });
  });

  test('handles non-array response from queryQuantitySamples', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue(null);

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });

  describe('Workout records', () => {
    test('fetches workouts using queryWorkoutSamples', async () => {
      await initHealthConnect();

      const mockGetAllStatistics = jest.fn().mockResolvedValue({});
      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          totalEnergyBurned: { inKilocalories: 500 },
          totalDistance: { inMeters: 5000 },
          getAllStatistics: mockGetAllStatistics,
        },
      ]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(mockQueryWorkoutSamples).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-15T09:00:00Z',
        activityType: 37,
        duration: 3600,
      });
    });

    test('uses stats from getAllStatistics when available', async () => {
      await initHealthConnect();

      const mockGetAllStatistics = jest.fn().mockResolvedValue({
        'HKQuantityTypeIdentifierActiveEnergyBurned': {
          sumQuantity: { quantity: 600 },
        },
        'HKQuantityTypeIdentifierDistanceWalkingRunning': {
          sumQuantity: { quantity: 6000 },
        },
      });

      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          totalEnergyBurned: { inKilocalories: 500 }, // Should be overridden by stats
          totalDistance: { inMeters: 5000 }, // Should be overridden by stats
          getAllStatistics: mockGetAllStatistics,
        },
      ]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(mockGetAllStatistics).toHaveBeenCalled();
      expect((result[0] as { totalEnergyBurned: number }).totalEnergyBurned).toBe(600);
      expect((result[0] as { totalDistance: number }).totalDistance).toBe(6000);
    });

    test('falls back to direct properties when getAllStatistics fails', async () => {
      await initHealthConnect();

      const mockGetAllStatistics = jest.fn().mockRejectedValue(new Error('Stats unavailable'));
      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          totalEnergyBurned: { inKilocalories: 500 },
          totalDistance: { inMeters: 5000 },
          getAllStatistics: mockGetAllStatistics,
        },
      ]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect((result[0] as { totalEnergyBurned: number }).totalEnergyBurned).toBe(500);
      expect((result[0] as { totalDistance: number }).totalDistance).toBe(5000);
    });

    test('checks multiple distance types in order', async () => {
      await initHealthConnect();

      // Only cycling distance available
      const mockGetAllStatistics = jest.fn().mockResolvedValue({
        'HKQuantityTypeIdentifierDistanceCycling': {
          sumQuantity: { quantity: 15000 },
        },
      });

      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 13,
          duration: 3600,
          totalEnergyBurned: 400,
          totalDistance: 0,
          getAllStatistics: mockGetAllStatistics,
        },
      ]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect((result[0] as { totalDistance: number }).totalDistance).toBe(15000);
    });

    test('returns empty array for empty workouts response', async () => {
      await initHealthConnect();

      mockQueryWorkoutSamples.mockResolvedValue([]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });
  });

  describe('SleepSession records', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockIsHealthDataAvailable.mockResolvedValue(true);
    });

    test('transforms sleep samples to expected format', async () => {
      await initHealthConnect();

      mockQueryCategorySamples.mockResolvedValue([
        {
          startDate: '2024-01-15T22:00:00Z',
          endDate: '2024-01-15T23:30:00Z',
          value: 'ASLEEP',
          metadata: { customKey: 'customValue' },
          sourceName: 'Apple Watch',
          sourceId: 'com.apple.health',
        },
      ]);

      const result = await readHealthRecords(
        'SleepSession',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-15T23:30:00Z',
        value: 'ASLEEP',
        metadata: { customKey: 'customValue' },
        sourceName: 'Apple Watch',
        sourceId: 'com.apple.health',
      });
    });

    test('filters out records outside requested date range', async () => {
      await initHealthConnect();

      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');

      mockQueryCategorySamples.mockResolvedValue([
        // Before range (start before requested start)
        {
          startDate: '2024-01-14T22:00:00Z',
          endDate: '2024-01-15T06:00:00Z',
          value: 'ASLEEP',
        },
        // Within range
        {
          startDate: '2024-01-15T22:00:00Z',
          endDate: '2024-01-15T23:30:00Z',
          value: 'ASLEEP',
        },
        // After range (end after requested end)
        {
          startDate: '2024-01-15T23:00:00Z',
          endDate: '2024-01-16T06:00:00Z',
          value: 'ASLEEP',
        },
      ]);

      const result = await readHealthRecords('SleepSession', startDate, endDate);

      // Only the record fully within range should be included
      expect(result).toHaveLength(1);
      expect((result[0] as { startTime: string }).startTime).toBe('2024-01-15T22:00:00Z');
    });

    test('includes sleep sessions spanning midnight when fully within range', async () => {
      await initHealthConnect();

      // Request a 2-day range
      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-16T23:59:59Z');

      mockQueryCategorySamples.mockResolvedValue([
        {
          startDate: '2024-01-15T23:30:00Z',
          endDate: '2024-01-16T07:30:00Z',
          value: 'ASLEEP',
        },
      ]);

      const result = await readHealthRecords('SleepSession', startDate, endDate);

      // Session spanning midnight is included because both start and end are within the 2-day range
      expect(result).toHaveLength(1);
      expect((result[0] as { startTime: string }).startTime).toBe('2024-01-15T23:30:00Z');
      expect((result[0] as { endTime: string }).endTime).toBe('2024-01-16T07:30:00Z');
    });

    test('returns empty array when queryCategorySamples returns empty', async () => {
      await initHealthConnect();

      mockQueryCategorySamples.mockResolvedValue([]);

      const result = await readHealthRecords(
        'SleepSession',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });
  });

  describe('Stress records', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockIsHealthDataAvailable.mockResolvedValue(true);
    });

    test('transforms mindful sessions to expected format', async () => {
      await initHealthConnect();

      mockQueryCategorySamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T08:15:00Z',
          value: 0, // Raw value from HealthKit
        },
      ]);

      const result = await readHealthRecords(
        'Stress',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-15T08:15:00Z',
        value: 1,
      });
    });

    test('always sets value to 1 regardless of raw sample value', async () => {
      // MindfulSession is presence-based - value 1 indicates session occurred
      await initHealthConnect();

      mockQueryCategorySamples.mockResolvedValue([
        { startDate: '2024-01-15T08:00:00Z', endDate: '2024-01-15T08:15:00Z', value: 0 },
        { startDate: '2024-01-15T12:00:00Z', endDate: '2024-01-15T12:30:00Z', value: 5 },
        { startDate: '2024-01-15T18:00:00Z', endDate: '2024-01-15T18:10:00Z', value: null },
      ]);

      const result = await readHealthRecords(
        'Stress',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(3);
      expect(result.every(r => (r as { value: number }).value === 1)).toBe(true);
    });

    test('returns empty array when queryCategorySamples returns empty', async () => {
      await initHealthConnect();

      mockQueryCategorySamples.mockResolvedValue([]);

      const result = await readHealthRecords(
        'Stress',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });
  });

  describe('BloodPressure records', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockIsHealthDataAvailable.mockResolvedValue(true);
    });

    test('transforms paired readings to expected format', async () => {
      await initHealthConnect();

      const timestamp = '2024-01-15T08:00:00Z';

      mockQueryQuantitySamples
        .mockResolvedValueOnce([{ startDate: timestamp, quantity: 120 }]) // systolic
        .mockResolvedValueOnce([{ startDate: timestamp, quantity: 80 }]); // diastolic

      const result = await readHealthRecords(
        'BloodPressure',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        systolic: { inMillimetersOfMercury: 120 },
        diastolic: { inMillimetersOfMercury: 80 },
        time: timestamp,
      });
    });

    test('merges systolic and diastolic by matching timestamp', async () => {
      await initHealthConnect();

      mockQueryQuantitySamples
        .mockResolvedValueOnce([
          { startDate: '2024-01-15T08:00:00Z', quantity: 120 },
          { startDate: '2024-01-15T12:00:00Z', quantity: 118 },
        ])
        .mockResolvedValueOnce([
          { startDate: '2024-01-15T08:00:00Z', quantity: 80 },
          { startDate: '2024-01-15T12:00:00Z', quantity: 78 },
        ]);

      const result = await readHealthRecords(
        'BloodPressure',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        systolic: { inMillimetersOfMercury: 120 },
        diastolic: { inMillimetersOfMercury: 80 },
        time: '2024-01-15T08:00:00Z',
      });
      expect(result[1]).toMatchObject({
        systolic: { inMillimetersOfMercury: 118 },
        diastolic: { inMillimetersOfMercury: 78 },
        time: '2024-01-15T12:00:00Z',
      });
    });

    test('filters out unpaired readings', async () => {
      await initHealthConnect();

      mockQueryQuantitySamples
        .mockResolvedValueOnce([
          { startDate: '2024-01-15T08:00:00Z', quantity: 120 }, // Has matching diastolic
          { startDate: '2024-01-15T10:00:00Z', quantity: 125 }, // No matching diastolic
        ])
        .mockResolvedValueOnce([
          { startDate: '2024-01-15T08:00:00Z', quantity: 80 }, // Has matching systolic
          { startDate: '2024-01-15T14:00:00Z', quantity: 82 }, // No matching systolic
        ]);

      const result = await readHealthRecords(
        'BloodPressure',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      // Only the paired reading at 08:00 should be included
      expect(result).toHaveLength(1);
      expect((result[0] as { time: string }).time).toBe('2024-01-15T08:00:00Z');
    });

    test('returns empty array when no pairs exist', async () => {
      await initHealthConnect();

      // Systolic and diastolic at different times - no matches
      mockQueryQuantitySamples
        .mockResolvedValueOnce([{ startDate: '2024-01-15T08:00:00Z', quantity: 120 }])
        .mockResolvedValueOnce([{ startDate: '2024-01-15T10:00:00Z', quantity: 80 }]);

      const result = await readHealthRecords(
        'BloodPressure',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });

    test('returns empty array when both queries return empty', async () => {
      await initHealthConnect();

      mockQueryQuantitySamples
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await readHealthRecords(
        'BloodPressure',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toEqual([]);
    });
  });
});
