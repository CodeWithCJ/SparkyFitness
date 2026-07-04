import { currentAppSource } from '@kingstinct/react-native-healthkit';
import * as HealthKit from './healthkit/index';
import * as HealthKitAggregation from './healthkit/dataAggregation';
import * as HealthKitTransformation from './healthkit/dataTransformation';
import * as HealthKitPreferences from './healthkit/preferences';
import { HEALTH_METRICS } from '../HealthMetrics';
import { healthReadProvider, readCumulativeByDay } from './healthkit/provider';
import { runForegroundSync } from './shared/healthSyncEngine';
import {
  SyncResult,
  HealthMetricStates,
} from '../types/healthRecords';
import { SyncDuration } from './healthkit/preferences';
import { migrateEnabledMetricPermissionsIfNeeded } from './shared/healthPermissionMigration';

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
export const readHealthRecords = HealthKit.readHealthRecords;
export const readHealthRecordsDetailed = HealthKit.readHealthRecordsDetailed;
export const readMinMaxAvgByDayDetailed = HealthKit.readMinMaxAvgByDayDetailed;
export const getSyncStartDate = HealthKit.getSyncStartDate;

// Locked-device detection (HealthKit database inaccessible)
export const resetDatabaseInaccessibleCount = HealthKit.resetDatabaseInaccessibleCount;
export const getDatabaseInaccessibleCount = HealthKit.getDatabaseInaccessibleCount;

export const aggregateByDay = HealthKitAggregation.aggregateByDay;

export { alignToLocalDayStart } from '../utils/syncUtils';

// Deduplicated aggregation functions (use HealthKit's statistics API). The Detailed
// variants carry a { records, error } envelope so read failures propagate to callers.
export const getAggregatedStepsByDate = HealthKit.getAggregatedStepsByDate;
export const getAggregatedStepsByDateDetailed = HealthKit.getAggregatedStepsByDateDetailed;
export const getAggregatedActiveCaloriesByDate = HealthKit.getAggregatedActiveCaloriesByDate;
export const getAggregatedActiveCaloriesByDateDetailed = HealthKit.getAggregatedActiveCaloriesByDateDetailed;
export const getAggregatedTotalCaloriesByDate = HealthKit.getAggregatedTotalCaloriesByDate;
export const getAggregatedTotalCaloriesByDateDetailed = HealthKit.getAggregatedTotalCaloriesByDateDetailed;
export const getAggregatedDistanceByDate = HealthKit.getAggregatedDistanceByDate;
export const getAggregatedDistanceByDateDetailed = HealthKit.getAggregatedDistanceByDateDetailed;
export const getAggregatedFloorsClimbedByDate = HealthKit.getAggregatedFloorsClimbedByDate;
export const getAggregatedFloorsClimbedByDateDetailed = HealthKit.getAggregatedFloorsClimbedByDateDetailed;
export const getAggregatedBasalEnergyByDate = HealthKit.getAggregatedBasalEnergyByDate;
export const getAggregatedBasalEnergyByDateDetailed = HealthKit.getAggregatedBasalEnergyByDateDetailed;

export { healthReadProvider, readCumulativeByDay };

export const aggregateSleepSessions = HealthKitAggregation.aggregateSleepSessions;

// iOS enriches workouts inside the read layer (handleWorkout fetches per-session
// statistics), so this is a passthrough — same pattern as Android's aggregateSleepSessions.
export const enrichExerciseSessions = async (records: unknown[]): Promise<unknown[]> => records;

export const transformHealthRecords = HealthKitTransformation.transformHealthRecords;

export const saveHealthPreference = HealthKitPreferences.saveHealthPreference;
export const loadHealthPreference = HealthKitPreferences.loadHealthPreference;
export const saveStringPreference = HealthKitPreferences.saveStringPreference;
export const loadStringPreference = HealthKitPreferences.loadStringPreference;
export const saveSyncDuration = HealthKitPreferences.saveSyncDuration;
export const loadSyncDuration = HealthKitPreferences.loadSyncDuration;
export const refreshEnabledMetricPermissions = async (
  healthMetricStates: HealthMetricStates,
): Promise<boolean> =>
  migrateEnabledMetricPermissionsIfNeeded({
    healthMetricStates,
    metrics: HEALTH_METRICS,
    loadHealthPreference,
    saveHealthPreference,
    requestHealthPermissions,
    logTag: '[HealthKitService]',
  });

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
): Promise<SyncResult> =>
  runForegroundSync(healthReadProvider, syncDuration, healthMetricStates, {
    logTag: '[HealthKitService]',
    emptyMessage: 'No new health data to sync.',
    timeoutLabelPrefix: 'HealthKit query',
  });
