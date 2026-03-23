import { addLog } from '../LogService';
import type { PermissionRequest, HealthMetricStates } from '../../types/healthRecords';

const REQUIRED_HEALTH_PERMISSION_VERSION = 2;
const REQUIRED_HEALTH_PERMISSION_VERSION_KEY = 'healthPermissionsVersion';

type PermissionedMetric = {
  stateKey: string;
  permissions: PermissionRequest[];
};

interface MigrateEnabledMetricPermissionsParams {
  healthMetricStates: HealthMetricStates;
  metrics: PermissionedMetric[];
  loadHealthPreference: <T>(key: string) => Promise<T | null>;
  saveHealthPreference: <T>(key: string, value: T) => Promise<void>;
  requestHealthPermissions: (permissions: PermissionRequest[]) => Promise<boolean>;
  logTag: string;
}

export const migrateEnabledMetricPermissionsIfNeeded = async ({
  healthMetricStates,
  metrics,
  loadHealthPreference,
  saveHealthPreference,
  requestHealthPermissions,
  logTag,
}: MigrateEnabledMetricPermissionsParams): Promise<boolean> => {
  const storedVersion = await loadHealthPreference<number>(REQUIRED_HEALTH_PERMISSION_VERSION_KEY);
  if (storedVersion === REQUIRED_HEALTH_PERMISSION_VERSION) {
    return true;
  }

  const enabledPermissions = metrics
    .filter(metric => healthMetricStates[metric.stateKey])
    .flatMap(metric => metric.permissions);

  if (enabledPermissions.length === 0) {
    await saveHealthPreference(REQUIRED_HEALTH_PERMISSION_VERSION_KEY, REQUIRED_HEALTH_PERMISSION_VERSION);
    return true;
  }

  try {
    const granted = await requestHealthPermissions(enabledPermissions);
    if (!granted) {
      addLog(
        `${logTag} Permission migration v${REQUIRED_HEALTH_PERMISSION_VERSION} not fully granted; will retry later.`,
        'WARNING',
      );
      return false;
    }

    await saveHealthPreference(REQUIRED_HEALTH_PERMISSION_VERSION_KEY, REQUIRED_HEALTH_PERMISSION_VERSION);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `${logTag} Failed to migrate health permissions to v${REQUIRED_HEALTH_PERMISSION_VERSION}: ${message}`,
      'ERROR',
    );
    return false;
  }
};
