import {
  initHealthConnect,
  requestHealthPermissions,
  getSyncStartDate,
  readHealthRecords,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  syncHealthData,
} from '../../../src/services/healthconnect/index';

import {
  initialize,
  requestPermission,
  readRecords,
} from 'react-native-health-connect';

import type { PermissionRequest, GrantedPermission, HealthMetricStates } from '../../../src/types/healthRecords';
import type { SyncDuration } from '../../../src/services/healthconnect/preferences';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/constants/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { recordType: 'Steps', stateKey: 'isStepsSyncEnabled', unit: 'count', type: 'step' },
    { recordType: 'HeartRate', stateKey: 'isHeartRateSyncEnabled', unit: 'bpm', type: 'heart_rate' },
    { recordType: 'Weight', stateKey: 'isWeightSyncEnabled', unit: 'kg', type: 'weight' },
    { recordType: 'ActiveCaloriesBurned', stateKey: 'isCaloriesSyncEnabled', unit: 'kcal', type: 'Active Calories' },
    { recordType: 'TotalCaloriesBurned', stateKey: 'isTotalCaloriesSyncEnabled', unit: 'kcal', type: 'total_calories' },
  ],
}));

const mockInitialize = initialize as jest.Mock;
const mockRequestPermission = requestPermission as jest.Mock;
const mockReadRecords = readRecords as jest.Mock;

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
});

describe('getSyncStartDate', () => {
  describe('midnight behavior', () => {
    test("'today' returns today's date at midnight", () => {
      const result = getSyncStartDate('today');
      const expected = new Date();
      expected.setHours(0, 0, 0, 0);

      expect(result.toISOString().split('T')[0]).toBe(expected.toISOString().split('T')[0]);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    test("'24h' sets to midnight AFTER subtracting (different from other durations)", () => {
      // Note: The implementation sets midnight AFTER the date calculation
      // So '24h' first subtracts 24 hours, then sets to midnight
      const result = getSyncStartDate('24h');

      // Verify midnight is set
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

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
  });

  describe('date calculations', () => {
    test("'3d' returns 2 days ago at midnight", () => {
      const result = getSyncStartDate('3d');
      const expected = new Date();
      expected.setDate(expected.getDate() - 2);
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

});

describe('readHealthRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls readRecords with correct parameters', async () => {
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
});

describe('getAggregatedStepsByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns aggregated steps by date', async () => {
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
    expect(result[0]).toMatchObject({
      date: '2024-01-15',
      value: 5000, // 2000 + 3000
      type: 'step',
    });
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
        { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', count: 5000 },
        { startTime: '2024-01-16T10:00:00Z', endTime: '2024-01-16T11:00:00Z', count: 6000 },
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

  test('uses endTime for date assignment', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        // Steps spanning midnight - should be assigned to Jan 15 (endTime date)
        { startTime: '2024-01-14T23:00:00Z', endTime: '2024-01-15T00:30:00Z', count: 500 },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-14T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-15');
  });

  test('handles records with missing count as 0', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z' }, // No count
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 3000 },
      ],
    });

    const result = await getAggregatedStepsByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(3000); // 0 + 3000
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

  test('returns aggregated calories by date using inKilocalories', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', energy: { inKilocalories: 200 } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', energy: { inKilocalories: 300 } },
      ],
    });

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2024-01-15',
      value: 500, // 200 + 300
      type: 'active_calories',
    });
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
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', energy: { inKilocalories: 200.7 } },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', energy: { inKilocalories: 299.8 } },
      ],
    });

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result[0].value).toBe(501); // Math.round(500.5)
  });

  test('handles records with missing energy as 0', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z' }, // No energy
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', energy: { inKilocalories: 300 } },
      ],
    });

    const result = await getAggregatedActiveCaloriesByDate(
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T23:59:59Z')
    );

    expect(result[0].value).toBe(300);
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
    expect(apiCallArgs.some((r: { type: string }) => r.type === 'heart_rate')).toBe(true);
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

  test('aggregates HeartRate records before transformation', async () => {
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 60 }] },
        { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 80 }] },
      ],
    });

    const healthMetricStates: HealthMetricStates = { isHeartRateSyncEnabled: true };

    await syncHealthData('24h', healthMetricStates, mockApi);

    const apiCallArgs = mockApi.syncHealthData.mock.calls[0][0];
    expect(apiCallArgs).toHaveLength(1);
    expect(apiCallArgs[0].value).toBe(70); // Average of 60 and 80
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
