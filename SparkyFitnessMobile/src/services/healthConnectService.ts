import * as HealthConnect from './healthconnect/index';
import * as HealthConnectAggregation from './healthconnect/dataAggregation';
import * as HealthConnectTransformation from './healthconnect/dataTransformation';
import * as HealthConnectPreferences from './healthconnect/preferences';
import { HEALTH_METRICS } from '../HealthMetrics';
import { healthReadProvider, readCumulativeByDay } from './healthconnect/provider';
import { runForegroundSync } from './shared/healthSyncEngine';
import {
  AggregatedHealthRecord,
  SyncResult,
  HealthMetricStates,
  type MetricConfig,
  type TransformedRecord,
} from '../types/healthRecords';
import { SyncDuration } from './healthconnect/preferences';
import { migrateEnabledMetricPermissionsIfNeeded } from './shared/healthPermissionMigration';
import * as Application from 'expo-application';

// Tell the read transformers which package is "us" so they skip Health Connect
// records this app wrote (writeback feedback-loop guard). Resolved once here so
// the pure transformer module stays free of expo-application.
HealthConnectTransformation.setOwnPackageName(Application.applicationId);

export const initHealthConnect = HealthConnect.initHealthConnect;
export const requestHealthPermissions = HealthConnect.requestHealthPermissions;
export const readHealthRecords = HealthConnect.readHealthRecords;
export const readHealthRecordsDetailed = HealthConnect.readHealthRecordsDetailed;
export const getSyncStartDate = HealthConnect.getSyncStartDate;

export const aggregateByDay = HealthConnectAggregation.aggregateByDay;

// Android does not have a basal-energy aggregation equivalent; display uses RAW_FORMATTERS instead.
export const getAggregatedBasalEnergyByDate = async (_start: Date, _end: Date): Promise<AggregatedHealthRecord[]> => [];
export const getAggregatedBasalEnergyByDateDetailed = async (_start: Date, _end: Date): Promise<{ records: AggregatedHealthRecord[]; error?: string }> => ({ records: [] });

// Android has no native min-max-avg day-statistics read; returning null routes every
// min-max-avg metric down the raw-record path (same pattern as the basal-energy stubs).
export const readMinMaxAvgByDayDetailed = async (
  _metric: MetricConfig,
  _start: Date,
  _end: Date,
): Promise<{ records: TransformedRecord[]; error?: string } | null> => null;

export const getAggregatedStepsByDate = HealthConnect.getAggregatedStepsByDate;
export const getAggregatedStepsByDateDetailed = HealthConnect.getAggregatedStepsByDateDetailed;
export const getAggregatedActiveCaloriesByDate = HealthConnect.getAggregatedActiveCaloriesByDate;
export const getAggregatedActiveCaloriesByDateDetailed = HealthConnect.getAggregatedActiveCaloriesByDateDetailed;
export const getAggregatedTotalCaloriesByDate = HealthConnect.getAggregatedTotalCaloriesByDate;
export const getAggregatedTotalCaloriesByDateDetailed = HealthConnect.getAggregatedTotalCaloriesByDateDetailed;
export const getAggregatedDistanceByDate = HealthConnect.getAggregatedDistanceByDate;
export const getAggregatedDistanceByDateDetailed = HealthConnect.getAggregatedDistanceByDateDetailed;
export const getAggregatedFloorsClimbedByDate = HealthConnect.getAggregatedFloorsClimbedByDate;
export const getAggregatedFloorsClimbedByDateDetailed = HealthConnect.getAggregatedFloorsClimbedByDateDetailed;

export { healthReadProvider, readCumulativeByDay };

export const alignToLocalDayStart = HealthConnect.alignToLocalDayStart;

// Android handles sleep aggregation in its transformation layer, so this is a passthrough
export const aggregateSleepSessions = (records: unknown[]): unknown[] => records;

// Exercise sessions are enriched with active/total calories and distance via native
// aggregateRecord over the session window (scoped to the session's data origin).
export const enrichExerciseSessions = HealthConnect.enrichExerciseSessions;

export const transformHealthRecords = HealthConnectTransformation.transformHealthRecords;

export const saveHealthPreference = HealthConnectPreferences.saveHealthPreference;
export const loadHealthPreference = HealthConnectPreferences.loadHealthPreference;
export const saveStringPreference = HealthConnectPreferences.saveStringPreference;
export const loadStringPreference = HealthConnectPreferences.loadStringPreference;
export const saveSyncDuration = HealthConnectPreferences.saveSyncDuration;
export const loadSyncDuration = HealthConnectPreferences.loadSyncDuration;
export const refreshEnabledMetricPermissions = async (
  healthMetricStates: HealthMetricStates,
): Promise<boolean> =>
  migrateEnabledMetricPermissionsIfNeeded({
    healthMetricStates,
    metrics: HEALTH_METRICS,
    loadHealthPreference,
    saveHealthPreference,
    requestHealthPermissions,
    logTag: '[HealthConnectService]',
  });

// Locked-device detection stubs for Android (iOS-only feature)
export const resetDatabaseInaccessibleCount = (): void => {};
export const getDatabaseInaccessibleCount = (): number => 0;

// Background delivery stubs for Android (iOS-only feature)
export const enableBackgroundDeliveryForMetric = async (_recordType: string): Promise<void> => {};
export const disableBackgroundDeliveryForMetric = async (_recordType: string): Promise<void> => {};
export const setupBackgroundDeliveryForEnabledMetrics = async (): Promise<void> => {};
export const subscribeToEnabledMetricChanges = (_onDataAvailable: () => void): (() => void) => () => {};
export const refreshSubscriptions = (): void => {};
export const cleanupAllSubscriptions = (): void => {};
export const disableAllBackgroundDelivery = async (): Promise<boolean> => true;
export const startObservers = (_onDataAvailable: () => void): void => {};
export const stopObservers = (): void => {};

export const syncHealthData = (
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates = {},
): Promise<SyncResult> =>
  runForegroundSync(healthReadProvider, syncDuration, healthMetricStates, {
    logTag: '[HealthConnectService]',
    emptyMessage: 'No health data to sync.',
    timeoutLabelPrefix: 'Health Connect query',
  });
