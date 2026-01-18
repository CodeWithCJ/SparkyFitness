import { insertRecords, requestPermission } from 'react-native-health-connect';
import { addLog } from '../../src/services/LogService';

interface SeedResult {
  success: boolean;
  recordsInserted: number;
  error?: string;
}

jest.mock('react-native-health-connect', () => ({
  insertRecords: jest.fn(),
  requestPermission: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockInsertRecords = insertRecords as jest.Mock;
const mockRequestPermission = requestPermission as jest.Mock;
const mockAddLog = addLog as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const seedService = require('../../src/services/seedHealthData.ts') as {
  seedHealthData: (days?: number) => Promise<SeedResult>;
};

describe('seedHealthData.ts (Android)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: permissions granted, insertions succeed
    mockRequestPermission.mockImplementation((requested) => Promise.resolve(requested));
    mockInsertRecords.mockResolvedValue(undefined);
  });

  describe('successful seeding', () => {
    test('returns success with record count when permissions granted and insertion succeeds', async () => {
      const result = await seedService.seedHealthData(7);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
      expect(mockInsertRecords).toHaveBeenCalled();
    });

    test('record count scales with days parameter', async () => {
      const result1 = await seedService.seedHealthData(1);
      jest.clearAllMocks();
      mockRequestPermission.mockImplementation((requested) => Promise.resolve(requested));
      mockInsertRecords.mockResolvedValue(undefined);
      const result7 = await seedService.seedHealthData(7);

      expect(result7.recordsInserted).toBeGreaterThan(result1.recordsInserted);
    });
  });

  describe('permission handling', () => {
    test('returns error when permissions not granted', async () => {
      mockRequestPermission.mockResolvedValue([]);

      const result = await seedService.seedHealthData(7);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.error).toMatch(/permission/i);
      expect(mockInsertRecords).not.toHaveBeenCalled();
    });

    test('returns error when requestPermission throws', async () => {
      mockRequestPermission.mockRejectedValue(new Error('Permission denied'));

      const result = await seedService.seedHealthData(7);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('record insertion errors', () => {
    test('continues seeding when individual record type fails', async () => {
      let callCount = 0;
      mockInsertRecords.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First insertion failed'));
        }
        return Promise.resolve(undefined);
      });

      const result = await seedService.seedHealthData(7);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBeGreaterThan(0);
      expect(mockInsertRecords.mock.calls.length).toBeGreaterThan(1);
    });

    test('returns success with zero records when all insertions fail', async () => {
      // This is intentional behavior: the function handles insertion errors gracefully
      // per-record-type (logging warnings) rather than failing the entire operation.
      // success=true indicates the seeding process completed without throwing.
      // success=false is reserved for permission failures which block all seeding.
      mockInsertRecords.mockRejectedValue(new Error('Insertion failed'));

      const result = await seedService.seedHealthData(7);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('handles days=0', async () => {
      const result = await seedService.seedHealthData(0);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
    });

    test('handles negative days', async () => {
      const result = await seedService.seedHealthData(-5);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
    });

    test('default parameter works without argument', async () => {
      // Verify the function works when called without arguments (uses default of 7 days).
      // We can't compare exact counts because some seeders use randomness for
      // how many records they create per day (e.g., 1-2 exercise sessions).
      const result = await seedService.seedHealthData();

      expect(result.success).toBe(true);
      // 7 days should produce significantly more records than 1 day
      expect(result.recordsInserted).toBeGreaterThan(100);
      expect(mockInsertRecords).toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    test('logs success message on completion', async () => {
      await seedService.seedHealthData(7);

      const successCalls = mockAddLog.mock.calls.filter(
        (call) => call[2] === 'SUCCESS'
      );
      expect(successCalls.length).toBeGreaterThan(0);
    });

    test('logs start message even when permissions denied', async () => {
      mockRequestPermission.mockResolvedValue([]);

      await seedService.seedHealthData(7);

      // The implementation logs "Starting to seed..." before checking permissions,
      // then returns early without additional logging when permissions are denied.
      // This test verifies the start message is logged.
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Starting to seed'),
        'info',
        'INFO'
      );
    });
  });
});

describe('seedHealthData.ios.ts', () => {
  test('seeds health data successfully when permissions are granted', async () => {
    // Import iOS file directly using require to bypass Jest's platform resolution
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iosService = require('../../src/services/seedHealthData.ios.ts') as {
      seedHealthData: (days?: number) => Promise<SeedResult>;
    };

    const result = await iosService.seedHealthData(7);

    // With mocked HealthKit, seeding should succeed
    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });
});
