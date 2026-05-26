import {
  initHealthConnect,
  requestHealthPermissions,
  getSyncStartDate,
  readHealthRecords,
  readHealthRecordsDetailed,
  getAggregatedStepsByDate,
  getAggregatedStepsByDateDetailed,
  getAggregatedActiveCaloriesByDate,
  enrichExerciseSessions,
} from '../../../src/services/healthconnect/index';

// Helpers — construct test dates in local time so the per-day window math
// in aggregateCumulativeMetricByDay produces predictable output regardless
// of the runtime timezone.
const localMidnight = (y: number, m1to12: number, d: number) =>
  new Date(y, m1to12 - 1, d, 0, 0, 0, 0);
const localEndOfDay = (y: number, m1to12: number, d: number) =>
  new Date(y, m1to12 - 1, d, 23, 59, 59, 999);

import {
  initialize,
  requestPermission,
  readRecords,
  aggregateRecord,
  aggregateGroupByPeriod,
} from 'react-native-health-connect';

import type { PermissionRequest, GrantedPermission } from '../../../src/types/healthRecords';
import type { SyncDuration } from '../../../src/services/healthconnect/preferences';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { recordType: 'Steps', stateKey: 'isStepsSyncEnabled', unit: 'count', type: 'step' },
    { recordType: 'HeartRate', stateKey: 'isHeartRateSyncEnabled', unit: 'bpm', type: 'heart_rate', aggregationStrategy: 'min-max-avg' },
    { recordType: 'Weight', stateKey: 'isWeightSyncEnabled', unit: 'kg', type: 'weight' },
    { recordType: 'ActiveCaloriesBurned', stateKey: 'isCaloriesSyncEnabled', unit: 'kcal', type: 'Active Calories' },
    { recordType: 'TotalCaloriesBurned', stateKey: 'isTotalCaloriesSyncEnabled', unit: 'kcal', type: 'total_calories' },
  ],
}));

const mockInitialize = initialize as jest.Mock;
const mockRequestPermission = requestPermission as jest.Mock;
const mockReadRecords = readRecords as jest.Mock;
const mockAggregateRecord = aggregateRecord as jest.Mock;
const mockAggregateGroupByPeriod = aggregateGroupByPeriod as jest.Mock;

// Helper to construct an aggregateGroupByPeriod bucket. startTime is the local
// midnight of the day the bucket represents — formatLocalDay parses it with
// the JS runtime's timezone, so we use a midnight ISO with no offset suffix
// to keep tests timezone-independent.
const periodBucket = (y: number, m1to12: number, d: number, result: unknown) => ({
  result,
  startTime: new Date(y, m1to12 - 1, d, 0, 0, 0, 0).toISOString(),
  endTime: new Date(y, m1to12 - 1, d + 1, 0, 0, 0, 0).toISOString(),
});

describe('initHealthConnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true when initialize succeeds', async () => {
    mockInitialize.mockResolvedValue(true);

    const result = await initHealthConnect();

    expect(result).toBe(true);
  });

  test('returns false when initialize returns false', async () => {
    mockInitialize.mockResolvedValue(false);

    const result = await initHealthConnect();

    expect(result).toBe(false);
  });

  test('returns false when initialize throws error', async () => {
    mockInitialize.mockRejectedValue(new Error('Health Connect not available'));

    const result = await initHealthConnect();

    expect(result).toBe(false);
  });
});

describe('requestHealthPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true when all requested permissions are granted', async () => {
    const permissions: PermissionRequest[] = [
      { recordType: 'Steps', accessType: 'read' },
      { recordType: 'HeartRate', accessType: 'read' },
    ];

    mockRequestPermission.mockResolvedValue([
      { recordType: 'Steps', accessType: 'read' },
      { recordType: 'HeartRate', accessType: 'read' },
    ] as GrantedPermission[]);

    const result = await requestHealthPermissions(permissions);

    expect(result).toBe(true);
  });

  test('returns false when not all permissions are granted', async () => {
    const permissions: PermissionRequest[] = [
      { recordType: 'Steps', accessType: 'read' },
      { recordType: 'HeartRate', accessType: 'read' },
    ];

    // Only Steps permission granted
    mockRequestPermission.mockResolvedValue([
      { recordType: 'Steps', accessType: 'read' },
    ] as GrantedPermission[]);

    const result = await requestHealthPermissions(permissions);

    expect(result).toBe(false);
  });

  test('returns false when no permissions are granted', async () => {
    const permissions: PermissionRequest[] = [
      { recordType: 'Steps', accessType: 'read' },
    ];

    mockRequestPermission.mockResolvedValue([] as GrantedPermission[]);

    const result = await requestHealthPermissions(permissions);

    expect(result).toBe(false);
  });

  test('throws error when requestPermission fails', async () => {
    const permissions: PermissionRequest[] = [{ recordType: 'Steps', accessType: 'read' }];

    mockRequestPermission.mockRejectedValue(new Error('Permission request failed'));

    await expect(requestHealthPermissions(permissions)).rejects.toThrow('Permission request failed');
  });

  test('handles partial grants correctly', async () => {
    const permissions: PermissionRequest[] = [
      { recordType: 'Steps', accessType: 'read' },
      { recordType: 'HeartRate', accessType: 'read' },
      { recordType: 'Weight', accessType: 'read' },
    ];

    // Only 2 of 3 permissions granted
    mockRequestPermission.mockResolvedValue([
      { recordType: 'Steps', accessType: 'read' },
      { recordType: 'Weight', accessType: 'read' },
    ] as GrantedPermission[]);

    const result = await requestHealthPermissions(permissions);

    expect(result).toBe(false);
  });

  test('deduplicates repeated permissions before requesting them', async () => {
    const permissions: PermissionRequest[] = [
      { recordType: 'Distance', accessType: 'read' },
      { recordType: 'ExerciseSession', accessType: 'read' },
      { recordType: 'Distance', accessType: 'read' },
    ];

    mockRequestPermission.mockResolvedValue([
      { recordType: 'Distance', accessType: 'read' },
      { recordType: 'ExerciseSession', accessType: 'read' },
    ] as GrantedPermission[]);

    const result = await requestHealthPermissions(permissions);

    expect(result).toBe(true);
    expect(mockRequestPermission).toHaveBeenCalledWith([
      { recordType: 'Distance', accessType: 'read' },
      { recordType: 'ExerciseSession', accessType: 'read' },
    ]);
  });
});

describe('getSyncStartDate', () => {
  describe('midnight behavior', () => {
    test("'today' returns today's date at midnight", () => {
      const result = getSyncStartDate('today');
      const expected = new Date();
      expected.setHours(0, 0, 0, 0);

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    test("'24h' returns exactly 24 hours ago (rolling window, not snapped to midnight)", () => {
      const before = new Date();
      const result = getSyncStartDate('24h');
      const after = new Date();

      // Should be approximately 24 hours ago (within a few ms of test execution)
      const expectedTime = before.getTime() - 24 * 60 * 60 * 1000;
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime() - 24 * 60 * 60 * 1000 + 100);
    });

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
  });

  describe('date calculations', () => {
    test("'3d' returns 2 days ago at midnight", () => {
      const result = getSyncStartDate('3d');
      const expected = new Date();
      expected.setDate(expected.getDate() - 2);
      expected.setHours(0, 0, 0, 0);

      expect(result.getDate()).toBe(expected.getDate());
      expect(result.getMonth()).toBe(expected.getMonth());
    });

    test("'7d' returns 6 days ago at midnight", () => {
      const result = getSyncStartDate('7d');
      const expected = new Date();
      expected.setDate(expected.getDate() - 6);
      expected.setHours(0, 0, 0, 0);

      expect(result.getDate()).toBe(expected.getDate());
      expect(result.getMonth()).toBe(expected.getMonth());
    });

    test("'30d' returns 29 days ago at midnight", () => {
      const result = getSyncStartDate('30d');
      const expected = new Date();
      expected.setDate(expected.getDate() - 29);
      expected.setHours(0, 0, 0, 0);

      expect(result.getDate()).toBe(expected.getDate());
      expect(result.getMonth()).toBe(expected.getMonth());
    });

    test("'90d' returns 89 days ago at midnight", () => {
      const result = getSyncStartDate('90d');
      const expected = new Date();
      expected.setDate(expected.getDate() - 89);
      expected.setHours(0, 0, 0, 0);

      expect(result.getDate()).toBe(expected.getDate());
      expect(result.getMonth()).toBe(expected.getMonth());
    });
  });

});

describe('readHealthRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls readRecords with correct parameters including pageSize', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    const startDate = new Date('2024-01-15T00:00:00Z');
    const endDate = new Date('2024-01-15T23:59:59Z');

    await readHealthRecords('Steps', startDate, endDate);

    expect(readRecords).toHaveBeenCalledWith('Steps', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      },
      pageSize: 5000,
    });
  });

  test('returns records from the response', async () => {
    const mockRecords = [
      { startTime: '2024-01-15T10:00:00Z', count: 5000 },
      { startTime: '2024-01-15T12:00:00Z', count: 3000 },
    ];
    mockReadRecords.mockResolvedValue({ records: mockRecords });

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual(mockRecords);
  });

  test('returns empty array when no records found', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });

  test('returns empty array when readRecords throws error', async () => {
    mockReadRecords.mockRejectedValue(new Error('Failed to read records'));

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });

  test('does not call native readRecords when the requested window is invalid', async () => {
    const result = await readHealthRecordsDetailed(
      'Steps',
      new Date('2024-01-16T00:00:00Z'),
      new Date('2024-01-15T00:00:00Z')
    );

    expect(result.records).toEqual([]);
    expect(result.error).toContain('startTime');
    expect(mockReadRecords).not.toHaveBeenCalled();
  });

  test('does not split into fallback sub-windows when HC reports quota exceeded', async () => {
    // The original error message format Health Connect returns on quota burst.
    // Splitting the range into 90 daily windows (and each into 24 hourly ones)
    // would multiply the call rate and keep us pinned against the quota, so
    // the fallback path must short-circuit instead of recursing.
    const quotaError = new Error(
      'android.health.connect.HealthConnectException: API call quota exceeded, availableQuota: 0.8 requested: 1',
    );
    mockReadRecords.mockRejectedValue(quotaError);

    const result = await readHealthRecordsDetailed(
      'StepsCadence',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-04-14T00:00:00Z'), // 90-day range — would normally trigger fallback
    );

    expect(result.records).toEqual([]);
    expect(result.error).toContain('quota exceeded');
    // Exactly one call — no fallback splitting.
    expect(mockReadRecords).toHaveBeenCalledTimes(1);
  });

  test('recovers readable sub-windows after a page-one read failure', async () => {
    const recoveredRecords = [{ startTime: '2024-01-15T00:30:00Z', beatsPerMinute: 72 }];
    mockReadRecords
      .mockRejectedValueOnce(new Error('Corrupt record in range'))
      .mockRejectedValueOnce(new Error('Corrupt record in day'))
      .mockResolvedValueOnce({ records: recoveredRecords })
      .mockResolvedValueOnce({ records: [] });

    const result = await readHealthRecordsDetailed(
      'HeartRate',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T02:00:00Z')
    );

    expect(result).toEqual({ records: recoveredRecords });
    expect(mockReadRecords).toHaveBeenCalledTimes(4);
  });

  test('returns empty array when records is undefined', async () => {
    mockReadRecords.mockResolvedValue({});

    const result = await readHealthRecords(
      'Steps',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });

  test('fetches multiple pages when pageToken is returned', async () => {
    const page1Records = [{ startTime: '2024-01-15T10:00:00Z', count: 100 }];
    const page2Records = [{ startTime: '2024-01-15T12:00:00Z', count: 200 }];

    mockReadRecords
      .mockResolvedValueOnce({ records: page1Records, pageToken: 'token-page-2' })
      .mockResolvedValueOnce({ records: page2Records });

    const result = await readHealthRecords(
      'HeartRate',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([...page1Records, ...page2Records]);
    expect(mockReadRecords).toHaveBeenCalledTimes(2);
    // Second call should include the pageToken
    expect(mockReadRecords.mock.calls[1][1]).toMatchObject({
      pageToken: 'token-page-2',
    });
  });

  test('returns partial data when error occurs mid-pagination', async () => {
    const page1Records = [{ startTime: '2024-01-15T10:00:00Z', count: 100 }];

    mockReadRecords
      .mockResolvedValueOnce({ records: page1Records, pageToken: 'token-page-2' })
      .mockRejectedValueOnce(new Error('Connection lost'));

    const result = await readHealthRecords(
      'HeartRate',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    // Should return page 1 records instead of empty array
    expect(result).toEqual(page1Records);
  });

  test('stops at max page limit as safety valve', async () => {
    // Always return a pageToken to simulate infinite pagination
    mockReadRecords.mockImplementation(() =>
      Promise.resolve({ records: [{ value: 1 }], pageToken: 'next' })
    );

    const result = await readHealthRecords(
      'HeartRate',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(mockReadRecords).toHaveBeenCalledTimes(100);
    expect(result).toHaveLength(100);
  });
});

describe('getAggregatedStepsByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: tz-offset lookup finds no records (no offset captured).
    mockReadRecords.mockResolvedValue({ records: [] });
    mockAggregateGroupByPeriod.mockResolvedValue([]);
  });

  test('returns one entry per local day with the native aggregate total', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 5000 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([
      { date: '2024-01-15', value: 5000, type: 'step' },
    ]);
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: 'Steps',
        timeRangeFilter: expect.objectContaining({ operator: 'between' }),
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      }),
    );
    // Must NOT pass dataOriginFilter — that would defeat HC's native cross-origin dedup.
    expect(mockAggregateGroupByPeriod.mock.calls[0][0]).not.toHaveProperty('dataOriginFilter');
  });

  test('passes through native cross-origin dedup (regression for #1279)', async () => {
    // Simulates the empirically verified scenario: HC's native aggregate returns the
    // deduped total across multiple origins. The helper must NOT post-process or
    // recombine — it just emits what HC returned. If a future refactor regressed
    // to per-origin Math.max or naive sum, this test would fail.
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 7000 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result[0].value).toBe(7000);
  });

  test('emits one entry per returned bucket in a multi-day range with a single native call', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 5000 }),
      periodBucket(2024, 1, 16, { COUNT_TOTAL: 6000 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 16),
    );

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.date === '2024-01-15')?.value).toBe(5000);
    expect(result.find((r) => r.date === '2024-01-16')?.value).toBe(6000);
    // Single native call regardless of how many days — this is the fix for
    // the HC quota blowup on long syncs.
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
  });

  test('skips buckets whose aggregate is zero or missing', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 0 }),
      periodBucket(2024, 1, 16, { COUNT_TOTAL: 4200 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 16),
    );

    expect(result).toEqual([{ date: '2024-01-16', value: 4200, type: 'step' }]);
  });

  test('captures one range-wide UTC offset and attaches it to every day', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 3000 }),
      periodBucket(2024, 1, 16, { COUNT_TOTAL: 3500 }),
    ]);
    mockReadRecords.mockResolvedValue({
      records: [
        { startZoneOffset: { totalSeconds: -28800 } }, // -480 min (UTC-8)
      ],
    });

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 16),
    );

    expect(result.every((r) => r.record_utc_offset_minutes === -480)).toBe(true);
    // Offset lookup must be a single pageSize:1 read for the whole range —
    // not per-day, which is what blew the quota in the first place.
    expect(mockReadRecords).toHaveBeenCalledTimes(1);
    expect(mockReadRecords.mock.calls[0][1]).toMatchObject({ pageSize: 1 });
  });

  test('omits offset when the tz-lookup read returns nothing', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 3000 }),
    ]);
    mockReadRecords.mockResolvedValue({ records: [] });

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result[0]).not.toHaveProperty('record_utc_offset_minutes');
  });

  test('returns the error and empty records when aggregateGroupByPeriod rejects', async () => {
    mockAggregateGroupByPeriod.mockRejectedValue(new Error('HC unavailable'));

    const result = await getAggregatedStepsByDateDetailed(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 16),
    );

    expect(result.records).toEqual([]);
    expect(result.error).toBe('HC unavailable');
  });

  test('returns empty array when every bucket has no data', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 0 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([]);
  });

  test('does not call native aggregate when the requested window is invalid', async () => {
    const result = await getAggregatedStepsByDateDetailed(
      localEndOfDay(2024, 1, 16),
      localMidnight(2024, 1, 15),
    );

    expect(result.records).toEqual([]);
    expect(result.error).toContain('startTime');
    expect(mockAggregateGroupByPeriod).not.toHaveBeenCalled();
    expect(mockAggregateRecord).not.toHaveBeenCalled();
    expect(mockReadRecords).not.toHaveBeenCalled();
  });

  test('preserves rolling-window start times by default for display callers', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([]);

    const rollingStart = new Date(2024, 0, 15, 14, 30, 0, 0);
    const now = new Date(2024, 0, 16, 14, 30, 0, 0);

    await getAggregatedStepsByDateDetailed(rollingStart, now);

    const call = mockAggregateGroupByPeriod.mock.calls[0][0];
    expect(call.timeRangeFilter.startTime).toBe(rollingStart.toISOString());
    expect(call.timeRangeFilter.endTime).toBe(now.toISOString());
  });

  test('snaps upload rolling-window start times down to local midnight before querying HC', async () => {
    // Uploads emit date-only rows. Since HC anchors DAYS buckets at the supplied
    // startTime, cumulative sync needs calendar-day boundaries before mapping
    // bucket.startTime back to a YYYY-MM-DD date.
    mockAggregateGroupByPeriod.mockResolvedValue([]);

    const rollingStart = new Date(2024, 0, 15, 14, 30, 0, 0);
    const now = new Date(2024, 0, 16, 14, 30, 0, 0);

    await getAggregatedStepsByDateDetailed(rollingStart, now, {
      alignStartToLocalDay: true,
    });

    const call = mockAggregateGroupByPeriod.mock.calls[0][0];
    const queriedStart = new Date(call.timeRangeFilter.startTime);
    expect(queriedStart.getHours()).toBe(0);
    expect(queriedStart.getMinutes()).toBe(0);
    expect(queriedStart.getSeconds()).toBe(0);
    expect(queriedStart.getMilliseconds()).toBe(0);
    expect(queriedStart.getFullYear()).toBe(2024);
    expect(queriedStart.getMonth()).toBe(0);
    expect(queriedStart.getDate()).toBe(15);
    // End time is left as the caller provided it.
    expect(call.timeRangeFilter.endTime).toBe(now.toISOString());
  });
});

describe('getAggregatedActiveCaloriesByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadRecords.mockResolvedValue({ records: [] });
    mockAggregateGroupByPeriod.mockResolvedValue([]);
  });

  test('returns rounded kcal totals from the native aggregate', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { ACTIVE_CALORIES_TOTAL: { inKilocalories: 500.5 } }),
    ]);

    const result = await getAggregatedActiveCaloriesByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([
      { date: '2024-01-15', value: 501, type: 'active_calories' },
    ]);
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: 'ActiveCaloriesBurned',
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      }),
    );
    expect(mockAggregateGroupByPeriod.mock.calls[0][0]).not.toHaveProperty('dataOriginFilter');
  });

  test('passes through native cross-origin dedup (regression for #1279)', async () => {
    // Same regression intent as Steps — assert the dedup value, not a sum.
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { ACTIVE_CALORIES_TOTAL: { inKilocalories: 600 } }),
    ]);

    const result = await getAggregatedActiveCaloriesByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result[0].value).toBe(600);
  });

  test('skips buckets whose aggregate envelope is empty', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, {}),
    ]);

    const result = await getAggregatedActiveCaloriesByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([]);
  });

  test('returns empty records when the native aggregate call fails', async () => {
    mockAggregateGroupByPeriod.mockRejectedValue(new Error('HC unavailable'));

    const result = await getAggregatedActiveCaloriesByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([]);
  });
});

describe('enrichExerciseSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeSession = (overrides: Record<string, unknown> = {}) => ({
    startTime: '2024-01-15T10:00:00Z',
    endTime: '2024-01-15T11:00:00Z',
    metadata: { dataOrigin: 'com.fitbit' },
    ...overrides,
  });

  test('returns empty array for empty input', async () => {
    const result = await enrichExerciseSessions([]);
    expect(result).toEqual([]);
    expect(mockAggregateRecord).not.toHaveBeenCalled();
  });

  test('attaches ActiveCaloriesBurned when available', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 350 } });
      }
      if (recordType === 'Distance') {
        return Promise.resolve({ DISTANCE: { inMeters: 5000 } });
      }
      return Promise.resolve({});
    });

    const result = await enrichExerciseSessions([makeSession()]);

    expect(result[0]).toMatchObject({
      energy: { inKilocalories: 350 },
      distance: { inMeters: 5000 },
    });
  });

  test('falls back to TotalCaloriesBurned when ActiveCaloriesBurned returns 0 (Android bridge default)', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        // Android bridge defaults missing data to 0.0
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 0 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 380 } });
      }
      if (recordType === 'Distance') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await enrichExerciseSessions([makeSession()]);

    expect(result[0]).toMatchObject({
      energy: { inKilocalories: 380 },
    });
  });

  test('falls back to TotalCaloriesBurned when ActiveCaloriesBurned returns nothing', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({}); // No ACTIVE_CALORIES_TOTAL
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 420 } });
      }
      if (recordType === 'Distance') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await enrichExerciseSessions([makeSession()]);

    expect(result[0]).toMatchObject({
      energy: { inKilocalories: 420 },
    });
  });

  test('falls back to TotalCaloriesBurned when ActiveCaloriesBurned rejects', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.reject(new Error('Permission denied'));
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 200 } });
      }
      if (recordType === 'Distance') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const result = await enrichExerciseSessions([makeSession()]);

    expect(result[0]).toMatchObject({
      energy: { inKilocalories: 200 },
    });
  });

  test('leaves record untouched when both calorie aggregates return 0', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 0 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 0 } });
      }
      if (recordType === 'Distance') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const session = makeSession();
    const result = await enrichExerciseSessions([session]);

    expect(result[0]).toEqual(session);
  });

  test('leaves record untouched when both calorie sources return nothing', async () => {
    mockAggregateRecord.mockResolvedValue({});

    const session = makeSession();
    const result = await enrichExerciseSessions([session]);

    expect(result[0]).toEqual(session);
  });

  test('leaves record untouched when all aggregate calls fail', async () => {
    mockAggregateRecord.mockRejectedValue(new Error('Permission denied'));

    const session = makeSession();
    const result = await enrichExerciseSessions([session]);

    expect(result[0]).toEqual(session);
  });

  test('skips records without startTime or endTime', async () => {
    const incompleteSession = { metadata: { dataOrigin: 'com.fitbit' } };

    const result = await enrichExerciseSessions([incompleteSession]);

    expect(result[0]).toEqual(incompleteSession);
    expect(mockAggregateRecord).not.toHaveBeenCalled();
  });

  test('does not enrich records with invalid time ranges', async () => {
    const invalidSession = makeSession({
      startTime: '2024-01-15T11:00:00Z',
      endTime: '2024-01-15T10:00:00Z',
    });

    const result = await enrichExerciseSessions([invalidSession]);

    expect(result[0]).toEqual(invalidSession);
    expect(mockAggregateRecord).not.toHaveBeenCalled();
  });

  test('issues all three aggregates in parallel with the same dataOriginFilter', async () => {
    mockAggregateRecord.mockResolvedValue({});

    await enrichExerciseSessions([makeSession({ metadata: { dataOrigin: 'com.ohealth' } })]);

    const recordTypes = mockAggregateRecord.mock.calls.map((c: unknown[]) => (c[0] as { recordType: string }).recordType);
    expect(recordTypes).toHaveLength(3);
    expect(recordTypes).toEqual(expect.arrayContaining(['ActiveCaloriesBurned', 'TotalCaloriesBurned', 'Distance']));
    for (const call of mockAggregateRecord.mock.calls) {
      expect(call[0].dataOriginFilter).toEqual(['com.ohealth']);
    }
  });

  test('prefers TotalCaloriesBurned when ActiveCaloriesBurned is a tiny passive fragment (issue #1296: 41-min walk)', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 43.5 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 265 } });
      }
      return Promise.resolve({});
    });

    // 41-minute walk
    const result = await enrichExerciseSessions([
      makeSession({ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:41:00Z' }),
    ]);

    expect((result[0] as { energy: { inKilocalories: number } }).energy).toEqual({ inKilocalories: 265 });
  });

  test('prefers TotalCaloriesBurned when ActiveCaloriesBurned is near-zero passive noise (issue #1296: indoor bike)', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 2.4 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 314 } });
      }
      return Promise.resolve({});
    });

    // 35-minute indoor bike
    const result = await enrichExerciseSessions([
      makeSession({ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:35:00Z' }),
    ]);

    expect((result[0] as { energy: { inKilocalories: number } }).energy).toEqual({ inKilocalories: 314 });
  });

  test('keeps ActiveCaloriesBurned when its ratio to TotalCaloriesBurned is high (issue #593: Garmin BMR exclusion)', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 337 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 385 } });
      }
      return Promise.resolve({});
    });

    const result = await enrichExerciseSessions([makeSession()]);

    expect((result[0] as { energy: { inKilocalories: number } }).energy).toEqual({ inKilocalories: 337 });
  });

  test('keeps ActiveCaloriesBurned at the exact ratio=0.5 boundary', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 200 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 400 } });
      }
      return Promise.resolve({});
    });

    const result = await enrichExerciseSessions([makeSession()]);

    expect((result[0] as { energy: { inKilocalories: number } }).energy).toEqual({ inKilocalories: 200 });
  });

  test('keeps ActiveCaloriesBurned when delta is plausible BMR for the duration even if ratio is below 0.5', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 100 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 180 } });
      }
      return Promise.resolve({});
    });

    // 60-minute session: cap = 120, delta = 80 → passes OR-clause
    const result = await enrichExerciseSessions([
      makeSession({ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z' }),
    ]);

    expect((result[0] as { energy: { inKilocalories: number } }).energy).toEqual({ inKilocalories: 100 });
  });

  test('falls back to TotalCaloriesBurned when delta exceeds plausible BMR for the duration', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 20 } });
      }
      if (recordType === 'TotalCaloriesBurned') {
        return Promise.resolve({ ENERGY_TOTAL: { inKilocalories: 300 } });
      }
      return Promise.resolve({});
    });

    // 35-minute session: cap = 70, delta = 280 → fails OR-clause; ratio = 0.067 → fails
    const result = await enrichExerciseSessions([
      makeSession({ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:35:00Z' }),
    ]);

    expect((result[0] as { energy: { inKilocalories: number } }).energy).toEqual({ inKilocalories: 300 });
  });

  test('drops fabricated distance for long sessions with implausibly small aggregate (issue #1296)', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'Distance') {
        return Promise.resolve({ DISTANCE: { inMeters: 51 } });
      }
      return Promise.resolve({});
    });

    // 35-minute session, 51 m aggregate distance (HealthSync indoor bike contamination)
    const result = await enrichExerciseSessions([
      makeSession({ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:35:00Z' }),
    ]);

    expect('distance' in (result[0] as Record<string, unknown>)).toBe(false);
  });

  test('keeps short-session distances near the floor', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'Distance') {
        return Promise.resolve({ DISTANCE: { inMeters: 90 } });
      }
      return Promise.resolve({});
    });

    // 5-minute session, 90 m: short enough that the plausibility floor doesn't apply
    const result = await enrichExerciseSessions([
      makeSession({ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:05:00Z' }),
    ]);

    expect((result[0] as { distance: { inMeters: number } }).distance).toEqual({ inMeters: 90 });
  });
});
