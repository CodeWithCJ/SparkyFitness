import { migrateEnabledMetricPermissionsIfNeeded } from '../../../src/services/shared/healthPermissionMigration';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('migrateEnabledMetricPermissionsIfNeeded', () => {
  const metrics: Array<{
    stateKey: string;
    permissions: Array<{ accessType: 'read' | 'write'; recordType: string }>;
  }> = [
    {
      stateKey: 'isExerciseSessionSyncEnabled',
      permissions: [
        { accessType: 'read', recordType: 'ExerciseSession' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      ],
    },
    {
      stateKey: 'isStepsSyncEnabled',
      permissions: [{ accessType: 'read', recordType: 'Steps' }],
    },
  ];

  const loadHealthPreference = jest.fn();
  const saveHealthPreference = jest.fn();
  const requestHealthPermissions = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('skips migration when the stored version is current', async () => {
    loadHealthPreference.mockResolvedValue(2);

    const result = await migrateEnabledMetricPermissionsIfNeeded({
      healthMetricStates: { isExerciseSessionSyncEnabled: true },
      metrics,
      loadHealthPreference,
      saveHealthPreference,
      requestHealthPermissions,
      logTag: '[HealthConnectService]',
    });

    expect(result).toBe(true);
    expect(requestHealthPermissions).not.toHaveBeenCalled();
    expect(saveHealthPreference).not.toHaveBeenCalled();
  });

  test('saves the new version without prompting when no metrics are enabled', async () => {
    loadHealthPreference.mockResolvedValue(null);

    const result = await migrateEnabledMetricPermissionsIfNeeded({
      healthMetricStates: {},
      metrics,
      loadHealthPreference,
      saveHealthPreference,
      requestHealthPermissions,
      logTag: '[HealthConnectService]',
    });

    expect(result).toBe(true);
    expect(requestHealthPermissions).not.toHaveBeenCalled();
    expect(saveHealthPreference).toHaveBeenCalledWith('healthPermissionsVersion', 2);
  });

  test('persists the new version after all enabled permissions are granted', async () => {
    loadHealthPreference.mockResolvedValue(1);
    requestHealthPermissions.mockResolvedValue(true);

    const result = await migrateEnabledMetricPermissionsIfNeeded({
      healthMetricStates: {
        isExerciseSessionSyncEnabled: true,
        isStepsSyncEnabled: false,
      },
      metrics,
      loadHealthPreference,
      saveHealthPreference,
      requestHealthPermissions,
      logTag: '[HealthConnectService]',
    });

    expect(result).toBe(true);
    expect(requestHealthPermissions).toHaveBeenCalledWith(metrics[0].permissions);
    expect(saveHealthPreference).toHaveBeenCalledWith('healthPermissionsVersion', 2);
  });

  test('does not persist the new version when permissions are only partially granted', async () => {
    loadHealthPreference.mockResolvedValue(1);
    requestHealthPermissions.mockResolvedValue(false);

    const result = await migrateEnabledMetricPermissionsIfNeeded({
      healthMetricStates: { isExerciseSessionSyncEnabled: true },
      metrics,
      loadHealthPreference,
      saveHealthPreference,
      requestHealthPermissions,
      logTag: '[HealthConnectService]',
    });

    expect(result).toBe(false);
    expect(requestHealthPermissions).toHaveBeenCalledWith(metrics[0].permissions);
    expect(saveHealthPreference).not.toHaveBeenCalled();
  });

  test('does not persist the new version when requesting permissions throws', async () => {
    loadHealthPreference.mockResolvedValue(1);
    requestHealthPermissions.mockRejectedValue(new Error('Permission request failed'));

    const result = await migrateEnabledMetricPermissionsIfNeeded({
      healthMetricStates: { isExerciseSessionSyncEnabled: true },
      metrics,
      loadHealthPreference,
      saveHealthPreference,
      requestHealthPermissions,
      logTag: '[HealthConnectService]',
    });

    expect(result).toBe(false);
    expect(saveHealthPreference).not.toHaveBeenCalled();
  });
});
