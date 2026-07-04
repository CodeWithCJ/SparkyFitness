import {
  getSyncStartDate,
  initHealthConnect,
  getAggregatedStepsByDate,
  getAggregatedStepsByDateDetailed,
  getAggregatedTotalCaloriesByDate,
  getAggregatedTotalCaloriesByDateDetailed,
  getAggregatedBasalEnergyByDate,
  getAggregatedBasalEnergyByDateDetailed,
  readHealthRecords,
  readHealthRecordsDetailed,
  readMinMaxAvgByDayDetailed,
  isDatabaseInaccessibleError,
  resetDatabaseInaccessibleCount,
  getDatabaseInaccessibleCount,
} from '../../../src/services/healthkit/index';

import {
  isHealthDataAvailable,
  queryStatisticsCollectionForQuantity,
  queryQuantitySamples,
  queryWorkoutSamples,
  queryCategorySamples,
  queryCorrelationSamples,
} from '@kingstinct/react-native-healthkit';

import { aggregateByDay, toLocalDateString } from '../../../src/services/healthkit/dataAggregation';
import { transformHealthRecords } from '../../../src/services/healthkit/dataTransformation';
import type { TransformedRecord } from '../../../src/types/healthRecords';

import type { SyncDuration } from '../../../src/services/healthkit/preferences';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockIsHealthDataAvailable = isHealthDataAvailable as jest.Mock;
const mockQueryStatisticsCollection = queryStatisticsCollectionForQuantity as jest.Mock;
const mockQueryQuantitySamples = queryQuantitySamples as jest.Mock;
const mockQueryWorkoutSamples = queryWorkoutSamples as jest.Mock;
const mockQueryCategorySamples = queryCategorySamples as jest.Mock;
const mockQueryCorrelationSamples = queryCorrelationSamples as jest.Mock;

// Local-time date constructor (month is 1-based) — the engine buckets by LOCAL day.
const localDate = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

const startOfToday = () => {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
};

const daysFromToday = (days: number) => {
  const day = startOfToday();
  day.setDate(day.getDate() + days);
  return day;
};

// A statistics-collection day bucket carrying a cumulative sum.
const sumBucket = (startDate: Date, endDate: Date, sum?: number, unit = 'count') => ({
  startDate,
  endDate,
  ...(sum !== undefined ? { sumQuantity: { unit, quantity: sum } } : {}),
});

// A statistics-collection day bucket carrying discrete min/max/avg.
const statsBucket = (
  startDate: Date,
  endDate: Date,
  stats?: { min: number; max: number; avg: number },
  unit = 'count/min',
) => ({
  startDate,
  endDate,
  ...(stats
    ? {
      minimumQuantity: { unit, quantity: stats.min },
      maximumQuantity: { unit, quantity: stats.max },
      averageQuantity: { unit, quantity: stats.avg },
    }
    : {}),
});

describe('getSyncStartDate', () => {
  test('day-based durations return midnight (00:00:00.000)', () => {
    // 24h is excluded - it's a true rolling window, not snapped to midnight
    const durations: SyncDuration[] = ['today', '3d', '7d', '30d', '90d'];
    durations.forEach(duration => {
      const result = getSyncStartDate(duration);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  test("'24h' returns exactly 24 hours ago (rolling window)", () => {
    const before = new Date();
    const result = getSyncStartDate('24h');
    const after = new Date();

    // Should be approximately 24 hours ago (within a few ms of test execution)
    const expectedTime = before.getTime() - 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
    expect(result.getTime()).toBeLessThanOrEqual(after.getTime() - 24 * 60 * 60 * 1000 + 100);
  });

  test("'today' returns today's date at midnight", () => {
    const result = getSyncStartDate('today');
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expect(toLocalDateString(result)).toBe(toLocalDateString(expected));
  });

  test("'7d' returns 6 days ago at midnight", () => {
    const result = getSyncStartDate('7d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 6);
    expected.setHours(0, 0, 0, 0);
    expect(toLocalDateString(result)).toBe(toLocalDateString(expected));
  });

  test("'3d' returns 2 days ago at midnight", () => {
    const result = getSyncStartDate('3d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 2);
    expected.setHours(0, 0, 0, 0);
    expect(toLocalDateString(result)).toBe(toLocalDateString(expected));
  });

  test("'30d' returns 29 days ago at midnight", () => {
    const result = getSyncStartDate('30d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 29);
    expected.setHours(0, 0, 0, 0);
    expect(toLocalDateString(result)).toBe(toLocalDateString(expected));
  });

  test("'90d' returns 89 days ago at midnight", () => {
    const result = getSyncStartDate('90d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 89);
    expected.setHours(0, 0, 0, 0);
    expect(toLocalDateString(result)).toBe(toLocalDateString(expected));
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

describe('getAggregatedStepsByDate (statistics collection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockQueryStatisticsCollection.mockReset().mockResolvedValue([]);
    resetDatabaseInaccessibleCount();
  });

  test('returns empty array when HealthKit is unavailable', async () => {
    // Set HealthKit as unavailable
    mockIsHealthDataAvailable.mockResolvedValue(false);
    await initHealthConnect();

    const result = await getAggregatedStepsByDate(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));

    expect(result).toEqual([]);
    expect(mockQueryStatisticsCollection).not.toHaveBeenCalled();
  });

  test('issues ONE collection query for the whole range, anchored at local midnight', async () => {
    await initHealthConnect();

    const startDate = localDate(2024, 1, 15);
    const endDate = localDate(2024, 1, 17, 23, 59);
    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 5000),
      sumBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), 6000),
      sumBucket(localDate(2024, 1, 17), localDate(2024, 1, 18), 7000),
    ]);

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(mockQueryStatisticsCollection).toHaveBeenCalledTimes(1);
    expect(mockQueryStatisticsCollection).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      localDate(2024, 1, 15), // anchor = local midnight of the filter start
      { day: 1 },
      { filter: { date: { startDate, endDate } }, unit: 'count' },
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      date: toLocalDateString(localDate(2024, 1, 15)),
      value: 5000,
      type: 'step',
    });
    expect(result[0].record_timezone).toBeDefined();
    expect(result.map(r => r.value)).toEqual([5000, 6000, 7000]);
  });

  test('drops zero and empty buckets', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 5000),
      sumBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), 0), // zero steps
      sumBucket(localDate(2024, 1, 17), localDate(2024, 1, 18)), // no sumQuantity
    ]);

    const result = await getAggregatedStepsByDate(localDate(2024, 1, 15), localDate(2024, 1, 17, 23, 59));

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(5000);
  });

  test('rounds the daily sum to an integer', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 5432.7),
    ]);

    const result = await getAggregatedStepsByDate(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));

    expect(result[0].value).toBe(5433);
    expect(Number.isInteger(result[0].value)).toBe(true);
  });

  test('keeps a nonzero sub-0.5 day (has-data check happens before rounding)', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 0.4),
    ]);

    const result = await getAggregatedStepsByDate(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(0);
  });

  test('keeps the first partial-day bucket for a mid-day filter start (rolling 24h window)', async () => {
    await initHealthConnect();

    // Rolling 24h window starting at 2pm — the first bucket starts at the midnight
    // BEFORE the filter start and must be kept (its sum covers 2pm→midnight only,
    // because the native filter clips samples to the window).
    const startDate = localDate(2024, 1, 15, 14);
    const endDate = localDate(2024, 1, 16, 14);
    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 3000),
      sumBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), 5000),
    ]);

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ date: toLocalDateString(localDate(2024, 1, 15)), value: 3000 });

    // The native filter keeps the actual 2pm start; only the ANCHOR is midnight.
    const call = mockQueryStatisticsCollection.mock.calls[0];
    expect(call[2]).toEqual(localDate(2024, 1, 15));
    expect(call[4].filter.date.startDate).toEqual(startDate);
  });

  test("keeps today's in-progress bucket (ends at tomorrow's midnight)", async () => {
    await initHealthConnect();

    // Today's bucket ends AFTER the sync endDate (tomorrow midnight > now). A
    // bucket.endDate <= endDate guard would silently drop today's steps on every sync.
    const todayStart = startOfToday();
    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(todayStart, daysFromToday(1), 800),
    ]);

    const result = await getAggregatedStepsByDate(todayStart, new Date());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: toLocalDateString(todayStart), value: 800 });
  });

  test('clamps the native filter end to now when endDate is in the future', async () => {
    await initHealthConnect();

    const before = Date.now();
    await getAggregatedStepsByDate(startOfToday(), daysFromToday(2));

    const filterEnd = mockQueryStatisticsCollection.mock.calls[0][4].filter.date.endDate;
    expect(filterEnd.getTime()).toBeGreaterThanOrEqual(before);
    expect(filterEnd.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('excludes buckets fully outside the window and sorts ascending by day', async () => {
    await initHealthConnect();

    const startDate = localDate(2024, 1, 15);
    const endDate = localDate(2024, 1, 16, 23, 59);
    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), 6000), // in (out of order)
      sumBucket(localDate(2024, 1, 14), localDate(2024, 1, 15), 999), // ends AT filter start — out
      sumBucket(localDate(2024, 1, 18), localDate(2024, 1, 19), 999), // starts after filter end — out
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 5000), // in
    ]);

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(result.map(r => r.value)).toEqual([5000, 6000]);
  });

  test('a native error fails the whole metric instead of silently dropping days', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockRejectedValue(new Error('Query failed'));

    const result = await getAggregatedStepsByDate(localDate(2024, 1, 15), localDate(2024, 1, 16, 23, 59));

    expect(result).toEqual([]);
  });

  test('the Detailed variant surfaces the error so the sync cursor can hold', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockRejectedValue(new Error('Query failed'));

    const result = await getAggregatedStepsByDateDetailed(localDate(2024, 1, 15), localDate(2024, 1, 16, 23, 59));

    expect(result.records).toEqual([]);
    expect(result.error).toBe('Query failed');
  });
});

describe('getAggregatedTotalCaloriesByDate (statistics collection)', () => {
  const mockByIdentifier = (map: Record<string, unknown[]>) =>
    mockQueryStatisticsCollection.mockImplementation((identifier: string) =>
      Promise.resolve(map[identifier] ?? []));

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockQueryStatisticsCollection.mockReset().mockResolvedValue([]);
    resetDatabaseInaccessibleCount();
  });

  test('returns empty array when HealthKit is unavailable', async () => {
    mockIsHealthDataAvailable.mockResolvedValue(false);
    await initHealthConnect();

    const result = await getAggregatedTotalCaloriesByDate(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));

    expect(result).toEqual([]);
    // The availability guard must short-circuit before any statistics query — without
    // this the mock defaults to [] and the test would pass even if the guard were gone.
    expect(mockQueryStatisticsCollection).not.toHaveBeenCalled();
  });

  test('sums basal + active per day across two collection queries', async () => {
    await initHealthConnect();

    mockByIdentifier({
      HKQuantityTypeIdentifierBasalEnergyBurned: [
        sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 1500, 'kcal'),
      ],
      HKQuantityTypeIdentifierActiveEnergyBurned: [
        sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 500, 'kcal'),
      ],
    });

    const result = await getAggregatedTotalCaloriesByDate(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));

    expect(mockQueryStatisticsCollection).toHaveBeenCalledTimes(2);
    const identifiers = mockQueryStatisticsCollection.mock.calls.map(call => call[0]);
    expect(identifiers).toEqual(expect.arrayContaining([
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
    ]));
    mockQueryStatisticsCollection.mock.calls.forEach(call => {
      expect(call[4].unit).toBe('kcal');
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: toLocalDateString(localDate(2024, 1, 15)),
      value: 2000, // 1500 + 500
      type: 'total_calories',
    });
  });

  test('emits a day when only one side has data', async () => {
    await initHealthConnect();

    mockByIdentifier({
      HKQuantityTypeIdentifierBasalEnergyBurned: [
        sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 1500, 'kcal'),
      ],
      HKQuantityTypeIdentifierActiveEnergyBurned: [
        sumBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), 400, 'kcal'),
      ],
    });

    const result = await getAggregatedTotalCaloriesByDate(localDate(2024, 1, 15), localDate(2024, 1, 16, 23, 59));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ date: toLocalDateString(localDate(2024, 1, 15)), value: 1500 });
    expect(result[1]).toMatchObject({ date: toLocalDateString(localDate(2024, 1, 16)), value: 400 });
  });

  test('skips days where both sides are zero or missing', async () => {
    await initHealthConnect();

    mockByIdentifier({
      HKQuantityTypeIdentifierBasalEnergyBurned: [
        sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 0, 'kcal'),
      ],
      HKQuantityTypeIdentifierActiveEnergyBurned: [
        sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16)),
      ],
    });

    const result = await getAggregatedTotalCaloriesByDate(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));

    expect(result).toHaveLength(0);
  });

  test('preserves a mid-day filter start on both queries (rolling 24h window)', async () => {
    await initHealthConnect();

    const startDate = localDate(2024, 1, 15, 14);
    const endDate = localDate(2024, 1, 16, 14);

    await getAggregatedTotalCaloriesByDate(startDate, endDate);

    expect(mockQueryStatisticsCollection).toHaveBeenCalledTimes(2);
    mockQueryStatisticsCollection.mock.calls.forEach(call => {
      expect(call[4].filter.date.startDate).toEqual(startDate);
      expect(call[2]).toEqual(localDate(2024, 1, 15)); // anchor still midnight
    });
  });

  test('errors the whole metric when either query fails (all-or-nothing, cursor holds)', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockImplementation((identifier: string) =>
      identifier === 'HKQuantityTypeIdentifierBasalEnergyBurned'
        ? Promise.reject(new Error('Basal query failed'))
        : Promise.resolve([sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 500, 'kcal')]));

    const result = await getAggregatedTotalCaloriesByDate(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));
    expect(result).toEqual([]);

    const detailed = await getAggregatedTotalCaloriesByDateDetailed(localDate(2024, 1, 15), localDate(2024, 1, 15, 23, 59));
    expect(detailed.records).toEqual([]);
    expect(detailed.error).toBe('Basal query failed');
  });
});

describe('getAggregatedBasalEnergyByDate (statistics collection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockQueryStatisticsCollection.mockReset().mockResolvedValue([]);
    resetDatabaseInaccessibleCount();
  });

  test('queries whole days from local midnight even for a mid-day startDate', async () => {
    await initHealthConnect();

    // Unlike the cumulative aggregator, the BMR read intentionally widens a mid-day
    // start to local midnight: it only ever emits COMPLETE days.
    const startDate = localDate(2024, 1, 15, 14);
    const endDate = localDate(2024, 1, 20);

    await getAggregatedBasalEnergyByDate(startDate, endDate);

    expect(mockQueryStatisticsCollection).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      ['cumulativeSum'],
      localDate(2024, 1, 15),
      { day: 1 },
      {
        filter: { date: { startDate: localDate(2024, 1, 15), endDate } },
        unit: 'kcal',
      },
    );
  });

  test("stamps yesterday's complete bucket with today's date (D+1)", async () => {
    await initHealthConnect();

    const yesterdayStart = daysFromToday(-1);
    const todayStart = startOfToday();
    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(yesterdayStart, todayStart, 1600.4, 'kcal'),
    ]);

    const result = await getAggregatedBasalEnergyByDate(yesterdayStart, new Date());

    expect(result).toEqual([
      expect.objectContaining({
        date: toLocalDateString(todayStart),
        value: 1600,
        type: 'basal_metabolic_rate',
      }),
    ]);
  });

  test("excludes today's partial bucket", async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(startOfToday(), daysFromToday(1), 900, 'kcal'),
    ]);

    const result = await getAggregatedBasalEnergyByDate(startOfToday(), new Date());

    expect(result).toEqual([]);
  });

  test('excludes complete days ending past the requested endDate', async () => {
    await initHealthConnect();

    const endDate = localDate(2024, 1, 16, 12);
    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 1500, 'kcal'), // complete, in window
      sumBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), 1400, 'kcal'), // ends past endDate
    ]);

    const result = await getAggregatedBasalEnergyByDate(localDate(2024, 1, 15), endDate);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: toLocalDateString(localDate(2024, 1, 16)), value: 1500 });
  });

  test('drops zero and empty buckets', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      sumBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), 0, 'kcal'),
      sumBucket(localDate(2024, 1, 16), localDate(2024, 1, 17)),
    ]);

    const result = await getAggregatedBasalEnergyByDate(localDate(2024, 1, 15), localDate(2024, 1, 18));

    expect(result).toEqual([]);
  });

  test('the Detailed variant surfaces native errors', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockRejectedValue(new Error('Query failed'));

    const result = await getAggregatedBasalEnergyByDateDetailed(localDate(2024, 1, 15), localDate(2024, 1, 18));

    expect(result.records).toEqual([]);
    expect(result.error).toBe('Query failed');
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

  test('pushes the window into the native query (limit 0) and keeps the JS range guard', async () => {
    await initHealthConnect();

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-16T23:59:59Z');

    // The native predicate matches on interval overlap, so boundary samples can still
    // come back — the exact [startDate, endDate] guard in JS must keep filtering them.
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

    // The window must reach the native query (limit: 0 = all in-window samples), not be
    // applied as a post-filter over the newest N samples across all history.
    expect(mockQueryQuantitySamples).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
      expect.objectContaining({
        ascending: false,
        limit: 0,
        filter: { date: { startDate, endDate } },
      }),
    );
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
    expect((result[0] as { samples: { beatsPerMinute: number }[] }).samples).toEqual([{ beatsPerMinute: 72 }]);
  });

  test('transforms HeartRateVariabilitySDNN records as direct ms value', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue([
      {
        startDate: '2024-01-15T10:00:00Z',
        endDate: '2024-01-15T10:00:00Z',
        quantity: 48,
      },
    ]);

    const result = await readHealthRecords(
      'HeartRateVariabilitySDNN',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect((result[0] as { value: number }).value).toBe(48);
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

  test('normalizes flattened metadataTimeZone into metadata.HKTimeZone for quantity records', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue([
      {
        startDate: '2024-01-15T08:00:00Z',
        endDate: '2024-01-15T08:00:00Z',
        quantity: 75.5,
        metadataTimeZone: 'America/Chicago',
      },
    ]);

    const result = await readHealthRecords(
      'Weight',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      weight: { inKilograms: 75.5 },
      metadata: { HKTimeZone: 'America/Chicago' },
    });
  });

  test('transforms BloodOxygenSaturation records to percent objects', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue([
      {
        startDate: '2024-01-15T08:00:00Z',
        endDate: '2024-01-15T08:00:00Z',
        quantity: 0.972,
      },
    ]);

    const result = await readHealthRecords(
      'BloodOxygenSaturation',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      time: '2024-01-15T08:00:00Z',
      percentage: { inPercent: 97.2 },
    });
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

      const mockGetStatistic = jest.fn().mockResolvedValue(undefined);
      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          totalEnergyBurned: { unit: 'kcal', quantity: 500 },
          totalDistance: { unit: 'm', quantity: 5000 },
          getStatistic: mockGetStatistic,
        },
      ]);

      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');
      const result = await readHealthRecords('Workout', startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-15T09:00:00Z',
        activityType: 37,
        duration: 3600,
      });
      // Window pushed into the native query (options are the FIRST argument here).
      expect(mockQueryWorkoutSamples).toHaveBeenCalledWith(
        expect.objectContaining({
          ascending: false,
          limit: 0,
          filter: { date: { startDate, endDate } },
        }),
      );
    });

    test('uses stats from getStatistic when available', async () => {
      await initHealthConnect();

      const mockGetStatistic = jest.fn().mockImplementation((identifier: string) => {
        if (identifier === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
          return Promise.resolve({ sumQuantity: { quantity: 600 } });
        }
        if (identifier === 'HKQuantityTypeIdentifierDistanceWalkingRunning') {
          return Promise.resolve({ sumQuantity: { quantity: 6000 } });
        }
        return Promise.resolve(undefined);
      });

      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          totalEnergyBurned: { inKilocalories: 500 }, // Should be overridden by stats
          totalDistance: { inMeters: 5000 }, // Should be overridden by stats
          getStatistic: mockGetStatistic,
        },
      ]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect((result[0] as { totalEnergyBurned: number }).totalEnergyBurned).toBe(600);
      expect((result[0] as { totalDistance: number }).totalDistance).toBe(6000);
    });

    test('pins units to kcal and meters on getStatistic calls (regression: user-preferred units leaked through)', async () => {
      await initHealthConnect();

      const mockGetStatistic = jest.fn().mockResolvedValue(undefined);
      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          totalEnergyBurned: { unit: 'kcal', quantity: 500 },
          totalDistance: { unit: 'm', quantity: 5000 },
          getStatistic: mockGetStatistic,
        },
      ]);

      await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      // Energy must be requested in kcal (default would follow the user's
      // HealthKit preferred unit, which can be kJ).
      expect(mockGetStatistic).toHaveBeenCalledWith(
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'kcal'
      );
      // Distance must be requested in meters (default could be miles).
      // dataTransformation.ts unconditionally divides by 1000 assuming meters,
      // so a non-meter unit silently mis-scales the stored distance.
      expect(mockGetStatistic).toHaveBeenCalledWith(
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        'm'
      );
      expect(mockGetStatistic).toHaveBeenCalledWith(
        'HKQuantityTypeIdentifierDistanceCycling',
        'm'
      );
    });

    test('falls back to direct properties when getStatistic fails', async () => {
      await initHealthConnect();

      const mockGetStatistic = jest.fn().mockRejectedValue(new Error('Stats unavailable'));
      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          totalEnergyBurned: { unit: 'kcal', quantity: 500 },
          totalDistance: { unit: 'm', quantity: 5000 },
          getStatistic: mockGetStatistic,
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

    test('checks multiple distance types in order, breaking on first hit', async () => {
      await initHealthConnect();

      // Only cycling distance available; running returns undefined first.
      const mockGetStatistic = jest.fn().mockImplementation((identifier: string) => {
        if (identifier === 'HKQuantityTypeIdentifierDistanceCycling') {
          return Promise.resolve({ sumQuantity: { quantity: 15000 } });
        }
        return Promise.resolve(undefined);
      });

      mockQueryWorkoutSamples.mockResolvedValue([
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 13,
          duration: 3600,
          totalEnergyBurned: 400,
          totalDistance: 0,
          getStatistic: mockGetStatistic,
        },
      ]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect((result[0] as { totalDistance: number }).totalDistance).toBe(15000);
      // Once cycling matched, swimming/wheelchair/snow should not be queried.
      const distanceCalls = mockGetStatistic.mock.calls.filter((c) =>
        (c[0] as string).startsWith('HKQuantityTypeIdentifierDistance')
      );
      expect(distanceCalls.map((c) => c[0])).toEqual([
        'HKQuantityTypeIdentifierDistanceWalkingRunning',
        'HKQuantityTypeIdentifierDistanceCycling',
      ]);
    });

    test('includes workouts that overlap with date range (boundary spanning)', async () => {
      await initHealthConnect();

      const mockGetStatistic = jest.fn().mockResolvedValue(undefined);
      mockQueryWorkoutSamples.mockResolvedValue([
        // Workout crossing midnight from previous day - INCLUDED (overlaps)
        {
          startDate: '2024-01-14T23:30:00Z',
          endDate: '2024-01-15T00:30:00Z',
          workoutActivityType: 37,
          duration: 3600,
          getStatistic: mockGetStatistic,
        },
        // Fully within range - INCLUDED
        {
          startDate: '2024-01-15T08:00:00Z',
          endDate: '2024-01-15T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          getStatistic: mockGetStatistic,
        },
        // Workout crossing midnight to next day - INCLUDED (overlaps)
        {
          startDate: '2024-01-15T23:30:00Z',
          endDate: '2024-01-16T00:30:00Z',
          workoutActivityType: 37,
          duration: 3600,
          getStatistic: mockGetStatistic,
        },
        // Completely outside range (before) - EXCLUDED
        {
          startDate: '2024-01-13T08:00:00Z',
          endDate: '2024-01-13T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          getStatistic: mockGetStatistic,
        },
        // Completely outside range (after) - EXCLUDED
        {
          startDate: '2024-01-16T08:00:00Z',
          endDate: '2024-01-16T09:00:00Z',
          workoutActivityType: 37,
          duration: 3600,
          getStatistic: mockGetStatistic,
        },
      ]);

      const result = await readHealthRecords(
        'Workout',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      // All overlapping workouts should be included
      expect(result).toHaveLength(3);
      expect((result[0] as { startTime: string }).startTime).toBe('2024-01-14T23:30:00Z');
      expect((result[1] as { startTime: string }).startTime).toBe('2024-01-15T08:00:00Z');
      expect((result[2] as { startTime: string }).startTime).toBe('2024-01-15T23:30:00Z');
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

      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');
      const result = await readHealthRecords('SleepSession', startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-15T23:30:00Z',
        value: 'ASLEEP',
        metadata: { customKey: 'customValue' },
        sourceName: 'Apple Watch',
        sourceId: 'com.apple.health',
      });
      // Window pushed into the native query; overlap semantics keep boundary-spanning
      // sessions (asserted below) while limit: 0 avoids the newest-N-of-all-history trap.
      expect(mockQueryCategorySamples).toHaveBeenCalledWith(
        'HKCategoryTypeIdentifierSleepAnalysis',
        expect.objectContaining({
          ascending: false,
          limit: 0,
          filter: { date: { startDate, endDate } },
        }),
      );
    });

    test('normalizes flattened metadataTimeZone into metadata.HKTimeZone', async () => {
      await initHealthConnect();

      mockQueryCategorySamples.mockResolvedValue([
        {
          startDate: '2024-01-15T22:00:00Z',
          endDate: '2024-01-16T06:00:00Z',
          value: 'ASLEEP',
          metadata: { customKey: 'customValue' },
          metadataTimeZone: 'Europe/London',
        },
      ]);

      const result = await readHealthRecords(
        'SleepSession',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-16T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect((result[0] as { metadata?: Record<string, unknown> }).metadata).toEqual({
        customKey: 'customValue',
        HKTimeZone: 'Europe/London',
      });
    });

    test('includes sessions that overlap with date range (boundary spanning)', async () => {
      await initHealthConnect();

      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');

      mockQueryCategorySamples.mockResolvedValue([
        // Overnight sleep starting before range, ending within - INCLUDED (overlaps)
        {
          startDate: '2024-01-14T22:00:00Z',
          endDate: '2024-01-15T06:00:00Z',
          value: 'ASLEEP',
        },
        // Fully within range - INCLUDED
        {
          startDate: '2024-01-15T22:00:00Z',
          endDate: '2024-01-15T23:30:00Z',
          value: 'ASLEEP',
        },
        // Starting within range, ending after - INCLUDED (overlaps)
        {
          startDate: '2024-01-15T23:00:00Z',
          endDate: '2024-01-16T06:00:00Z',
          value: 'ASLEEP',
        },
        // Completely outside range (before) - EXCLUDED
        {
          startDate: '2024-01-13T22:00:00Z',
          endDate: '2024-01-13T23:59:59Z',
          value: 'ASLEEP',
        },
        // Completely outside range (after) - EXCLUDED
        {
          startDate: '2024-01-16T22:00:00Z',
          endDate: '2024-01-17T06:00:00Z',
          value: 'ASLEEP',
        },
      ]);

      const result = await readHealthRecords('SleepSession', startDate, endDate);

      // All overlapping sessions should be included
      expect(result).toHaveLength(3);
      expect((result[0] as { startTime: string }).startTime).toBe('2024-01-14T22:00:00Z');
      expect((result[1] as { startTime: string }).startTime).toBe('2024-01-15T22:00:00Z');
      expect((result[2] as { startTime: string }).startTime).toBe('2024-01-15T23:00:00Z');
    });

    test('includes sleep sessions spanning midnight when overlapping', async () => {
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

      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');
      const result = await readHealthRecords('BloodPressure', startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        systolic: { inMillimetersOfMercury: 120 },
        diastolic: { inMillimetersOfMercury: 80 },
        time: timestamp,
      });
      // Both component queries carry the native window.
      const expectedOptions = expect.objectContaining({
        ascending: false,
        limit: 0,
        filter: { date: { startDate, endDate } },
      });
      expect(mockQueryQuantitySamples).toHaveBeenCalledWith(
        'HKQuantityTypeIdentifierBloodPressureSystolic', expectedOptions,
      );
      expect(mockQueryQuantitySamples).toHaveBeenCalledWith(
        'HKQuantityTypeIdentifierBloodPressureDiastolic', expectedOptions,
      );
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

  describe('Nutrition records (correlations + loose fallback)', () => {
    // jest.clearAllMocks() (outer beforeEach) does NOT reset implementations, so default
    // both nutrition queries to empty here — otherwise a prior test's quantity-sample
    // implementation would leak into the loose read.
    beforeEach(() => {
      mockQueryCorrelationSamples.mockResolvedValue([]);
      mockQueryQuantitySamples.mockResolvedValue([]);
    });

    const correlation = (overrides: Record<string, unknown> = {}) => ({
      uuid: 'corr-1',
      startDate: '2024-01-15T08:00:00Z',
      endDate: '2024-01-15T08:00:00Z',
      metadataFoodType: 'Greek Yogurt',
      metadataTimeZone: 'America/New_York',
      sourceRevision: { source: { bundleIdentifier: 'com.other.app' } },
      objects: [
        { uuid: 'c-energy', quantityType: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', quantity: 150, unit: 'kcal' },
        { uuid: 'c-protein', quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 12, unit: 'g' },
      ],
      ...overrides,
    });

    // Return loose quantity samples per identifier (a single fn serves every identifier
    // query, so key off the requested identifier to model distinct nutrients).
    const looseByIdentifier = (
      map: Record<string, { uuid: string; startDate: string; quantity: number; unit: string; source: { bundleIdentifier?: string } }[]>,
    ) => (identifier: string) => Promise.resolve(map[identifier]?.map(s => ({
      uuid: s.uuid,
      startDate: s.startDate,
      quantity: s.quantity,
      unit: s.unit,
      sourceRevision: { source: s.source },
    })) ?? []);

    test('normalizes a Food correlation into a record the transformer consumes', async () => {
      await initHealthConnect();
      mockQueryCorrelationSamples.mockResolvedValue([correlation()]);

      const result = await readHealthRecords(
        'Nutrition',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      // Asserting NON-empty guards against the handler's try/catch swallowing an
      // undefined queryCorrelationSamples mock to [] (a green-but-meaningless test).
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        uuid: 'corr-1',
        startDate: '2024-01-15T08:00:00Z',
        metadataFoodType: 'Greek Yogurt',
        sourceBundleId: 'com.other.app',
        metadata: { HKTimeZone: 'America/New_York' },
      });
      expect((result[0] as { objects: unknown[] }).objects).toHaveLength(2);
      // The window must be pushed into the native query (limit: 0 = all in-window),
      // not applied as a post-filter over the most-recent QUERY_LIMIT across all history.
      expect(mockQueryCorrelationSamples).toHaveBeenCalledWith(
        'HKCorrelationTypeIdentifierFood',
        expect.objectContaining({
          ascending: false,
          limit: 0,
          filter: { date: { startDate: new Date('2024-01-15T00:00:00Z'), endDate: new Date('2024-01-15T23:59:59Z') } },
        }),
      );
    });

    test('filters correlations outside the date range', async () => {
      await initHealthConnect();
      mockQueryCorrelationSamples.mockResolvedValue([
        correlation({ uuid: 'before', startDate: '2024-01-14T23:00:00Z' }),
        correlation({ uuid: 'in', startDate: '2024-01-15T12:00:00Z' }),
        correlation({ uuid: 'after', startDate: '2024-01-17T01:00:00Z' }),
      ]);

      const result = await readHealthRecords(
        'Nutrition',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-16T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect((result[0] as { uuid: string }).uuid).toBe('in');
    });

    test('omits metadata when the correlation has no timezone', async () => {
      await initHealthConnect();
      mockQueryCorrelationSamples.mockResolvedValue([
        correlation({ metadataTimeZone: undefined }),
      ]);

      const result = await readHealthRecords(
        'Nutrition',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect((result[0] as { metadata?: unknown }).metadata).toBeUndefined();
    });

    test('groups loose samples by (source, instant) into one entry (no food name)', async () => {
      await initHealthConnect();
      const mfp = { bundleIdentifier: 'com.myfitnesspal.mfp' };
      mockQueryQuantitySamples.mockImplementation(looseByIdentifier({
        'HKQuantityTypeIdentifierDietaryEnergyConsumed': [
          { uuid: 'e1', startDate: '2024-01-15T12:30:00Z', quantity: 500, unit: 'Cal', source: mfp },
        ],
        'HKQuantityTypeIdentifierDietaryProtein': [
          { uuid: 'p1', startDate: '2024-01-15T12:30:00Z', quantity: 30, unit: 'g', source: mfp },
        ],
      }));

      const result = await readHealthRecords(
        'Nutrition',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        uuid: 'com.myfitnesspal.mfp:2024-01-15T12:30:00Z',
        startDate: '2024-01-15T12:30:00Z',
        sourceBundleId: 'com.myfitnesspal.mfp',
      });
      // Loose samples have no food name; the transformer fills in "Apple Health food".
      expect((result[0] as { metadataFoodType?: string }).metadataFoodType).toBeUndefined();
      expect((result[0] as { objects: unknown[] }).objects).toHaveLength(2);
      // The loose per-identifier read must also page within the native date window.
      expect(mockQueryQuantitySamples).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ascending: false,
          limit: 0,
          filter: { date: { startDate: new Date('2024-01-15T00:00:00Z'), endDate: new Date('2024-01-15T23:59:59Z') } },
        }),
      );
    });

    test('splits loose samples from different instants into separate entries', async () => {
      await initHealthConnect();
      const cron = { bundleIdentifier: 'CRONOMETER-GOLD' };
      mockQueryQuantitySamples.mockImplementation(looseByIdentifier({
        'HKQuantityTypeIdentifierDietaryProtein': [
          { uuid: 'a', startDate: '2024-01-15T08:00:00Z', quantity: 10, unit: 'g', source: cron },
          { uuid: 'b', startDate: '2024-01-15T19:00:00Z', quantity: 25, unit: 'g', source: cron },
        ],
      }));

      const result = await readHealthRecords(
        'Nutrition',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      expect(result).toHaveLength(2);
      expect(result.map(r => (r as { uuid: string }).uuid).sort()).toEqual([
        'CRONOMETER-GOLD:2024-01-15T08:00:00Z',
        'CRONOMETER-GOLD:2024-01-15T19:00:00Z',
      ]);
    });

    test('excludes loose samples already contained in a correlation (no double-count)', async () => {
      await initHealthConnect();
      mockQueryCorrelationSamples.mockResolvedValue([
        correlation({
          uuid: 'corr-1',
          startDate: '2024-01-15T08:00:00Z',
          sourceRevision: { source: { bundleIdentifier: 'com.fitnow.loseit' } },
          objects: [
            { uuid: 'shared-protein', quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 10, unit: 'g' },
          ],
        }),
      ]);
      mockQueryQuantitySamples.mockImplementation(looseByIdentifier({
        'HKQuantityTypeIdentifierDietaryProtein': [
          // Same UUID as the correlation's contained sample → must be skipped.
          { uuid: 'shared-protein', startDate: '2024-01-15T08:00:00Z', quantity: 10, unit: 'g', source: { bundleIdentifier: 'com.fitnow.loseit' } },
          { uuid: 'loose-protein', startDate: '2024-01-15T12:30:00Z', quantity: 20, unit: 'g', source: { bundleIdentifier: 'com.myfitnesspal.mfp' } },
        ],
      }));

      const result = await readHealthRecords(
        'Nutrition',
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z')
      );

      // One correlation entry + one loose entry; the shared-protein loose sample is excluded.
      expect(result).toHaveLength(2);
      const ids = result.map(r => (r as { uuid: string }).uuid);
      expect(ids).toContain('corr-1');
      expect(ids).toContain('com.myfitnesspal.mfp:2024-01-15T12:30:00Z');
      const looseEntry = result.find(r => (r as { sourceBundleId?: string }).sourceBundleId === 'com.myfitnesspal.mfp');
      expect((looseEntry as { objects: unknown[] }).objects).toHaveLength(1);
    });
  });
});

describe('readHealthRecordsDetailed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    resetDatabaseInaccessibleCount();
  });

  test('returns records without an error on success', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockResolvedValue([
      { startDate: '2024-01-15T10:00:00Z', endDate: '2024-01-15T10:30:00Z', quantity: 500 },
    ]);

    const result = await readHealthRecordsDetailed(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result.error).toBeUndefined();
    expect(result.records).toHaveLength(1);
  });

  test('returns an error envelope instead of a silent empty read when the query throws', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockRejectedValue(new Error('Query failed'));

    const result = await readHealthRecordsDetailed(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result.records).toEqual([]);
    expect(result.error).toBe('Query failed');
  });

  test('database-inaccessible errors both count and surface', async () => {
    await initHealthConnect();

    mockQueryQuantitySamples.mockRejectedValue(new Error('Protected health data is inaccessible'));

    const result = await readHealthRecordsDetailed(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result.error).toContain('Protected health data');
    expect(getDatabaseInaccessibleCount()).toBe(1);
  });
});

describe('readMinMaxAvgByDayDetailed', () => {
  const HEART_RATE_CONFIG = { recordType: 'HeartRate', unit: 'bpm', type: 'heart_rate' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    mockQueryStatisticsCollection.mockReset().mockResolvedValue([]);
    resetDatabaseInaccessibleCount();
  });

  test('returns null for metrics without a verified spec (caller falls back to samples)', async () => {
    await initHealthConnect();

    const result = await readMinMaxAvgByDayDetailed(
      { recordType: 'RunningSpeed', unit: 'm/s', type: 'running_speed' },
      localDate(2024, 1, 15),
      localDate(2024, 1, 15, 23, 59),
    );

    expect(result).toBeNull();
    expect(mockQueryStatisticsCollection).not.toHaveBeenCalled();
  });

  test('queries HeartRate with the pinned QUERY unit but emits the metric unit (bpm)', async () => {
    await initHealthConnect();

    const startDate = localDate(2024, 1, 15);
    const endDate = localDate(2024, 1, 15, 23, 59);
    mockQueryStatisticsCollection.mockResolvedValue([
      statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), { min: 48, max: 120, avg: 72.437 }),
    ]);

    const result = await readMinMaxAvgByDayDetailed(HEART_RATE_CONFIG, startDate, endDate);

    expect(mockQueryStatisticsCollection).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierHeartRate',
      ['discreteMin', 'discreteMax', 'discreteAverage'],
      localDate(2024, 1, 15),
      { day: 1 },
      { filter: { date: { startDate, endDate } }, unit: 'count/min' },
    );

    const date = toLocalDateString(localDate(2024, 1, 15));
    // Exactly 3 records per day — the orchestrators return this output directly, so a
    // second aggregation pass (or a missing stat) would change this count.
    expect(result!.records).toHaveLength(3);
    expect(result!.records).toEqual([
      { value: 48, type: 'heart_rate_min', date, unit: 'bpm', source: 'HealthKit', record_timezone: expect.any(String) },
      { value: 120, type: 'heart_rate_max', date, unit: 'bpm', source: 'HealthKit', record_timezone: expect.any(String) },
      { value: 72.44, type: 'heart_rate_avg', date, unit: 'bpm', source: 'HealthKit', record_timezone: expect.any(String) },
    ]);
  });

  test('matches the legacy sample path (transformHealthRecords + aggregateByDay) for min/max', async () => {
    await initHealthConnect();

    const dayStart = localDate(2024, 1, 15);
    const sample = (hour: number, bpm: number) => {
      const iso = localDate(2024, 1, 15, hour).toISOString();
      return { startTime: iso, endTime: iso, time: iso, value: bpm, samples: [{ beatsPerMinute: bpm }] };
    };
    const legacy = aggregateByDay(
      transformHealthRecords(
        [sample(8, 62), sample(12, 118), sample(20, 74)],
        HEART_RATE_CONFIG,
      ) as TransformedRecord[],
      'heart_rate',
      'bpm',
      'min-max-avg',
    );

    // Same day via day statistics (avg differs by design: HealthKit's discreteAverage is
    // time-weighted, so it is asserted against the mocked bucket, not the legacy mean).
    mockQueryStatisticsCollection.mockResolvedValue([
      statsBucket(dayStart, localDate(2024, 1, 16), { min: 62, max: 118, avg: 84.666 }),
    ]);
    const result = await readMinMaxAvgByDayDetailed(HEART_RATE_CONFIG, dayStart, localDate(2024, 1, 15, 23, 59));

    const pick = (records: TransformedRecord[], type: string) => {
      const record = records.find(r => r.type === type)!;
      return { value: record.value, type: record.type, date: record.date, unit: record.unit, source: record.source };
    };
    expect(pick(result!.records, 'heart_rate_min')).toEqual(pick(legacy, 'heart_rate_min'));
    expect(pick(result!.records, 'heart_rate_max')).toEqual(pick(legacy, 'heart_rate_max'));
    expect(result!.records.find(r => r.type === 'heart_rate_avg')!.value).toBe(84.67);
  });

  test('emits 3 records per day across multiple day buckets', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), { min: 50, max: 100, avg: 70 }),
      statsBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), { min: 55, max: 110, avg: 75 }),
    ]);

    const result = await readMinMaxAvgByDayDetailed(
      HEART_RATE_CONFIG,
      localDate(2024, 1, 15),
      localDate(2024, 1, 16, 23, 59),
    );

    expect(result!.records).toHaveLength(6);
    expect(result!.records.map(r => r.date)).toEqual([
      toLocalDateString(localDate(2024, 1, 15)),
      toLocalDateString(localDate(2024, 1, 15)),
      toLocalDateString(localDate(2024, 1, 15)),
      toLocalDateString(localDate(2024, 1, 16)),
      toLocalDateString(localDate(2024, 1, 16)),
      toLocalDateString(localDate(2024, 1, 16)),
    ]);
  });

  test('keeps a zero-value day', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), { min: 0, max: 0, avg: 0 }),
    ]);

    const result = await readMinMaxAvgByDayDetailed(
      HEART_RATE_CONFIG,
      localDate(2024, 1, 15),
      localDate(2024, 1, 15, 23, 59),
    );

    expect(result!.records).toHaveLength(3);
    expect(result!.records.every(r => r.value === 0)).toBe(true);
  });

  test('skips buckets without stats (days with no samples)', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockResolvedValue([
      statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16)), // no data
      statsBucket(localDate(2024, 1, 16), localDate(2024, 1, 17), { min: 50, max: 100, avg: 70 }),
    ]);

    const result = await readMinMaxAvgByDayDetailed(
      HEART_RATE_CONFIG,
      localDate(2024, 1, 15),
      localDate(2024, 1, 16, 23, 59),
    );

    expect(result!.records).toHaveLength(3);
    expect(result!.records[0].date).toBe(toLocalDateString(localDate(2024, 1, 16)));
  });

  test('a native error returns an error envelope, NOT null (no silent sample fallback)', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockRejectedValue(new Error('boom'));

    const result = await readMinMaxAvgByDayDetailed(
      HEART_RATE_CONFIG,
      localDate(2024, 1, 15),
      localDate(2024, 1, 15, 23, 59),
    );

    expect(result).toEqual({ records: [], error: 'boom' });
  });

  test('database-inaccessible errors count toward the locked-device counter', async () => {
    await initHealthConnect();

    mockQueryStatisticsCollection.mockRejectedValue(new Error('Protected health data is inaccessible'));

    const result = await readMinMaxAvgByDayDetailed(
      HEART_RATE_CONFIG,
      localDate(2024, 1, 15),
      localDate(2024, 1, 15, 23, 59),
    );

    expect(result!.error).toContain('Protected health data');
    expect(getDatabaseInaccessibleCount()).toBe(1);
  });

  describe('converted metrics (query unit vs emitted unit)', () => {
    test('HeartRateVariabilitySDNN queries and emits ms', async () => {
      await initHealthConnect();

      mockQueryStatisticsCollection.mockResolvedValue([
        statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), { min: 30, max: 52, avg: 43.333 }, 'ms'),
      ]);

      const result = await readMinMaxAvgByDayDetailed(
        { recordType: 'HeartRateVariabilitySDNN', unit: 'ms', type: 'HRV_SDNN' },
        localDate(2024, 1, 15),
        localDate(2024, 1, 15, 23, 59),
      );

      expect(mockQueryStatisticsCollection.mock.calls[0][0]).toBe('HKQuantityTypeIdentifierHeartRateVariabilitySDNN');
      expect(mockQueryStatisticsCollection.mock.calls[0][4].unit).toBe('ms');
      expect(result!.records.map(r => ({ type: r.type, value: r.value, unit: r.unit }))).toEqual([
        { type: 'HRV_SDNN_min', value: 30, unit: 'ms' },
        { type: 'HRV_SDNN_max', value: 52, unit: 'ms' },
        { type: 'HRV_SDNN_avg', value: 43.33, unit: 'ms' },
      ]);
    });

    test("RespiratoryRate queries count/min but emits breaths/min", async () => {
      await initHealthConnect();

      mockQueryStatisticsCollection.mockResolvedValue([
        statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), { min: 12, max: 18, avg: 14.5 }),
      ]);

      const result = await readMinMaxAvgByDayDetailed(
        { recordType: 'RespiratoryRate', unit: 'breaths/min', type: 'respiratory_rate' },
        localDate(2024, 1, 15),
        localDate(2024, 1, 15, 23, 59),
      );

      expect(mockQueryStatisticsCollection.mock.calls[0][0]).toBe('HKQuantityTypeIdentifierRespiratoryRate');
      expect(mockQueryStatisticsCollection.mock.calls[0][4].unit).toBe('count/min');
      expect(result!.records.every(r => r.unit === 'breaths/min')).toBe(true);
      expect(result!.records.map(r => r.value)).toEqual([12, 18, 14.5]);
    });

    test('BloodGlucose queries mg/dL, converts to mmol/L, and matches the legacy transformer', async () => {
      await initHealthConnect();

      const config = { recordType: 'BloodGlucose', unit: 'mmol/L', type: 'blood_glucose' };
      const dayIso = localDate(2024, 1, 15, 8).toISOString();
      // Legacy path: mg/dL sample → transformer divides by 18.018 → aggregateByDay.
      const legacy = aggregateByDay(
        transformHealthRecords(
          [{ time: dayIso, level: { inMilligramsPerDeciliter: 90.09 } },
            { time: dayIso, level: { inMilligramsPerDeciliter: 180.18 } }],
          config,
        ) as TransformedRecord[],
        'blood_glucose',
        'mmol/L',
        'min-max-avg',
      );

      mockQueryStatisticsCollection.mockResolvedValue([
        statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), { min: 90.09, max: 180.18, avg: 135.135 }, 'mg/dL'),
      ]);
      const result = await readMinMaxAvgByDayDetailed(
        config,
        localDate(2024, 1, 15),
        localDate(2024, 1, 15, 23, 59),
      );

      expect(mockQueryStatisticsCollection.mock.calls[0][0]).toBe('HKQuantityTypeIdentifierBloodGlucose');
      expect(mockQueryStatisticsCollection.mock.calls[0][4].unit).toBe('mg/dL');
      expect(result!.records.every(r => r.unit === 'mmol/L')).toBe(true);
      const legacyMin = legacy.find(r => r.type === 'blood_glucose_min')!;
      const legacyMax = legacy.find(r => r.type === 'blood_glucose_max')!;
      expect(result!.records.find(r => r.type === 'blood_glucose_min')!.value).toBe(legacyMin.value);
      expect(result!.records.find(r => r.type === 'blood_glucose_max')!.value).toBe(legacyMax.value);
      expect(result!.records.find(r => r.type === 'blood_glucose_avg')!.value).toBe(7.5); // 135.135 / 18.018
    });

    test('BloodOxygenSaturation queries the 0–1 fraction unit (%) and emits percent ×100', async () => {
      await initHealthConnect();

      const config = { recordType: 'BloodOxygenSaturation', unit: 'percent', type: 'blood_oxygen_saturation' };
      mockQueryStatisticsCollection.mockResolvedValue([
        statsBucket(localDate(2024, 1, 15), localDate(2024, 1, 16), { min: 0.92, max: 0.99, avg: 0.9612 }, '%'),
      ]);

      const result = await readMinMaxAvgByDayDetailed(
        config,
        localDate(2024, 1, 15),
        localDate(2024, 1, 15, 23, 59),
      );

      expect(mockQueryStatisticsCollection.mock.calls[0][0]).toBe('HKQuantityTypeIdentifierOxygenSaturation');
      expect(mockQueryStatisticsCollection.mock.calls[0][4].unit).toBe('%');
      expect(result!.records.map(r => ({ type: r.type, value: r.value, unit: r.unit }))).toEqual([
        { type: 'blood_oxygen_saturation_min', value: 92, unit: 'percent' },
        { type: 'blood_oxygen_saturation_max', value: 99, unit: 'percent' },
        { type: 'blood_oxygen_saturation_avg', value: 96.12, unit: 'percent' },
      ]);
    });

    test('the Android recordType OxygenSaturation has NO spec (avoids cross-platform key mixups)', async () => {
      await initHealthConnect();

      const result = await readMinMaxAvgByDayDetailed(
        { recordType: 'OxygenSaturation', unit: 'percent', type: 'blood_oxygen_saturation' },
        localDate(2024, 1, 15),
        localDate(2024, 1, 15, 23, 59),
      );

      expect(result).toBeNull();
    });
  });
});

describe('isDatabaseInaccessibleError', () => {
  test('returns true for "protected health data" error message', () => {
    const error = new Error('Protected health data is inaccessible');
    expect(isDatabaseInaccessibleError(error)).toBe(true);
  });

  test('returns true for "errordatabaseinaccessible" error message', () => {
    const error = new Error('HKError errordatabaseinaccessible');
    expect(isDatabaseInaccessibleError(error)).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(isDatabaseInaccessibleError(new Error('PROTECTED HEALTH DATA is blocked'))).toBe(true);
    expect(isDatabaseInaccessibleError(new Error('ErrorDatabaseInaccessible'))).toBe(true);
  });

  test('returns false for non-Error values', () => {
    expect(isDatabaseInaccessibleError('protected health data')).toBe(false);
    expect(isDatabaseInaccessibleError(null)).toBe(false);
    expect(isDatabaseInaccessibleError(undefined)).toBe(false);
    expect(isDatabaseInaccessibleError(42)).toBe(false);
  });

  test('returns false for unrelated errors', () => {
    expect(isDatabaseInaccessibleError(new Error('Network timeout'))).toBe(false);
    expect(isDatabaseInaccessibleError(new Error('Authorization denied'))).toBe(false);
  });
});

describe('databaseInaccessibleCount', () => {
  beforeEach(() => {
    resetDatabaseInaccessibleCount();
  });

  test('starts at zero after reset', () => {
    expect(getDatabaseInaccessibleCount()).toBe(0);
  });

  test('increments when readHealthRecords catches a database inaccessible error', async () => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    await initHealthConnect();

    mockQueryQuantitySamples.mockRejectedValue(new Error('Protected health data is inaccessible'));

    await readHealthRecords('Steps', new Date('2024-01-15'), new Date('2024-01-16'));

    expect(getDatabaseInaccessibleCount()).toBe(1);
  });

  test('increments when getAggregatedStepsByDate catches a database inaccessible error', async () => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    await initHealthConnect();

    mockQueryStatisticsCollection.mockRejectedValue(new Error('Protected health data is inaccessible'));

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-15T23:59:59Z');
    await getAggregatedStepsByDate(startDate, endDate);

    expect(getDatabaseInaccessibleCount()).toBe(1);
  });

  test('increments when getAggregatedTotalCaloriesByDate catches a database inaccessible error', async () => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    await initHealthConnect();

    mockQueryStatisticsCollection.mockRejectedValue(new Error('Protected health data is inaccessible'));

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-15T23:59:59Z');
    await getAggregatedTotalCaloriesByDate(startDate, endDate);

    expect(getDatabaseInaccessibleCount()).toBeGreaterThanOrEqual(1);
  });

  test('does not increment for unrelated errors', async () => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    await initHealthConnect();

    mockQueryQuantitySamples.mockRejectedValue(new Error('Network error'));

    await readHealthRecords('Steps', new Date('2024-01-15'), new Date('2024-01-16'));

    expect(getDatabaseInaccessibleCount()).toBe(0);
  });

  test('resets correctly between syncs', async () => {
    jest.clearAllMocks();
    mockIsHealthDataAvailable.mockResolvedValue(true);
    await initHealthConnect();

    mockQueryQuantitySamples.mockRejectedValue(new Error('Protected health data is inaccessible'));
    await readHealthRecords('Steps', new Date('2024-01-15'), new Date('2024-01-16'));
    expect(getDatabaseInaccessibleCount()).toBe(1);

    resetDatabaseInaccessibleCount();
    expect(getDatabaseInaccessibleCount()).toBe(0);
  });
});
