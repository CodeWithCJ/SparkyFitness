import { currentAppSource } from '@kingstinct/react-native-healthkit';
import * as HealthKit from './healthkit/index';
import * as HealthKitAggregation from './healthkit/dataAggregation';
import * as HealthKitTransformation from './healthkit/dataTransformation';
import * as HealthKitPreferences from './healthkit/preferences';
import { HEALTH_METRICS } from '../HealthMetrics';
import { healthReadProvider, readCumulativeByDay } from './healthkit/provider';
import { runForegroundSync } from './shared/healthSyncEngine';
import { fetchMoveRingActiveCaloriesSetting } from './api/preferencesApi';
import {
  SyncResult,
  HealthMetricStates,
  type PermissionRequest,
} from '../types/healthRecords';
import { SyncDuration } from './healthkit/preferences';
import {
  enabledWritebackPermissions,
  loadAllEnabledPermissions as loadAllEnabledPermissionsShared,
} from './shared/healthPermissionSets';

// Tell the read transformers which bundle id is "us" so they skip HealthKit records
// this app wrote (hydration writeback feedback-loop guard). Parallels Android's
// setOwnPackageName. currentAppSource() is a native call, so guard it — a failure just
// disables the guard rather than crashing module load.
try {
  HealthKitTransformation.setOwnBundleId(currentAppSource().bundleIdentifier);
} catch {
  // HealthKit unavailable (e.g. unsupported device) — guard stays off.
}

export const initHealthConnect = HealthKit.initHealthConnect;
export const requestHealthPermissions = HealthKit.requestHealthPermissions;
// HealthKit never reveals which read permissions were granted, so a request
// either covers everything asked for or nothing.
export const requestGrantedHealthPermissions = async (
  permissionsToRequest: PermissionRequest[]
): Promise<PermissionRequest[]> =>
  (await HealthKit.requestHealthPermissions(permissionsToRequest))
    ? permissionsToRequest
    : [];
// HealthKit grants unlimited history with the normal read authorization — there is
// no separate history permission to request (Android Health Connect counterpart).
export const ensureHistoryReadPermission = async (): Promise<boolean> => true;
export const readHealthRecords = HealthKit.readHealthRecords;
export const readHealthRecordsDetailed = HealthKit.readHealthRecordsDetailed;
export const readMinMaxAvgByDayDetailed = HealthKit.readMinMaxAvgByDayDetailed;
export const getSyncStartDate = HealthKit.getSyncStartDate;

// Locked-device detection (HealthKit database inaccessible)
export const resetDatabaseInaccessibleCount =
  HealthKit.resetDatabaseInaccessibleCount;
// HealthKit has no equivalent: its store is not a separate client that can
// disconnect. Locked-device failures are covered by databaseInaccessibleCount.
export const getClientUnavailableCount = (): number => 0;
export const getDatabaseInaccessibleCount =
  HealthKit.getDatabaseInaccessibleCount;

export const aggregateByDay = HealthKitAggregation.aggregateByDay;

export { alignToLocalDayStart } from '../utils/syncUtils';

// Deduplicated aggregation functions (use HealthKit's statistics API). The Detailed
// variants carry a { records, error } envelope so read failures propagate to callers.
export const getAggregatedStepsByDate = HealthKit.getAggregatedStepsByDate;
export const getAggregatedStepsByDateDetailed =
  HealthKit.getAggregatedStepsByDateDetailed;
// The Sync screen's preview shows the same active figure the sync sends.
export const getAggregatedActiveCaloriesByDate = async (
  startDate: Date,
  endDate: Date
) =>
  HealthKit.getAggregatedActiveCaloriesByDate(
    startDate,
    endDate,
    await fetchMoveRingActiveCaloriesSetting()
  );
export const getAggregatedActiveCaloriesByDateDetailed =
  HealthKit.getAggregatedActiveCaloriesByDateDetailed;
export const getAggregatedTotalCaloriesByDate = async (
  startDate: Date,
  endDate: Date
) =>
  HealthKit.getAggregatedTotalCaloriesByDate(
    startDate,
    endDate,
    await fetchMoveRingActiveCaloriesSetting()
  );
export const getAggregatedTotalCaloriesByDateDetailed =
  HealthKit.getAggregatedTotalCaloriesByDateDetailed;
export const getAggregatedDistanceByDate =
  HealthKit.getAggregatedDistanceByDate;
export const getAggregatedDistanceByDateDetailed =
  HealthKit.getAggregatedDistanceByDateDetailed;
export const getAggregatedFloorsClimbedByDate =
  HealthKit.getAggregatedFloorsClimbedByDate;
export const getAggregatedFloorsClimbedByDateDetailed =
  HealthKit.getAggregatedFloorsClimbedByDateDetailed;
export const getAggregatedBasalEnergyByDate =
  HealthKit.getAggregatedBasalEnergyByDate;
export const getAggregatedBasalEnergyByDateDetailed =
  HealthKit.getAggregatedBasalEnergyByDateDetailed;

export { healthReadProvider, readCumulativeByDay };

export const aggregateSleepSessions =
  HealthKitAggregation.aggregateSleepSessions;

// iOS enriches workouts inside the read layer (handleWorkout fetches per-session
// statistics), so this is a passthrough — same pattern as Android's aggregateSleepSessions.
export const enrichExerciseSessions = async (
  records: unknown[]
): Promise<unknown[]> => records;

export const transformHealthRecords =
  HealthKitTransformation.transformHealthRecords;

export const saveHealthPreference = HealthKitPreferences.saveHealthPreference;
export const loadHealthPreference = HealthKitPreferences.loadHealthPreference;
export const saveStringPreference = HealthKitPreferences.saveStringPreference;
export const loadStringPreference = HealthKitPreferences.loadStringPreference;
export const saveSyncDuration = HealthKitPreferences.saveSyncDuration;
export const loadSyncDuration = HealthKitPreferences.loadSyncDuration;
// iOS asks HealthKit whether any enabled type has never been requested rather than
// relying on a permission version bump, so a type added to a metric in an update
// (e.g. caffeine in Nutrition) is requested without one. Android keeps the version.
export const refreshEnabledMetricPermissions = async (
  healthMetricStates: HealthMetricStates,
  writebackStates: Record<string, boolean> = {}
): Promise<boolean> => {
  // Read and write in one request; see shared/healthPermissionSets.
  const permissions = [
    ...HEALTH_METRICS.filter(
      (metric) => healthMetricStates[metric.stateKey]
    ).flatMap((metric) => metric.permissions),
    ...enabledWritebackPermissions(writebackStates),
  ];
  if (!(await HealthKit.hasUnrequestedHealthPermissions(permissions))) {
    return true;
  }
  return requestHealthPermissions(permissions);
};

/** Every permission currently enabled (read metrics + writeback), read from storage. */
export const loadAllEnabledPermissions = (): Promise<PermissionRequest[]> =>
  loadAllEnabledPermissionsShared(loadHealthPreference);

// Background delivery (iOS only)
export {
  enableBackgroundDeliveryForMetric,
  disableBackgroundDeliveryForMetric,
  setupBackgroundDeliveryForEnabledMetrics,
  subscribeToEnabledMetricChanges,
  refreshSubscriptions,
  cleanupAllSubscriptions,
  disableAllBackgroundDelivery,
  startObservers,
  stopObservers,
} from './healthkit/backgroundDelivery';

export const syncHealthData = (
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates = {},
  forceTelemetry = false
): Promise<SyncResult> =>
  runForegroundSync(healthReadProvider, syncDuration, healthMetricStates, {
    logTag: '[HealthKitService]',
    emptyMessage: 'No new health data to sync.',
    timeoutLabelPrefix: 'HealthKit query',
    forceTelemetry,
  });
