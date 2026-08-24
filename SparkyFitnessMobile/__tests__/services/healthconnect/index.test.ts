import {
  initHealthConnect,
  requestHealthPermissions,
  ensureHistoryReadPermission,
  getSyncStartDate,
  readHealthRecords,
  readHealthRecordsDetailed,
  readEarliestRecordDetailed,
  isQuotaExceededError,
  getAggregatedStepsByDate,
  getAggregatedStepsByDateDetailed,
  getAggregatedActiveCaloriesByDate,
  getAggregatedActiveCaloriesByDateDetailed,
  enrichExerciseSessions,
  alignToLocalDayStart,
  sessionCacheKey,
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
  getGrantedPermissions,
  readRecords,
  aggregateRecord,
  aggregateGroupByDuration,
  aggregateGroupByPeriod,
} from 'react-native-health-connect';

import type { PermissionRequest, GrantedPermission } from '../../../src/types/healthRecords';
import type { SyncDuration } from '../../../src/services/healthconnect/preferences';
import {
  createTelemetryRunContext,
  type TelemetryRunContext,
} from '../../../src/services/shared/telemetryBudget';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
const mockGetGrantedPermissions = getGrantedPermissions as jest.Mock;
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

  test('preserves the rolling start but queries through local midnight for display callers', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([]);

    const rollingStart = new Date(2024, 0, 15, 14, 30, 0, 0);
    const now = new Date(2024, 0, 16, 14, 30, 0, 0);
    const nextLocalMidnight = new Date(2024, 0, 17, 0, 0, 0, 0);

    await getAggregatedStepsByDateDetailed(rollingStart, now);

    const call = mockAggregateGroupByPeriod.mock.calls[0][0];
    expect(call.timeRangeFilter.startTime).toBe(rollingStart.toISOString());
    expect(call.timeRangeFilter.endTime).toBe(nextLocalMidnight.toISOString());
  });

  test('does not push an end time already at local midnight into the next day', async () => {
    mockAggregateGroupByPeriod.mockResolvedValue([]);

    const start = new Date(2024, 0, 15, 0, 0, 0, 0);
    const endAtLocalMidnight = new Date(2024, 0, 17, 0, 0, 0, 0);

    await getAggregatedStepsByDateDetailed(start, endAtLocalMidnight);

    const call = mockAggregateGroupByPeriod.mock.calls[0][0];
    expect(call.timeRangeFilter.endTime).toBe(endAtLocalMidnight.toISOString());
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
    expect(call.timeRangeFilter.endTime).toBe(
      new Date(2024, 0, 17, 0, 0, 0, 0).toISOString(),
    );
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
    const queryEndDate = localMidnight(2024, 1, 17);
    const result = await getAggregatedStepsByDate(localMidnight(2024, 1, 15), endDate);

    expect(result).toEqual([
      { date: '2024-01-15', value: 5000, type: 'step', record_utc_offset_minutes: off0 },
      { date: '2024-01-16', value: 6000, type: 'step', record_utc_offset_minutes: off0 },
    ]);
    expect(mockAggregateGroupByPeriod).not.toHaveBeenCalled();
    expect(mockAggregateGroupByDuration).toHaveBeenCalledTimes(1);
    const call = mockAggregateGroupByDuration.mock.calls[0][0];
    expect(call.timeRangeFilter.startTime).toBe(new Date(anchor).toISOString());
    expect(call.timeRangeFilter.endTime).toBe(queryEndDate.toISOString());
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
    const queryEndDate = localMidnight(2024, 1, 19);
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
    expect(second.timeRangeFilter.endTime).toBe(queryEndDate.toISOString());
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
    const queryEndDate = localMidnight(2024, 1, 17);
    const result = await getAggregatedStepsByDate(localMidnight(2024, 1, 15), endDate);

    expect(result).toEqual([
      { date: '2024-01-15', value: 5000, type: 'step', record_utc_offset_minutes: off0 },
      { date: '2024-01-16', value: 6000, type: 'step', record_utc_offset_minutes: off0 },
    ]);
    expect(mockAggregateGroupByDuration).toHaveBeenCalledTimes(1);
    const call = mockAggregateGroupByDuration.mock.calls[0][0];
    expect(call.timeRangeFilter.startTime).toBe(new Date(anchor).toISOString());
    expect(call.timeRangeFilter.endTime).toBe(queryEndDate.toISOString());
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

  test('derives active calories from total minus basal when active is absent', async () => {
    mockAggregateGroupByPeriod.mockImplementation(
      ({ recordType }: { recordType: string }) => {
        if (recordType === 'TotalCaloriesBurned') {
          return Promise.resolve([
            periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 2400 } }),
          ]);
        }
        if (recordType === 'BasalMetabolicRate') {
          return Promise.resolve([
            periodBucket(2024, 1, 15, { BASAL_CALORIES_TOTAL: { inKilocalories: 1750 } }),
          ]);
        }
        return Promise.resolve([]);
      },
    );

    const result = await getAggregatedActiveCaloriesByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result).toEqual([
      { date: '2024-01-15', value: 650, type: 'active_calories' },
    ]);
  });

  test('does not replace a reported active-calorie aggregate', async () => {
    mockAggregateGroupByPeriod.mockImplementation(
      ({ recordType }: { recordType: string }) => recordType === 'ActiveCaloriesBurned'
        ? Promise.resolve([
            periodBucket(2024, 1, 15, { ACTIVE_CALORIES_TOTAL: { inKilocalories: 525 } }),
          ])
        : Promise.resolve([]),
    );

    const result = await getAggregatedActiveCaloriesByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result[0].value).toBe(525);
    expect(result).toHaveLength(1);
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
  });

  test('does not derive missing dates when the active aggregate has any records', async () => {
    mockAggregateGroupByPeriod.mockImplementation(
      ({ recordType }: { recordType: string }) => recordType === 'ActiveCaloriesBurned'
        ? Promise.resolve([
            periodBucket(2024, 1, 15, { ACTIVE_CALORIES_TOTAL: { inKilocalories: 525 } }),
          ])
        : Promise.resolve([
            periodBucket(2024, 1, 16, { ENERGY_TOTAL: { inKilocalories: 2400 } }),
          ]),
    );

    const result = await getAggregatedActiveCaloriesByDate(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 16),
    );

    expect(result).toEqual([
      { date: '2024-01-15', value: 525, type: 'active_calories' },
    ]);
    expect(mockAggregateGroupByPeriod).toHaveBeenCalledTimes(1);
  });

  test('propagates an active-read error even when fallback rows are derived', async () => {
    mockAggregateGroupByPeriod.mockImplementation(
      ({ recordType }: { recordType: string }) => {
        if (recordType === 'ActiveCaloriesBurned') {
          return Promise.reject(new Error('Active permission denied'));
        }
        if (recordType === 'TotalCaloriesBurned') {
          return Promise.resolve([
            periodBucket(2024, 1, 15, { ENERGY_TOTAL: { inKilocalories: 2400 } }),
          ]);
        }
        return Promise.resolve([
          periodBucket(2024, 1, 15, { BASAL_CALORIES_TOTAL: { inKilocalories: 1750 } }),
        ]);
      },
    );

    const result = await getAggregatedActiveCaloriesByDateDetailed(
      localMidnight(2024, 1, 15),
      localEndOfDay(2024, 1, 15),
    );

    expect(result.records).toEqual([
      { date: '2024-01-15', value: 650, type: 'active_calories' },
    ]);
    expect(result.error).toContain('Active permission denied');
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
    const result = await enrichExerciseSessions([], createTelemetryRunContext());
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

    const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

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

    const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

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

    const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

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

    const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

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
    const result = await enrichExerciseSessions([session], createTelemetryRunContext());

    expect(result[0]).toEqual(session);
  });

  test('leaves record untouched when both calorie sources return nothing', async () => {
    mockAggregateRecord.mockResolvedValue({});

    const session = makeSession();
    const result = await enrichExerciseSessions([session], createTelemetryRunContext());

    expect(result[0]).toEqual(session);
  });

  test('leaves record untouched when all aggregate calls fail', async () => {
    mockAggregateRecord.mockRejectedValue(new Error('Permission denied'));

    const session = makeSession();
    const result = await enrichExerciseSessions([session], createTelemetryRunContext());

    expect(result[0]).toEqual(session);
  });

  test('skips records without startTime or endTime', async () => {
    const incompleteSession = { metadata: { dataOrigin: 'com.fitbit' } };

    const result = await enrichExerciseSessions([incompleteSession], createTelemetryRunContext());

    expect(result[0]).toEqual(incompleteSession);
    expect(mockAggregateRecord).not.toHaveBeenCalled();
  });

  test('does not enrich records with invalid time ranges', async () => {
    const invalidSession = makeSession({
      startTime: '2024-01-15T11:00:00Z',
      endTime: '2024-01-15T10:00:00Z',
    });

    const result = await enrichExerciseSessions([invalidSession], createTelemetryRunContext());

    expect(result[0]).toEqual(invalidSession);
    expect(mockAggregateRecord).not.toHaveBeenCalled();
  });

  test('issues all three aggregates in parallel with the same dataOriginFilter', async () => {
    mockAggregateRecord.mockResolvedValue({});

    await enrichExerciseSessions([makeSession({ metadata: { dataOrigin: 'com.ohealth' } })], createTelemetryRunContext());

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
    ], createTelemetryRunContext());

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
    ], createTelemetryRunContext());

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

    const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

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

    const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

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
    ], createTelemetryRunContext());

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
    ], createTelemetryRunContext());

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
    ], createTelemetryRunContext());

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
    ], createTelemetryRunContext());

    expect((result[0] as { distance: { inMeters: number } }).distance).toEqual({ inMeters: 90 });
  });

  describe('telemetry (gps_points/hr_samples/laps/telemetry)', () => {
    beforeEach(() => {
      // jest.clearAllMocks() (outer beforeEach) clears call history but NOT
      // mockImplementation — an earlier test's readRecords/aggregateRecord
      // implementation otherwise leaks into whichever test runs next.
      mockReadRecords.mockResolvedValue({ records: [] });
      mockAggregateRecord.mockResolvedValue({});
    });

    test('attaches hr_samples and derived summary telemetry when HeartRate records exist in the session window', async () => {
      mockReadRecords.mockImplementation((recordType: string) => {
        if (recordType === 'HeartRate') {
          return Promise.resolve({
            records: [
              {
                startTime: '2024-01-15T10:00:00Z',
                endTime: '2024-01-15T11:00:00Z',
                samples: [
                  { time: '2024-01-15T10:10:00Z', beatsPerMinute: 100 },
                  { time: '2024-01-15T10:20:00Z', beatsPerMinute: 140 },
                ],
              },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

      const enriched = result[0] as Record<string, unknown>;
      expect(enriched.hr_samples).toEqual([
        { t: '2024-01-15T10:10:00Z', bpm: 100 },
        { t: '2024-01-15T10:20:00Z', bpm: 140 },
      ]);
      expect(
        (enriched.telemetry as { avg_heart_rate?: number })?.avg_heart_rate
      ).toBe(120);
      expect(
        (enriched.telemetry as { max_heart_rate?: number })?.max_heart_rate
      ).toBe(140);
    });

    test('merges the already-computed calorie aggregate into telemetry.active_calories', async () => {
      mockAggregateRecord.mockImplementation(
        ({ recordType }: { recordType: string }) => {
          if (recordType === 'ActiveCaloriesBurned') {
            return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 220 } });
          }
          return Promise.resolve({});
        }
      );
      mockReadRecords.mockImplementation((recordType: string) => {
        if (recordType === 'HeartRate') {
          return Promise.resolve({
            records: [
              {
                samples: [{ time: '2024-01-15T10:10:00Z', beatsPerMinute: 100 }],
              },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

      expect(
        (result[0] as { telemetry: { active_calories?: number } }).telemetry
          .active_calories
      ).toBe(220);
    });

    test('attaches laps built from session.laps', async () => {
      const result = await enrichExerciseSessions([
        makeSession({
          laps: [
            { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:30:00Z' },
            { startTime: '2024-01-15T10:30:00Z', endTime: '2024-01-15T11:00:00Z' },
          ],
        }),
      ], createTelemetryRunContext());

      expect(result[0]).toMatchObject({
        laps: [
          { start_time: '2024-01-15T10:00:00Z', end_time: '2024-01-15T10:30:00Z', lap_index: 1 },
          { start_time: '2024-01-15T10:30:00Z', end_time: '2024-01-15T11:00:00Z', lap_index: 2 },
        ],
      });
    });

    test('a session with no telemetry data attaches no telemetry fields at all', async () => {
      // readRecords/aggregateRecord default to empty via jest.setup.js — this
      // is the "nothing to enrich" baseline every other case in this describe
      // block is a variation of.
      const result = await enrichExerciseSessions([makeSession()], createTelemetryRunContext());

      const enriched = result[0] as Record<string, unknown>;
      expect(enriched.gps_points).toBeUndefined();
      expect(enriched.hr_samples).toBeUndefined();
      expect(enriched.laps).toBeUndefined();
      expect(enriched.telemetry).toBeUndefined();
    });

    test('an exhausted telemetry budget skips telemetry collection entirely, leaving calories/distance untouched', async () => {
      mockAggregateRecord.mockImplementation(
        ({ recordType }: { recordType: string }) => {
          if (recordType === 'ActiveCaloriesBurned') {
            return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 300 } });
          }
          return Promise.resolve({});
        }
      );
      mockReadRecords.mockImplementation((recordType: string) => {
        if (recordType === 'HeartRate') {
          return Promise.resolve({
            records: [
              { samples: [{ time: '2024-01-15T10:10:00Z', beatsPerMinute: 100 }] },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });
      const result = await enrichExerciseSessions(
        [makeSession()],
        createTelemetryRunContext({ budget: 0 })
      );

      const enriched = result[0] as Record<string, unknown>;
      // Calorie/distance enrichment happens before the budget gate and must
      // still land even when the budget is exhausted.
      expect(enriched.energy).toEqual({ inKilocalories: 300 });
      expect(enriched.hr_samples).toBeUndefined();
      expect(enriched.telemetry).toBeUndefined();
    });

    test('a partial budget goes to the newest sessions, not read-completion order', async () => {
      mockReadRecords.mockImplementation((recordType: string) => {
        if (recordType === 'HeartRate') {
          return Promise.resolve({
            records: [
              { samples: [{ time: '2024-01-15T10:10:00Z', beatsPerMinute: 100 }] },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      const older = makeSession({
        startTime: '2024-01-14T10:00:00Z',
        endTime: '2024-01-14T11:00:00Z',
      });
      const newer = makeSession();

      // Oldest first in the input — the slot must still go to the newer one.
      const result = await enrichExerciseSessions(
        [older, newer],
        createTelemetryRunContext({ budget: 1 })
      );

      const enrichedOlder = result[0] as Record<string, unknown>;
      const enrichedNewer = result[1] as Record<string, unknown>;
      expect(enrichedOlder.hr_samples).toBeUndefined();
      expect(enrichedNewer.hr_samples).toBeDefined();
    });

    test('an invalid session window does not consume a budget slot', async () => {
      mockReadRecords.mockImplementation((recordType: string) => {
        if (recordType === 'HeartRate') {
          return Promise.resolve({
            records: [
              { samples: [{ time: '2024-01-15T10:10:00Z', beatsPerMinute: 100 }] },
            ],
          });
        }
        return Promise.resolve({ records: [] });
      });

      // Newest by startTime, but its window is inverted — the enrichment loop
      // rejects it, so it must not have claimed the only slot first.
      const invalid = makeSession({
        startTime: '2024-01-16T10:00:00Z',
        endTime: '2024-01-16T09:00:00Z',
      });
      const valid = makeSession();

      const result = await enrichExerciseSessions(
        [invalid, valid],
        createTelemetryRunContext({ budget: 1 })
      );

      const enrichedInvalid = result[0] as Record<string, unknown>;
      const enrichedValid = result[1] as Record<string, unknown>;
      expect(enrichedInvalid.hr_samples).toBeUndefined();
      expect(enrichedValid.hr_samples).toBeDefined();
    });
  });
});

describe('readEarliestRecordDetailed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('issues a single ascending pageSize-1 read from the 1970 epoch', async () => {
    mockReadRecords.mockResolvedValue({ records: [{ startTime: '2019-03-04T08:00:00Z' }] });

    const result = await readEarliestRecordDetailed('Steps');

    expect(mockReadRecords).toHaveBeenCalledTimes(1);
    const [recordType, options] = mockReadRecords.mock.calls[0];
    expect(recordType).toBe('Steps');
    expect(options.pageSize).toBe(1);
    expect(options.ascendingOrder).toBe(true);
    expect(options.timeRangeFilter.operator).toBe('between');
    expect(options.timeRangeFilter.startTime).toBe('1970-01-01T00:00:00.000Z');
    expect(result).toEqual({ records: [{ startTime: '2019-03-04T08:00:00Z' }] });
  });

  test('maps an instantaneous record time onto startTime', async () => {
    mockReadRecords.mockResolvedValue({ records: [{ time: '2020-06-01T07:30:00Z' }] });

    const result = await readEarliestRecordDetailed('Weight');

    expect(result).toEqual({ records: [{ startTime: '2020-06-01T07:30:00Z' }] });
  });

  test('returns an empty result (no error) when no records exist', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    const result = await readEarliestRecordDetailed('Steps');

    expect(result).toEqual({ records: [] });
  });

  test('surfaces failures as an error envelope with the quota string intact', async () => {
    mockReadRecords.mockRejectedValue(new Error('API call quota exceeded'));

    const result = await readEarliestRecordDetailed('HeartRate');

    expect(result.records).toEqual([]);
    expect(result.error).toBe('API call quota exceeded');
    expect(isQuotaExceededError(result.error)).toBe(true);
  });
});

describe('ensureHistoryReadPermission', () => {
  const historyGrant = { accessType: 'read', recordType: 'ReadHealthDataHistory' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true without a request when already granted', async () => {
    mockGetGrantedPermissions.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      historyGrant,
    ]);

    await expect(ensureHistoryReadPermission()).resolves.toBe(true);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  test('requests the permission and returns true on a fresh grant', async () => {
    mockGetGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    mockRequestPermission.mockResolvedValue([historyGrant]);

    await expect(ensureHistoryReadPermission()).resolves.toBe(true);
    expect(mockRequestPermission).toHaveBeenCalledWith([historyGrant]);
  });

  test('returns false when the user declines', async () => {
    mockGetGrantedPermissions.mockResolvedValue([]);
    mockRequestPermission.mockResolvedValue([]);

    await expect(ensureHistoryReadPermission()).resolves.toBe(false);
  });

  test('returns false (never throws) when the bridge errors', async () => {
    mockGetGrantedPermissions.mockRejectedValue(new Error('bridge unavailable'));

    await expect(ensureHistoryReadPermission()).resolves.toBe(false);
  });
});

describe('enrichExerciseSessions bounded fan-out and reuse (#2191)', () => {
  const {
    _resetEnrichedSessionCacheForTests,
    markEnrichedSessions,
    hasEnrichedSession,
  } = require('../../../src/services/shared/enrichedSessionCache');

  // Enrichment only stages cache keys on the run context; the sync shell drains
  // and persists them after the server accepts the upload. This stands in for
  // that boundary.
  const enrichAndUpload = async (records: unknown[], ctx: TelemetryRunContext) => {
    const result = await enrichExerciseSessions(records, ctx);
    await markEnrichedSessions(ctx.drainCollected());
    return result;
  };

  const session = (id: string, startTime: string) => ({
    startTime,
    endTime: new Date(Date.parse(startTime) + 60 * 60 * 1000).toISOString(),
    metadata: { dataOrigin: 'com.fitbit', id, lastModifiedTime: startTime },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    _resetEnrichedSessionCacheForTests();
    await AsyncStorage.clear();
    mockAggregateRecord.mockResolvedValue({});
    mockReadRecords.mockResolvedValue({ records: [] });
  });

  const trackPeak = (mock: jest.Mock, result: unknown) => {
    const state = { inFlight: 0, peak: 0 };
    mock.mockImplementation(async () => {
      state.inFlight++;
      state.peak = Math.max(state.peak, state.inFlight);
      await new Promise(resolve => setTimeout(resolve, 0));
      state.inFlight--;
      return result;
    });
    return state;
  };

  const tenSessions = () =>
    Array.from({ length: 10 }, (_, i) =>
      session(`s${i}`, `2024-01-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`),
    );

  test('a session whose telemetry read hit the quota is not cached as collected', async () => {
    // A quota or dead-client failure says nothing about whether this session
    // has telemetry — it is the same read failing for everyone. Caching it
    // would be permanent: the cache has no expiry, so the session is re-sent
    // summary-only forever (#2191 follow-up).
    mockReadRecords.mockRejectedValue(new Error('API call quota exceeded'));
    const s1 = session('s1', '2024-01-10T10:00:00.000Z');

    await enrichAndUpload([s1], createTelemetryRunContext());

    expect(await hasEnrichedSession(sessionCacheKey(s1))).toBe(false);
  });

  test('a dead client is treated the same as a quota failure', async () => {
    mockReadRecords.mockRejectedValue(new Error('client is not initialized'));
    const s1 = session('s1', '2024-01-10T10:00:00.000Z');

    await enrichAndUpload([s1], createTelemetryRunContext());

    expect(await hasEnrichedSession(sessionCacheKey(s1))).toBe(false);
  });

  test('a session that genuinely had nothing beyond its summary IS cached', async () => {
    // The reads that established there is nothing are exactly what must not
    // repeat every sync — this is the case the cache exists for.
    mockReadRecords.mockResolvedValue({ records: [] });
    const s1 = session('s1', '2024-01-10T10:00:00.000Z');

    await enrichAndUpload([s1], createTelemetryRunContext());

    expect(await hasEnrichedSession(sessionCacheKey(s1))).toBe(true);
  });

  test('a generic native read failure is not cached as empty telemetry', async () => {
    // Neither proof the series is absent nor a stable authorization result.
    // The default has to be "retry", because caching it is permanent.
    mockReadRecords.mockRejectedValue(new Error('Binder transaction failed'));
    const s1 = session('s1', '2024-01-10T10:00:00.000Z');

    await enrichAndUpload([s1], createTelemetryRunContext());

    expect(await hasEnrichedSession(sessionCacheKey(s1))).toBe(false);
  });

  test('an unavailable record type is a stable answer and still caches', async () => {
    // Distinct from the retryable failures above: "this type is unavailable or
    // unauthorized here" does not change between syncs, so re-reading it every
    // sync is the cost the cache exists to avoid.
    mockReadRecords.mockRejectedValue(new Error('SecurityException: not authorized'));
    const s1 = session('s1', '2024-01-10T10:00:00.000Z');

    await enrichAndUpload([s1], createTelemetryRunContext());

    expect(await hasEnrichedSession(sessionCacheKey(s1))).toBe(true);
  });

  test('the cheap calorie/distance aggregates run at the wider limit', async () => {
    const aggregates = trackPeak(mockAggregateRecord, {});
    trackPeak(mockReadRecords, { records: [] });

    await enrichExerciseSessions(tenSessions(), createTelemetryRunContext());

    // AGGREGATE_CONCURRENCY (6) sessions × 3 scalar aggregates each. The point
    // is that ten sessions do not become thirty concurrent calls.
    expect(aggregates.peak).toBeLessThanOrEqual(18);
  });

  test('telemetry stays capped at two sessions however wide the outer batch runs', async () => {
    trackPeak(mockAggregateRecord, {});
    const telemetryReads = trackPeak(mockReadRecords, { records: [] });

    await enrichExerciseSessions(tenSessions(), createTelemetryRunContext());

    // Only readRecords carries telemetry (route plus up to five sample series).
    // TELEMETRY_CONCURRENCY (2) sessions × 6 parallel reads = 12. Without the
    // limiter the outer batch of 6 would put ~36 in flight — and the original
    // unbounded version put all ten sessions' worth in flight at once, which is
    // what froze the UI in #2191.
    expect(telemetryReads.peak).toBeLessThanOrEqual(12);
  });

  test('preserves input order despite batching', async () => {
    mockAggregateRecord.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 3));
      return {};
    });

    const sessions = Array.from({ length: 6 }, (_, i) =>
      session(`s${i}`, `2024-01-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`),
    );

    const result = await enrichExerciseSessions(sessions, createTelemetryRunContext());

    expect(result.map(r => (r as { metadata: { id: string } }).metadata.id)).toEqual(
      ['s0', 's1', 's2', 's3', 's4', 's5'],
    );
  });

  test('a session collected once is not re-collected on the next run', async () => {
    const sessions = [session('s1', '2024-01-15T10:00:00.000Z')];

    await enrichAndUpload(sessions, createTelemetryRunContext());
    const firstRunReads = mockReadRecords.mock.calls.length;
    expect(firstRunReads).toBeGreaterThan(0);

    mockReadRecords.mockClear();
    await enrichAndUpload(sessions, createTelemetryRunContext());

    expect(mockReadRecords).not.toHaveBeenCalled();
  });

  test('a cached session does not consume a budget slot, so the next one still gets it', async () => {
    const cached = session('cached', '2024-01-16T10:00:00.000Z');
    const fresh = session('fresh', '2024-01-15T10:00:00.000Z');

    // Prime the cache with the newer session only.
    await enrichAndUpload([cached], createTelemetryRunContext());
    mockReadRecords.mockClear();

    // Budget of exactly 1: without the skip, the newest-first claim would spend
    // it on the already-collected session and the fresh one would get nothing.
    await enrichAndUpload(
      [cached, fresh],
      createTelemetryRunContext({ budget: 1 }),
    );

    const windows = mockReadRecords.mock.calls.map(c => c[1].timeRangeFilter.startTime);
    expect(windows).toContain(fresh.startTime);
    expect(windows).not.toContain(cached.startTime);
  });

  test('a re-edited session is collected again rather than frozen', async () => {
    const original = session('s1', '2024-01-15T10:00:00.000Z');
    await enrichAndUpload([original], createTelemetryRunContext());
    mockReadRecords.mockClear();

    const edited = {
      ...original,
      metadata: { ...original.metadata, lastModifiedTime: '2024-01-15T12:00:00.000Z' },
    };
    await enrichAndUpload([edited], createTelemetryRunContext());

    expect(mockReadRecords).toHaveBeenCalled();
  });
});

describe('readHealthRecordsDetailed fallback short-circuits (#2191)', () => {
  const wideStart = new Date('2024-01-01T00:00:00.000Z');
  const wideEnd = new Date('2024-01-15T00:00:00.000Z');
  const addLog = require('../../../src/services/LogService').addLog as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const retryLogs = () =>
    addLog.mock.calls.filter(([message]: [string]) =>
      String(message).includes('day window(s)'),
    );

  test('a dead client is not split into per-day retries', async () => {
    mockReadRecords.mockRejectedValue(
      new Error('Health Connect client is not initialized'),
    );

    const result = await readHealthRecordsDetailed('Weight', wideStart, wideEnd);

    // One failed read, not one per day in the window.
    expect(mockReadRecords).toHaveBeenCalledTimes(1);
    expect(retryLogs()).toHaveLength(0);
    expect(result.error).toContain('client is not initialized');
  });

  test('an ordinary read failure still splits into day windows', async () => {
    mockReadRecords.mockRejectedValue(new Error('Something transient went wrong'));

    await readHealthRecordsDetailed('Weight', wideStart, wideEnd);

    expect(retryLogs()).toHaveLength(1);
    expect(mockReadRecords.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('enrichExerciseSessions failure and cache semantics (#2191)', () => {
  const {
    _resetEnrichedSessionCacheForTests,
    markEnrichedSessions,
  } = require('../../../src/services/shared/enrichedSessionCache');

  const enrichAndUpload = async (records: unknown[], ctx: TelemetryRunContext) => {
    const result = await enrichExerciseSessions(records, ctx);
    await markEnrichedSessions(ctx.drainCollected());
    return result;
  };

  const session = (id: string) => ({
    startTime: '2024-01-15T10:00:00.000Z',
    endTime: '2024-01-15T11:00:00.000Z',
    metadata: { dataOrigin: 'com.fitbit', id, lastModifiedTime: '2024-01-15T11:00:00.000Z' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    _resetEnrichedSessionCacheForTests();
    await AsyncStorage.clear();
    mockAggregateRecord.mockResolvedValue({});
    mockReadRecords.mockResolvedValue({ records: [] });
  });

  test('a rejected enrichment still fails the read, so the sync cursor holds', async () => {
    mockAggregateRecord.mockImplementation(() => {
      throw new Error('bridge exploded');
    });

    await expect(
      enrichExerciseSessions([session('s1')], createTelemetryRunContext()),
    ).rejects.toThrow('bridge exploded');
  });

  test('a headless run does not cache, so the next interactive run still collects the route', async () => {
    const sessions = [session('s1')];

    await enrichAndUpload(
      sessions,
      createTelemetryRunContext({ budget: 3, interactive: false }),
    );
    mockReadRecords.mockClear();

    // A background run cannot answer the route-consent dialog. Caching it there
    // would strand the route forever.
    await enrichAndUpload(sessions, createTelemetryRunContext());

    expect(mockReadRecords).toHaveBeenCalled();
  });
});

describe('dead Health Connect client is reconnected, not abandoned (#2191)', () => {
  const {
    resetClientUnavailableState,
    getClientUnavailableCount,
  } = require('../../../src/services/healthconnect/index');
  const addLog = require('../../../src/services/LogService').addLog as jest.Mock;

  const wideStart = new Date('2024-01-01T00:00:00.000Z');
  const wideEnd = new Date('2024-01-15T00:00:00.000Z');
  const deadClient = () => new Error('Health Connect client is not initialized');

  beforeEach(() => {
    jest.clearAllMocks();
    resetClientUnavailableState();
    mockInitialize.mockResolvedValue(true);
  });

  const retryLogs = () =>
    addLog.mock.calls.filter(([m]: [string]) => String(m).includes('day window(s)'));

  test('reconnects once and returns the records the retry finds', async () => {
    mockReadRecords
      .mockRejectedValueOnce(deadClient())
      .mockResolvedValueOnce({ records: [{ id: 'recovered' }] });

    const result = await readHealthRecordsDetailed('Weight', wideStart, wideEnd);

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(result.records).toEqual([{ id: 'recovered' }]);
    expect(result.error).toBeUndefined();
  });

  test('reconnects once per RUN, not once per metric', async () => {
    mockReadRecords.mockRejectedValue(deadClient());

    await readHealthRecordsDetailed('Weight', wideStart, wideEnd);
    await readHealthRecordsDetailed('Steps', wideStart, wideEnd);
    await readHealthRecordsDetailed('HeartRate', wideStart, wideEnd);

    // Three metrics, one reconnect. Without the per-run guard, 33 enabled
    // metrics would mean 33 reconnect attempts.
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(getClientUnavailableCount()).toBe(3);
  });

  test('a still-dead client surfaces the error without day-window retries', async () => {
    mockReadRecords.mockRejectedValue(deadClient());

    const result = await readHealthRecordsDetailed('Weight', wideStart, wideEnd);

    expect(retryLogs()).toHaveLength(0);
    expect(result.error).toContain('client is not initialized');
  });

  test('a new run gets a fresh reconnect attempt', async () => {
    mockReadRecords.mockRejectedValue(deadClient());
    await readHealthRecordsDetailed('Weight', wideStart, wideEnd);
    expect(mockInitialize).toHaveBeenCalledTimes(1);

    resetClientUnavailableState();
    await readHealthRecordsDetailed('Weight', wideStart, wideEnd);

    expect(mockInitialize).toHaveBeenCalledTimes(2);
  });

  test('a healthy read never reconnects', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    await readHealthRecordsDetailed('Weight', wideStart, wideEnd);

    expect(mockInitialize).not.toHaveBeenCalled();
    expect(getClientUnavailableCount()).toBe(0);
  });
});

describe('telemetry cache commits only after a successful upload (PR #2218 review)', () => {
  const {
    _resetEnrichedSessionCacheForTests,
    markEnrichedSessions,
  } = require('../../../src/services/shared/enrichedSessionCache');

  const session = (id: string) => ({
    startTime: '2024-01-15T10:00:00.000Z',
    endTime: '2024-01-15T11:00:00.000Z',
    metadata: { dataOrigin: 'com.fitbit', id, lastModifiedTime: '2024-01-15T11:00:00.000Z' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    _resetEnrichedSessionCacheForTests();
    await AsyncStorage.clear();
    mockAggregateRecord.mockResolvedValue({});
    mockReadRecords.mockResolvedValue({ records: [] });
  });

  test('a failed upload leaves nothing cached, so the retry re-collects telemetry', async () => {
    const sessions = [session('s1')];

    // Upload failed: the shell never drains this run's context, so nothing is
    // persisted and the discarded context takes its staging with it.
    await enrichExerciseSessions(sessions, createTelemetryRunContext());
    mockReadRecords.mockClear();

    await enrichExerciseSessions(sessions, createTelemetryRunContext());

    // Without this, the retry would send a summary-only record and the route
    // and samples would be lost until the workout changed or the entry aged out.
    expect(mockReadRecords).toHaveBeenCalled();
  });

  test('a successful upload does cache, so the next run skips the reads', async () => {
    const sessions = [session('s1')];

    const ctx = createTelemetryRunContext();
    await enrichExerciseSessions(sessions, ctx);
    await markEnrichedSessions(ctx.drainCollected());
    mockReadRecords.mockClear();

    await enrichExerciseSessions(sessions, createTelemetryRunContext());

    expect(mockReadRecords).not.toHaveBeenCalled();
  });
});
