import { addLog } from '../LogService';
import type { PermissionRequest, HealthMetricStates } from '../../types/healthRecords';

const REQUIRED_HEALTH_PERMISSION_VERSION = 4;
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
  /**
   * Permissions for directions that are enabled but not covered by `metrics` — in
   * practice the write side of enabled writeback metrics.
   *
   * This pass re-requests permissions for everything already enabled. Issuing it with
   * the read direction alone would hand the authorization sheet a partial picture, and
   * the sheet is authoritative for every row it shows, so an omitted-but-enabled write
   * direction can be committed back to off. Both directions go in one request.
   */
  extraPermissions?: PermissionRequest[];
}

export const migrateEnabledMetricPermissionsIfNeeded = async ({
  healthMetricStates,
  metrics,
  loadHealthPreference,
  saveHealthPreference,
  requestHealthPermissions,
  logTag,
  extraPermissions = [],
}: MigrateEnabledMetricPermissionsParams): Promise<boolean> => {
  const storedVersion = await loadHealthPreference<number>(REQUIRED_HEALTH_PERMISSION_VERSION_KEY);
  if (storedVersion === REQUIRED_HEALTH_PERMISSION_VERSION) {
    return true;
  }

  const enabledPermissions = [
    ...metrics.filter(metric => healthMetricStates[metric.stateKey]).flatMap(m => m.permissions),
    ...extraPermissions,
  ];

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
