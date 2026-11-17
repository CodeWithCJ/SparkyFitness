import { HEALTH_METRICS } from '../../HealthMetrics';
import {
  WRITEBACK_METRICS,
  writebackMetricPermissions,
} from '../../WritebackMetrics';
import type {
  PermissionRequest,
  HealthMetricStates,
} from '../../types/healthRecords';

/**
 * Why a request may carry a direction the caller did not ask about.
 *
 * The platform authorization sheet is authoritative for every row it displays:
 * confirming it commits the state of each visible toggle. Asking for one direction
 * while the other is already enabled can therefore leave the omitted direction sitting
 * at its default (off) state — which is how enabling read ends up switching write back
 * off, and vice versa.
 *
 * So whenever both directions of a record type are enabled, they are requested together.
 * This changes only what a single request *contains*. The two toggles remain independent
 * opt-ins with independent prefs, the sheet still exposes a per-row toggle, and a
 * direction that is switched off is never requested for.
 */

/** Write permissions for writeback metrics that are enabled, optionally scoped to record types. */
export const enabledWritebackPermissions = (
  writebackStates: Record<string, boolean>,
  recordTypes?: ReadonlySet<string>
): PermissionRequest[] =>
  WRITEBACK_METRICS.filter(
    (metric) =>
      writebackStates[metric.id] === true &&
      (!recordTypes || recordTypes.has(metric.permission.recordType))
  ).flatMap(
    (metric) => writebackMetricPermissions(metric) as PermissionRequest[]
  );

/** Read permissions for enabled read metrics covering a record type. */
export const enabledReadPermissionsForRecordType = (
  healthMetricStates: HealthMetricStates,
  recordType: string
): PermissionRequest[] =>
  HEALTH_METRICS.filter(
    (metric) =>
      metric.recordType === recordType &&
      healthMetricStates[metric.stateKey] === true
  ).flatMap((metric) => metric.permissions);

/**
 * Every permission the user currently has enabled, across both read metrics and
 * writeback metrics, read directly from persisted preferences.
 *
 * Unlike the two helpers above, this does not take React state — it is meant for
 * callers with no component state to read from (e.g. a dev seed action), and for
 * toggle handlers to fold into their own request so enabling or seeding one thing
 * always re-affirms everything else already granted, instead of asking narrowly and
 * risking the authorization sheet committing an omitted-but-enabled direction back to
 * off (see the module comment above).
 */
export const loadAllEnabledPermissions = async (
  loadHealthPreference: <T>(key: string) => Promise<T | null>
): Promise<PermissionRequest[]> => {
  const read: PermissionRequest[] = [];
  for (const metric of HEALTH_METRICS) {
    if ((await loadHealthPreference<boolean>(metric.preferenceKey)) === true) {
      read.push(...metric.permissions);
    }
  }

  const write: PermissionRequest[] = [];
  for (const metric of WRITEBACK_METRICS) {
    if ((await loadHealthPreference<boolean>(metric.preferenceKey)) === true) {
      write.push(
        ...(writebackMetricPermissions(metric) as PermissionRequest[])
      );
    }
  }

  return [...read, ...write];
};
