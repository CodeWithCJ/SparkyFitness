import type { HealthMetric } from '../HealthMetrics';
import type { PermissionRequest } from '../types/healthRecords';

/**
 * The state keys of the metrics whose own permissions were all granted. Lets
 * "Enable All" keep what the platform granted instead of turning every metric
 * off because one permission (declined, or not supported by this Health
 * Connect) was not granted.
 */
export function metricsCoveredByGrant(
  metrics: HealthMetric[],
  granted: PermissionRequest[]
): Set<string> {
  const isGranted = (permission: PermissionRequest) =>
    granted.some(
      (g) =>
        g.recordType === permission.recordType &&
        g.accessType === permission.accessType
    );
  return new Set(
    metrics
      .filter((metric) => metric.permissions.every(isGranted))
      .map((metric) => metric.stateKey)
  );
}
