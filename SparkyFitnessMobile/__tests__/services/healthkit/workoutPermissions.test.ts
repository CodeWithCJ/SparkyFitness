jest.mock('@kingstinct/react-native-healthkit', () => ({
  requestAuthorization: jest.fn().mockResolvedValue(true),
  isHealthDataAvailable: jest.fn().mockResolvedValue(true),
  queryQuantitySamples: jest.fn(),
  queryStatisticsCollectionForQuantity: jest.fn(),
  queryCategorySamples: jest.fn(),
  queryWorkoutSamples: jest.fn(),
  queryCorrelationSamples: jest.fn(),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: jest.fn() },
}));

import {
  initHealthConnect,
  requestHealthPermissions,
} from '../../../src/services/healthkit/index';
import { requestAuthorization } from '@kingstinct/react-native-healthkit';
import { HEALTH_METRICS } from '../../../src/HealthMetrics';

// requestHealthPermissions short-circuits until availability has been probed.
beforeAll(async () => {
  await initHealthConnect();
});

const authorizeWith = async (
  permissions: { accessType: string; recordType: string }[]
): Promise<{ toRead: string[]; toShare: string[] }> => {
  (requestAuthorization as jest.Mock).mockClear();
  await requestHealthPermissions(
    permissions as Parameters<typeof requestHealthPermissions>[0]
  );
  return (requestAuthorization as jest.Mock).mock.calls[0][0] as {
    toRead: string[];
    toShare: string[];
  };
};

const readTypesFor = async (
  permissions: { accessType: string; recordType: string }[]
): Promise<string[]> => (await authorizeWith(permissions)).toRead;

describe('workout read authorization', () => {
  // HealthKit authorizes each underlying type separately: workout access alone
  // grants neither the GPS route nor the samples recorded during the workout.
  // Without these, getWorkoutRoutes() returns empty and the per-workout sample
  // queries throw, so a synced walk has no map and no heart-rate chart — and
  // because those failures are swallowed per type, it fails silently.
  it.each([['ExerciseSession'], ['Workout']])(
    'authorizes route and telemetry types for a %s read',
    async (recordType) => {
      const readTypes = await readTypesFor([
        { accessType: 'read', recordType },
      ]);

      expect(readTypes).toContain('HKWorkoutTypeIdentifier');
      expect(readTypes).toContain('HKWorkoutRouteTypeIdentifier');
      expect(readTypes).toContain('HKQuantityTypeIdentifierStepCount');
      expect(readTypes).toContain('HKQuantityTypeIdentifierHeartRate');
      expect(readTypes).toContain('HKQuantityTypeIdentifierRunningSpeed');
      expect(readTypes).toContain('HKQuantityTypeIdentifierCyclingSpeed');
      expect(readTypes).toContain('HKQuantityTypeIdentifierRunningPower');
      expect(readTypes).toContain('HKQuantityTypeIdentifierCyclingPower');
      expect(readTypes).toContain('HKQuantityTypeIdentifierCyclingCadence');
      expect(readTypes).toContain(
        'HKQuantityTypeIdentifierRunningGroundContactTime'
      );
      expect(readTypes).toContain(
        'HKQuantityTypeIdentifierRunningVerticalOscillation'
      );
      expect(readTypes).toContain(
        'HKQuantityTypeIdentifierRunningStrideLength'
      );
    }
  );

  it('does not request the route for a workout write', async () => {
    const { toShare } = await authorizeWith([
      { accessType: 'write', recordType: 'Workout' },
    ]);

    expect(toShare).toContain('HKWorkoutTypeIdentifier');
    expect(toShare).not.toContain('HKWorkoutRouteTypeIdentifier');
  });

  it('leaves unrelated metrics unchanged', async () => {
    const readTypes = await readTypesFor([
      { accessType: 'read', recordType: 'Weight' },
    ]);
    expect(readTypes).toEqual(['HKQuantityTypeIdentifierBodyMass']);
  });
});

describe('exerciseSession metric permissions', () => {
  const exerciseSession = HEALTH_METRICS.find(
    (metric) => metric.id === 'exerciseSession'
  );

  it('requests the Health Connect record types the telemetry reads need', () => {
    const recordTypes = exerciseSession?.permissions.map((p) => p.recordType);
    expect(recordTypes).toEqual(
      expect.arrayContaining([
        'ExerciseSession',
        'HeartRate',
        'Speed',
        'Power',
        'Steps',
        'StepsCadence',
        'CyclingPedalingCadence',
      ])
    );
  });

  it('never lists ExerciseRoute as a read permission', () => {
    // Health Connect's PermissionUtils throws InvalidRecordType for a read
    // ExerciseRoute permission (only the write form is special-cased), which
    // would fail the entire permission request for every metric.
    for (const metric of HEALTH_METRICS) {
      for (const permission of metric.permissions) {
        expect(
          permission.accessType === 'read' &&
            permission.recordType === 'ExerciseRoute'
        ).toBe(false);
      }
    }
  });
});

// Regression guard for issue #2160 at the expansion layer: each direction lands in its
// own array and neither leaks into the other. Whether a *caller* bundles the enabled
// counterpart into one request is a separate decision, made in SyncScreen — see
// services/shared/healthPermissionSets.ts.
describe('read/write direction independence', () => {
  it.each(['Nutrition', 'Hydration'])(
    'requests %s write without touching read',
    async (recordType) => {
      const { toRead, toShare } = await authorizeWith([
        { accessType: 'write', recordType },
      ]);
      expect(toRead).toEqual([]);
      expect(toShare.length).toBeGreaterThan(0);
    }
  );

  it.each(['Nutrition', 'Hydration'])(
    'requests %s read without touching write',
    async (recordType) => {
      const { toRead, toShare } = await authorizeWith([
        { accessType: 'read', recordType },
      ]);
      expect(toShare).toEqual([]);
      expect(toRead.length).toBeGreaterThan(0);
    }
  );

  it.each(['Nutrition', 'Hydration'])(
    'keeps both directions when %s is requested both ways at once',
    async (recordType) => {
      const { toRead, toShare } = await authorizeWith([
        { accessType: 'read', recordType },
        { accessType: 'write', recordType },
      ]);
      expect(toRead.length).toBeGreaterThan(0);
      expect(toShare).toEqual(toRead);
    }
  );
});

describe('authorization request logging', () => {
  const { addLog } = jest.requireMock('../../../src/services/LogService');

  it('records exactly what was handed to HealthKit, per direction', async () => {
    (addLog as jest.Mock).mockClear();
    await authorizeWith([{ accessType: 'write', recordType: 'Hydration' }]);

    const [message, , details] = (addLog as jest.Mock).mock.calls.find(
      ([m]: [string]) => m.includes('Requesting HealthKit authorization')
    );
    expect(message).toBeTruthy();
    expect(details).toEqual([
      'toRead (0): (none)',
      'toShare (1): HKQuantityTypeIdentifierDietaryWater',
    ]);
  });

  it('warns instead of silently succeeding when nothing maps to a HealthKit type', async () => {
    (addLog as jest.Mock).mockClear();
    (requestAuthorization as jest.Mock).mockClear();

    await requestHealthPermissions([
      { accessType: 'write', recordType: 'NotARealRecordType' },
    ] as Parameters<typeof requestHealthPermissions>[0]);

    expect(requestAuthorization).not.toHaveBeenCalled();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('expanded to zero HealthKit types'),
      'WARNING',
      ['unmapped: write NotARealRecordType']
    );
  });
});
