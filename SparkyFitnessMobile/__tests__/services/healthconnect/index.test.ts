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
  alignToLocalDayStart,
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
  aggregateGroupByDuration,
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
const mockAggregateGroupByDuration = aggregateGroupByDuration as jest.Mock;
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

// The runtime timezone's UTC offset at a given instant, in minutes. Offset
// fixtures are derived relative to this so the fast/slow path split is the
// same on every CI machine's zone.
const deviceOffsetMinutesAt = (instant: Date): number => -instant.getTimezoneOffset();

// A probe record carrying a start-paired zone offset, as the aggregation
// offset probes read them.
const probeRecord = (start: Date, offsetMinutes?: number) => ({
  startTime: start.toISOString(),
  endTime: start.toISOString(),
  ...(offsetMinutes != null
    ? { startZoneOffset: { totalSeconds: offsetMinutes * 60 } }
    : {}),
});

// A probe record that carries no zone offset — keeps aggregation tests on
// the device-zone (aggregateGroupByPeriod) path without attaching an offset,
// mirroring sources that omit zone metadata.
const offsetlessProbeResult = () => ({
  records: [probeRecord(new Date(2024, 0, 15, 12, 0, 0, 0))],
});

// Serves the offset probes (first/last/binary-search reads) from a fixed
// record timeline, honoring the requested window, ordering, and pageSize:1.
const mockProbeTimeline = (records: { start: Date; offsetMinutes: number }[]) => {
  mockReadRecords.mockImplementation(
    (
      _recordType: string,
      options: {
        timeRangeFilter: { startTime: string; endTime: string };
        ascendingOrder?: boolean;
      },
    ) => {
      const startMs = new Date(options.timeRangeFilter.startTime).getTime();
      const endMs = new Date(options.timeRangeFilter.endTime).getTime();
      const inRange = records
        .filter((r) => r.start.getTime() >= startMs && r.start.getTime() <= endMs)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      const ordered = options.ascendingOrder === false ? inRange.reverse() : inRange;
      return Promise.resolve({
        records: ordered.slice(0, 1).map((r) => probeRecord(r.start, r.offsetMinutes)),
      });
    },
  );
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Instant (epoch ms) of the given local calendar date's midnight interpreted
// at a fixed UTC offset — mirrors the production instantAtOffset arithmetic.
const midnightAtOffset = (
  y: number,
  m1to12: number,
  d: number,
  offsetMinutes: number,
): number => Date.UTC(y, m1to12 - 1, d) - offsetMinutes * 60_000;

// An aggregateGroupByDuration bucket whose startTime is an Instant ISO
// string, as the bridge serializes them.
const durationBucket = (startMs: number, result: unknown) => ({
  result,
  startTime: new Date(startMs).toISOString(),
  endTime: new Date(startMs + DAY_MS).toISOString(),
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
    // Default: the offset probe finds a record without zone metadata, so
    // aggregation stays on the device-zone path with no offset attached.
    mockReadRecords.mockResolvedValue(offsetlessProbeResult());
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

  test('attaches the probed offset to every day when it matches the device zone', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 3000 }),
      periodBucket(2024, 1, 16, { COUNT_TOTAL: 3500 }),
    ]);
    const probeInstant = new Date(2024, 0, 15, 12, 0, 0, 0);
    const deviceOffset = deviceOffsetMinutesAt(probeInstant);
    mockReadRecords.mockResolvedValue({
      records: [probeRecord(probeInstant, deviceOffset)],
    });

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 16),
    );

    expect(result.every((r) => r.record_utc_offset_minutes === deviceOffset)).toBe(true);
    // Stationary syncs must stay at a single pageSize:1 probe read for the
    // whole range — per-day reads are what blew the quota in the first place.
    expect(mockReadRecords).toHaveBeenCalledTimes(1);
    expect(mockReadRecords.mock.calls[0][1]).toMatchObject({ pageSize: 1 });
  });

  test('omits offset when the probe record carries no zone offset', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 3000 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result[0]).not.toHaveProperty('record_utc_offset_minutes');
  });

  test('returns empty without calling the native aggregate when the range has no records', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([]);
    expect(mockAggregateGroupByPeriod).not.toHaveBeenCalled();
    expect(mockAggregateGroupByDuration).not.toHaveBeenCalled();
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

  test('queries HC with the caller-aligned start when sync callers pre-snap to local midnight', async () => {
    // Uploads emit date-only rows. Since HC anchors DAYS buckets at the supplied
    // startTime, cumulative sync callers must snap the start to a calendar-day
    // boundary via alignToLocalDayStart before calling the aggregator.
    mockAggregateGroupByPeriod.mockResolvedValue([]);

    const rollingStart = new Date(2024, 0, 15, 14, 30, 0, 0);
    const now = new Date(2024, 0, 16, 14, 30, 0, 0);

    await getAggregatedStepsByDateDetailed(alignToLocalDayStart(rollingStart), now);

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

describe('cumulative aggregation timezone-change attribution (#1712)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAggregateGroupByPeriod.mockResolvedValue([]);
    mockAggregateGroupByDuration.mockResolvedValue([]);
  });

  test('buckets a post-travel window at the records\' own midnights (regression for #1712)', async () => {
    // Every record still carries the pre-move zone's offset (device already
    // moved): day windows must anchor at the old zone's midnights, not the
    // device zone's — otherwise up to a week of records re-bin across the
    // new midnights and day totals drift.
    const off0 = deviceOffsetMinutesAt(new Date(2024, 0, 15, 6, 0, 0, 0)) + 420;
    mockProbeTimeline([
      { start: new Date(2024, 0, 15, 6, 0, 0, 0), offsetMinutes: off0 },
      { start: new Date(2024, 0, 16, 20, 0, 0, 0), offsetMinutes: off0 },
    ]);
    const anchor = midnightAtOffset(2024, 1, 15, off0);
    mockAggregateGroupByDuration.mockResolvedValue([
      durationBucket(anchor, { COUNT_TOTAL: 5000 }),
      durationBucket(anchor + DAY_MS, { COUNT_TOTAL: 6000 }),
      // Partial tail past the window's last label: records the source
      // stamped into the old zone's next day — dropped, the next sync's
      // window owns that day.
      durationBucket(anchor + 2 * DAY_MS, { COUNT_TOTAL: 300 }),
    ]);

    const endDate = localEndOfDay(2024, 1, 16);
    const result = await getAggregatedStepsByDate(localMidnight(2024, 1, 15), endDate);

    expect(result).toEqual([
      { date: '2024-01-15', value: 5000, type: 'step', record_utc_offset_minutes: off0 },
      { date: '2024-01-16', value: 6000, type: 'step', record_utc_offset_minutes: off0 },
    ]);
    expect(mockAggregateGroupByPeriod).not.toHaveBeenCalled();
    expect(mockAggregateGroupByDuration).toHaveBeenCalledTimes(1);
    const call = mockAggregateGroupByDuration.mock.calls[0][0];
    expect(call.timeRangeFilter.startTime).toBe(new Date(anchor).toISOString());
    expect(call.timeRangeFilter.endTime).toBe(endDate.toISOString());
    expect(call.timeRangeSlicer).toEqual({ duration: 'DAYS', length: 1 });
    // No dataOriginFilter — that would defeat HC's native cross-origin dedup.
    expect(call).not.toHaveProperty('dataOriginFilter');
    // Two pageSize:1 probes (first + last record), no per-day reads.
    expect(mockReadRecords).toHaveBeenCalledTimes(2);
  });

  test('splits a mid-window transition into two contiguous offset segments and folds the westward sliver', async () => {
    const off1 = deviceOffsetMinutesAt(new Date(2024, 0, 18, 20, 0, 0, 0));
    const off0 = off1 + 420;
    mockProbeTimeline([
      { start: new Date(2024, 0, 15, 6, 0, 0, 0), offsetMinutes: off0 },
      { start: new Date(2024, 0, 16, 4, 0, 0, 0), offsetMinutes: off0 },
      { start: new Date(2024, 0, 16, 14, 0, 0, 0), offsetMinutes: off1 },
      { start: new Date(2024, 0, 17, 10, 0, 0, 0), offsetMinutes: off1 },
      { start: new Date(2024, 0, 18, 20, 0, 0, 0), offsetMinutes: off1 },
    ]);
    const anchor = midnightAtOffset(2024, 1, 15, off0);
    const boundary = midnightAtOffset(2024, 1, 17, off1);
    mockAggregateGroupByDuration
      .mockResolvedValueOnce([
        durationBucket(anchor, { COUNT_TOTAL: 5000 }),
        durationBucket(anchor + DAY_MS, { COUNT_TOTAL: 6000 }),
        // 7h sliver between the old grid's end and the new boundary: the
        // extended evening of the day before the switch — folds into it.
        durationBucket(anchor + 2 * DAY_MS, { COUNT_TOTAL: 700 }),
      ])
      .mockResolvedValueOnce([
        durationBucket(boundary, { COUNT_TOTAL: 8000 }),
        durationBucket(boundary + DAY_MS, { COUNT_TOTAL: 900 }),
      ]);

    const endDate = localEndOfDay(2024, 1, 18);
    const result = await getAggregatedStepsByDate(localMidnight(2024, 1, 15), endDate);

    expect(result).toEqual([
      { date: '2024-01-15', value: 5000, type: 'step', record_utc_offset_minutes: off0 },
      { date: '2024-01-16', value: 6700, type: 'step', record_utc_offset_minutes: off0 },
      { date: '2024-01-17', value: 8000, type: 'step', record_utc_offset_minutes: off1 },
      { date: '2024-01-18', value: 900, type: 'step', record_utc_offset_minutes: off1 },
    ]);
    expect(mockAggregateGroupByPeriod).not.toHaveBeenCalled();
    expect(mockAggregateGroupByDuration).toHaveBeenCalledTimes(2);
    const [first, second] = mockAggregateGroupByDuration.mock.calls.map((c) => c[0]);
    // Segments must be contiguous at the switch day's new-zone midnight —
    // a gap loses records, an overlap double-counts them.
    expect(first.timeRangeFilter.startTime).toBe(new Date(anchor).toISOString());
    expect(first.timeRangeFilter.endTime).toBe(new Date(boundary).toISOString());
    expect(second.timeRangeFilter.startTime).toBe(new Date(boundary).toISOString());
    expect(second.timeRangeFilter.endTime).toBe(endDate.toISOString());
    // 2 edge probes + 2 binary-search probes for a 4-day window.
    expect(mockReadRecords).toHaveBeenCalledTimes(4);
  });

  test('keeps the whole window on the old anchor when the transition falls after the last midnight', async () => {
    const off1 = deviceOffsetMinutesAt(new Date(2024, 0, 16, 19, 30, 0, 0));
    const off0 = off1 + 420;
    mockProbeTimeline([
      { start: new Date(2024, 0, 15, 6, 0, 0, 0), offsetMinutes: off0 },
      { start: new Date(2024, 0, 16, 12, 0, 0, 0), offsetMinutes: off0 },
      { start: new Date(2024, 0, 16, 19, 30, 0, 0), offsetMinutes: off1 },
    ]);
    const anchor = midnightAtOffset(2024, 1, 15, off0);
    mockAggregateGroupByDuration.mockResolvedValue([
      durationBucket(anchor, { COUNT_TOTAL: 5000 }),
      durationBucket(anchor + DAY_MS, { COUNT_TOTAL: 6000 }),
      durationBucket(anchor + 2 * DAY_MS, { COUNT_TOTAL: 300 }),
    ]);

    const endDate = new Date(2024, 0, 16, 20, 0, 0, 0);
    const result = await getAggregatedStepsByDate(localMidnight(2024, 1, 15), endDate);

    expect(result).toEqual([
      { date: '2024-01-15', value: 5000, type: 'step', record_utc_offset_minutes: off0 },
      { date: '2024-01-16', value: 6000, type: 'step', record_utc_offset_minutes: off0 },
    ]);
    expect(mockAggregateGroupByDuration).toHaveBeenCalledTimes(1);
    const call = mockAggregateGroupByDuration.mock.calls[0][0];
    expect(call.timeRangeFilter.startTime).toBe(new Date(anchor).toISOString());
    expect(call.timeRangeFilter.endTime).toBe(endDate.toISOString());
  });

  test('falls back to device-zone buckets when offsets diverge without ending in the device zone', async () => {
    // A UTC-stamping exporter alongside correctly-stamped records looks like
    // a transition but isn't travel; re-bucketing would scramble a
    // stationary user's days.
    const deviceOffset = deviceOffsetMinutesAt(new Date(2024, 0, 16, 12, 0, 0, 0));
    mockProbeTimeline([
      { start: new Date(2024, 0, 15, 6, 0, 0, 0), offsetMinutes: deviceOffset + 420 },
      { start: new Date(2024, 0, 16, 12, 0, 0, 0), offsetMinutes: deviceOffset + 120 },
    ]);
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 4000 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 16),
    );

    expect(result).toEqual([
      {
        date: '2024-01-15',
        value: 4000,
        type: 'step',
        record_utc_offset_minutes: deviceOffset + 420,
      },
    ]);
    expect(mockAggregateGroupByDuration).not.toHaveBeenCalled();
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['eastward', -1560],
    ['westward', +1560],
  ])(
    'falls back to device-zone buckets when the offset jump exceeds a day (%s)',
    async (_direction, offsetDelta) => {
      // A ≥24h offset jump (dateline hop) degenerates the day-window math in
      // both directions — eastward the segments invert, westward whole
      // misattributed buckets would fold into the pre-switch day. Bail out.
      const off1 = deviceOffsetMinutesAt(new Date(2024, 0, 16, 10, 0, 0, 0));
      const off0 = off1 + offsetDelta;
      mockProbeTimeline([
        { start: new Date(2024, 0, 15, 3, 0, 0, 0), offsetMinutes: off0 },
        { start: new Date(2024, 0, 16, 10, 0, 0, 0), offsetMinutes: off1 },
      ]);
      mockAggregateGroupByPeriod.mockResolvedValue([
        periodBucket(2024, 1, 15, { COUNT_TOTAL: 4000 }),
      ]);

      const result = await getAggregatedStepsByDate(
        localMidnight(2024, 1, 15),
        localEndOfDay(2024, 1, 16),
      );

      expect(result).toHaveLength(1);
      expect(mockAggregateGroupByDuration).not.toHaveBeenCalled();
      expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
    },
  );

  test('keeps device-zone buckets without an offset when the probe read fails', async () => {
    mockReadRecords.mockRejectedValue(new Error('probe failed'));
    mockAggregateGroupByPeriod.mockResolvedValue([
      periodBucket(2024, 1, 15, { COUNT_TOTAL: 4200 }),
    ]);

    const result = await getAggregatedStepsByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([{ date: '2024-01-15', value: 4200, type: 'step' }]);
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
  });
});

describe('alignToLocalDayStart', () => {
  test('returns a new Date rounded down to local midnight', () => {
    const input = new Date(2024, 0, 15, 14, 30, 45, 123);
    const aligned = alignToLocalDayStart(input);

    expect(aligned).not.toBe(input);
    expect(aligned.getHours()).toBe(0);
    expect(aligned.getMinutes()).toBe(0);
    expect(aligned.getSeconds()).toBe(0);
    expect(aligned.getMilliseconds()).toBe(0);
    expect(aligned.getFullYear()).toBe(2024);
    expect(aligned.getMonth()).toBe(0);
    expect(aligned.getDate()).toBe(15);
    // Source date is untouched.
    expect(input.getHours()).toBe(14);
  });
});

describe('getAggregatedActiveCaloriesByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadRecords.mockResolvedValue(offsetlessProbeResult());
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
