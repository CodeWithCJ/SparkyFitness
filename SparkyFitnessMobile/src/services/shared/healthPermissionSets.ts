import { HEALTH_METRICS } from '../../HealthMetrics';
import { WRITEBACK_METRICS } from '../../WritebackMetrics';
import type { PermissionRequest, HealthMetricStates } from '../../types/healthRecords';

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
  recordTypes?: ReadonlySet<string>,
): PermissionRequest[] =>
  WRITEBACK_METRICS.filter(
    metric =>
      writebackStates[metric.id] === true &&
      (!recordTypes || recordTypes.has(metric.permission.recordType)),
  ).map(metric => metric.permission);

/** Read permissions for enabled read metrics covering a record type. */
export const enabledReadPermissionsForRecordType = (
  healthMetricStates: HealthMetricStates,
  recordType: string,
): PermissionRequest[] =>
  HEALTH_METRICS.filter(
    metric => metric.recordType === recordType && healthMetricStates[metric.stateKey] === true,
  ).flatMap(metric => metric.permissions);
