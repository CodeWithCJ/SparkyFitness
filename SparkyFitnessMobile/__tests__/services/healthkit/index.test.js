import {
  getSyncStartDate,
  initHealthConnect,
  getAggregatedStepsByDate,
  readHealthRecords,
} from '../../../src/services/healthkit/index';

import {
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('getSyncStartDate', () => {
  test('all known durations return midnight (00:00:00.000)', () => {
    const durations = ['today', '24h', '3d', '7d', '30d', '90d'];
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

  test('unknown value defaults to 24h ago', () => {
    const before = Date.now();
    const result = getSyncStartDate('invalid-duration');
    const after = Date.now();

    const twentyFourHoursAgo = new Date(before - 24 * 60 * 60 * 1000);
    // Result should be within a reasonable range (accounting for test execution time)
    expect(result.getTime()).toBeGreaterThanOrEqual(twentyFourHoursAgo.getTime() - 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000 + 1000);
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
    isHealthDataAvailable.mockResolvedValue(true);

    const result = await initHealthConnect();

    expect(result).toBe(true);
    expect(isHealthDataAvailable).toHaveBeenCalled();
  });

  test('returns false when isHealthDataAvailable returns false', async () => {
    isHealthDataAvailable.mockResolvedValue(false);

    const result = await initHealthConnect();

    expect(result).toBe(false);
  });

  test('returns false and handles error when isHealthDataAvailable throws', async () => {
    isHealthDataAvailable.mockRejectedValue(new Error('HealthKit not supported'));

    const result = await initHealthConnect();

    expect(result).toBe(false);
  });
});

describe('getAggregatedStepsByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset HealthKit availability state by calling initHealthConnect
    isHealthDataAvailable.mockResolvedValue(true);
  });

  test('returns empty array when HealthKit is unavailable', async () => {
    // Set HealthKit as unavailable
    isHealthDataAvailable.mockResolvedValue(false);
    await initHealthConnect();

    const startDate = new Date('2024-01-15');
    const endDate = new Date('2024-01-15');

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(result).toEqual([]);
  });

  test('returns formatted result for single day with data', async () => {
    // Initialize HealthKit as available
    await initHealthConnect();

    queryStatisticsForQuantity.mockResolvedValue({
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

    queryStatisticsForQuantity
      .mockResolvedValueOnce({ sumQuantity: { quantity: 5000 } })
      .mockResolvedValueOnce({ sumQuantity: { quantity: 6000 } })
      .mockResolvedValueOnce({ sumQuantity: { quantity: 7000 } });

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-17T23:59:59Z');

    const result = await getAggregatedStepsByDate(startDate, endDate);

    expect(queryStatisticsForQuantity).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  test('skips days with no data (null or zero)', async () => {
    await initHealthConnect();

    queryStatisticsForQuantity
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

    queryStatisticsForQuantity.mockResolvedValue({
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

    queryStatisticsForQuantity
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

describe('readHealthRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isHealthDataAvailable.mockResolvedValue(true);
  });

  test('returns empty array when HealthKit is unavailable', async () => {
    isHealthDataAvailable.mockResolvedValue(false);
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

    queryQuantitySamples.mockResolvedValue([
      { startDate: '2024-01-14T23:00:00Z', quantity: 100 }, // Before range
      { startDate: '2024-01-15T12:00:00Z', quantity: 200 }, // In range
      { startDate: '2024-01-16T12:00:00Z', quantity: 300 }, // In range
      { startDate: '2024-01-17T01:00:00Z', quantity: 400 }, // After range
    ]);

    const result = await readHealthRecords('Steps', startDate, endDate);

    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(200);
    expect(result[1].value).toBe(300);
  });

  test('transforms Steps records to expected format', async () => {
    await initHealthConnect();

    queryQuantitySamples.mockResolvedValue([
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

    queryQuantitySamples.mockResolvedValue([
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
    expect(result[0].samples).toEqual([{ beatsPerMinute: 72 }]);
  });

  test('transforms Weight records with weight object', async () => {
    await initHealthConnect();

    queryQuantitySamples.mockResolvedValue([
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
    expect(result[0].weight).toEqual({ inKilograms: 75.5 });
  });

  test('handles non-array response from queryQuantitySamples', async () => {
    await initHealthConnect();

    queryQuantitySamples.mockResolvedValue(null);

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });
});
