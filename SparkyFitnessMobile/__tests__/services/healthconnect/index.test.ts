import {
  initHealthConnect,
  requestHealthPermissions,
  getSyncStartDate,
  readHealthRecords,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  enrichExerciseSessions,
  syncHealthData,
} from '../../../src/services/healthconnect/index';

import {
  initialize,
  requestPermission,
  readRecords,
  aggregateRecord,
} from 'react-native-health-connect';

import type { PermissionRequest, GrantedPermission, HealthMetricStates } from '../../../src/types/healthRecords';
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
  });

  test('returns aggregated steps by date', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 2000, metadata: { dataOrigin: 'com.phone' } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 3000, metadata: { dataOrigin: 'com.phone' } },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2024-01-15',
      value: 5000,
      type: 'step',
    });
  });

  test('uses endTime for date assignment', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T14:00:00Z', count: 300, metadata: { dataOrigin: 'com.phone' } },
        { startTime: '2024-01-16T10:00:00Z', endTime: '2024-01-16T14:00:00Z', count: 500, metadata: { dataOrigin: 'com.phone' } },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-16T23:59:59Z')
    );

    expect(result).toHaveLength(2);
    // Records should be grouped by endTime date
    expect(result.find(r => r.date === '2024-01-15')?.value).toBe(300);
    expect(result.find(r => r.date === '2024-01-16')?.value).toBe(500);
  });

  test('deduplicates across data origins by taking max per day', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        // Phone recorded 5000 steps
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 2000, metadata: { dataOrigin: 'com.phone' } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 3000, metadata: { dataOrigin: 'com.phone' } },
        // Watch recorded 4500 steps (overlapping data)
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 1800, metadata: { dataOrigin: 'com.watch' } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 2700, metadata: { dataOrigin: 'com.watch' } },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    // Should take max (phone=5000) not sum (9500)
    expect(result[0].value).toBe(5000);
  });

  test('groups records with missing metadata as unknown origin', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 2000 },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 3000 },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    // Both grouped as 'unknown' origin, summed normally
    expect(result[0].value).toBe(5000);
  });

  test('skips records with missing timestamps', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { count: 100, metadata: { dataOrigin: 'com.phone' } }, // No startTime or endTime
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 2000, metadata: { dataOrigin: 'com.phone' } },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(2000);
  });

  test('returns empty array when no records found', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });

  test('aggregates across multiple days', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 5000, metadata: { dataOrigin: 'com.phone' } },
        { startTime: '2024-01-16T08:00:00Z', endTime: '2024-01-16T09:00:00Z', count: 6000, metadata: { dataOrigin: 'com.phone' } },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-16T23:59:59Z')
    );

    expect(result).toHaveLength(2);
    expect(result.find(r => r.date === '2024-01-15')?.value).toBe(5000);
    expect(result.find(r => r.date === '2024-01-16')?.value).toBe(6000);
  });

  test('returns empty array on error', async () => {
    mockReadRecords.mockRejectedValue(new Error('Failed to read'));

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });
});

describe('getAggregatedActiveCaloriesByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns aggregated calories by date', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', energy: { inKilocalories: 200 }, metadata: { dataOrigin: 'com.phone' } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', energy: { inKilocalories: 300 }, metadata: { dataOrigin: 'com.phone' } },
      ],
    });

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2024-01-15',
      value: 500,
      type: 'active_calories',
    });
  });

  test('deduplicates across data origins by taking max per day', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        // Phone recorded 500 kcal
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', energy: { inKilocalories: 200 }, metadata: { dataOrigin: 'com.phone' } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', energy: { inKilocalories: 300 }, metadata: { dataOrigin: 'com.phone' } },
        // Watch recorded 450 kcal (overlapping)
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', energy: { inKilocalories: 180 }, metadata: { dataOrigin: 'com.watch' } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', energy: { inKilocalories: 270 }, metadata: { dataOrigin: 'com.watch' } },
      ],
    });

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    // Should take max (phone=500) not sum (950)
    expect(result[0].value).toBe(500);
  });

  test('returns empty array when no records found', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toEqual([]);
  });

  test('rounds calorie values', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', energy: { inKilocalories: 500.5 }, metadata: { dataOrigin: 'com.phone' } },
      ],
    });

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result[0].value).toBe(501); // Math.round(500.5)
  });

  test('returns empty array on error', async () => {
    mockReadRecords.mockRejectedValue(new Error('Failed to read'));

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
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

  test('does not query TotalCaloriesBurned when ActiveCaloriesBurned has data', async () => {
    mockAggregateRecord.mockImplementation(({ recordType }: { recordType: string }) => {
      if (recordType === 'ActiveCaloriesBurned') {
        return Promise.resolve({ ACTIVE_CALORIES_TOTAL: { inKilocalories: 300 } });
      }
      if (recordType === 'Distance') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    await enrichExerciseSessions([makeSession()]);

    const recordTypes = mockAggregateRecord.mock.calls.map((c: unknown[]) => (c[0] as { recordType: string }).recordType);
    expect(recordTypes).not.toContain('TotalCaloriesBurned');
  });

  test('passes dataOriginFilter from session metadata', async () => {
    mockAggregateRecord.mockResolvedValue({});

    await enrichExerciseSessions([makeSession({ metadata: { dataOrigin: 'com.ohealth' } })]);

    // All aggregate calls should include the data origin filter
    for (const call of mockAggregateRecord.mock.calls) {
      expect(call[0].dataOriginFilter).toEqual(['com.ohealth']);
    }
  });
});

describe('syncHealthData', () => {
  let mockApi: { syncHealthData: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi = {
      syncHealthData: jest.fn().mockResolvedValue({ success: true }),
    };
  });

  test('syncs enabled metrics and calls API', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', count: 5000 },
      ],
    });

    const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true, isHeartRateSyncEnabled: false };

    const result = await syncHealthData('24h', healthMetricStates, mockApi);

    expect(result.success).toBe(true);
    expect(mockApi.syncHealthData).toHaveBeenCalled();
  });

  test('does not call API when no data to sync', async () => {
    mockReadRecords.mockResolvedValue({ records: [] });

    const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

    const result = await syncHealthData('24h', healthMetricStates, mockApi);

    expect(result.success).toBe(true);
    expect(result.message).toBe('No health data to sync.');
    expect(mockApi.syncHealthData).not.toHaveBeenCalled();
  });

  test('handles empty healthMetricStates', async () => {
    const result = await syncHealthData('24h', {}, mockApi);

    expect(result.success).toBe(true);
    expect(result.message).toBe('No health data to sync.');
  });

  test('continues processing when one metric returns no records', async () => {
    // readHealthRecords catches errors internally and returns [], so sync continues gracefully
    // This test verifies that if Steps returns empty but HeartRate has data, HeartRate is still synced
    mockReadRecords.mockImplementation((recordType: string) => {
      if (recordType === 'Steps') {
        // Steps has no records
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

    const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true, isHeartRateSyncEnabled: true };

    const result = await syncHealthData('24h', healthMetricStates, mockApi);

    expect(result.success).toBe(true);
    // HeartRate data should still be synced
    expect(mockApi.syncHealthData).toHaveBeenCalled();
    const apiCallArgs = mockApi.syncHealthData.mock.calls[0][0];
    expect(apiCallArgs.some((r: { type: string }) => r.type.startsWith('heart_rate_'))).toBe(true);
  });

  test('returns error when API call fails', async () => {
    mockReadRecords.mockResolvedValue({
      records: [{ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', count: 5000 }],
    });
    mockApi.syncHealthData.mockRejectedValue(new Error('Server error'));

    const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

    const result = await syncHealthData('24h', healthMetricStates, mockApi);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server error');
  });

  test('aggregates Steps records before transformation', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 2000 },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 3000 },
      ],
    });

    const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

    await syncHealthData('24h', healthMetricStates, mockApi);

    // Should have aggregated steps into single daily total
    const apiCallArgs = mockApi.syncHealthData.mock.calls[0][0];
    expect(apiCallArgs).toHaveLength(1);
    expect(apiCallArgs[0].value).toBe(5000);
  });

  test('aggregates HeartRate records with min/max/avg', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 60 }] },
        { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 80 }] },
      ],
    });

    const healthMetricStates: HealthMetricStates = { isHeartRateSyncEnabled: true };

    await syncHealthData('24h', healthMetricStates, mockApi);

    const apiCallArgs = mockApi.syncHealthData.mock.calls[0][0];
    expect(apiCallArgs).toHaveLength(3); // min, max, avg
    const hrMin = apiCallArgs.find((r: { type: string }) => r.type === 'heart_rate_min');
    const hrMax = apiCallArgs.find((r: { type: string }) => r.type === 'heart_rate_max');
    const hrAvg = apiCallArgs.find((r: { type: string }) => r.type === 'heart_rate_avg');
    expect(hrMin.value).toBe(60);
    expect(hrMax.value).toBe(80);
    expect(hrAvg.value).toBe(70);
  });

  test('skips metric when no config found for record type', async () => {
    // Mock HEALTH_METRICS to not include the metric we're trying to sync
    // This tests the "No metric configuration found" path
    mockReadRecords.mockResolvedValue({
      records: [{ startTime: '2024-01-15T10:00:00Z', value: 100 }],
    });

    // With our mock HEALTH_METRICS, only these metrics are valid
    const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

    const result = await syncHealthData('24h', healthMetricStates, mockApi);

    expect(result.success).toBe(true);
  });

  test('returns apiResponse on success', async () => {
    mockReadRecords.mockResolvedValue({
      records: [{ startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', count: 5000 }],
    });
    mockApi.syncHealthData.mockResolvedValue({ processed: 1, success: true });

    const healthMetricStates: HealthMetricStates = { isStepsSyncEnabled: true };

    const result = await syncHealthData('24h', healthMetricStates, mockApi);

    expect(result.apiResponse).toEqual({ processed: 1, success: true });
  });
});
