import { currentAppSource } from '@kingstinct/react-native-healthkit';
import * as HealthKit from './healthkit/index';
import * as HealthKitAggregation from './healthkit/dataAggregation';
import * as HealthKitTransformation from './healthkit/dataTransformation';
import * as HealthKitPreferences from './healthkit/preferences';
import * as api from './api/healthDataApi';
import { HealthDataPayload } from './api/healthDataApi';
import { HEALTH_METRICS } from '../HealthMetrics';
import { addLog } from './LogService';
import {
  SyncResult,
  HealthMetricStates,
  type TransformedRecord,
} from '../types/healthRecords';
import { SyncDuration } from './healthkit/preferences';
import { migrateEnabledMetricPermissionsIfNeeded } from './shared/healthPermissionMigration';
import { runTasksInBatches, TimeoutError, withTimeout } from '../utils/concurrency';
import { runWriteback } from './writeback';

const METRIC_FETCH_CONCURRENCY = 3;
const METRIC_TIMEOUT_MS = 60_000; // 60s per metric query

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

export const alignToLocalDayStart = (date: Date): Date => {
  const aligned = new Date(date);
  aligned.setHours(0, 0, 0, 0);
  return aligned;
};

// Nutrition's day-aligned rolling lookback (see processMetric). Independent of the
// requested sync window so retroactively-logged meals — event time in the past, entered
// today — are still picked up. Nutrition-scoped; idempotent via (source, source_id) upsert.
const NUTRITION_LOOKBACK_DAYS = 2;

const nutritionLookbackStart = (endDate: Date): Date =>
  alignToLocalDayStart(new Date(endDate.getTime() - NUTRITION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));

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

export const aggregateSleepSessions = HealthKitAggregation.aggregateSleepSessions;

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

interface MetricResult {
  data: HealthDataPayload;
  error?: { type: string; error: string };
}

const metricReadError = (
  type: string,
  error?: string,
): MetricResult['error'] => error ? { type, error } : undefined;

async function processMetric(
  type: string,
  startDate: Date,
  endDate: Date,
): Promise<MetricResult> {
  const metricConfig = HEALTH_METRICS.find(m => m.recordType === type);
  if (!metricConfig) {
    addLog(`[HealthKitService] No metric configuration found for record type: ${type}`, 'WARNING');
    return { data: [] };
  }

  let dataToTransform: unknown[] = [];
  let error: MetricResult['error'];

  // For cumulative metrics, use aggregation API directly (handles deduplication).
  // Partial results are still transformed; the read error rides along in syncErrors.
  if (type === 'Steps') {
    const result = await HealthKit.getAggregatedStepsByDateDetailed(startDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'ActiveCaloriesBurned') {
    const result = await HealthKit.getAggregatedActiveCaloriesByDateDetailed(startDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'Distance') {
    const result = await HealthKit.getAggregatedDistanceByDateDetailed(startDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'FloorsClimbed') {
    const result = await HealthKit.getAggregatedFloorsClimbedByDateDetailed(startDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'TotalCaloriesBurned') {
    const result = await HealthKit.getAggregatedTotalCaloriesByDateDetailed(startDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else if (type === 'BasalMetabolicRate') {
    // iOS BMR override source: last-complete-day Resting Energy, stamped with the day it
    // applies to (D+1). Emits aggregated { date, value, type: 'basal_metabolic_rate' }
    // records, which transformHealthRecords normalizes (adds unit + source) like the other
    // aggregated metrics below.
    const result = await HealthKit.getAggregatedBasalEnergyByDateDetailed(startDate, endDate);
    dataToTransform = result.records;
    error = metricReadError(type, result.error);
  } else {
    // min-max-avg metrics with a verified native day-statistics spec skip the raw sample
    // path entirely. The stats window is day-aligned even for the rolling '24h' duration,
    // so a mid-afternoon sync recomputes yesterday's min/max/avg from the FULL day instead
    // of overwriting full-day server values with a partial-window slice.
    if (metricConfig.aggregationStrategy === 'min-max-avg') {
      const statsResult = await HealthKit.readMinMaxAvgByDayDetailed(
        metricConfig,
        alignToLocalDayStart(startDate),
        endDate,
      );
      if (statsResult) {
        // Already day-aggregated — return before the aggregateByDay tail below, which
        // would re-aggregate min-of-{min,max,avg} under the same type names.
        return {
          data: statsResult.records as HealthDataPayload,
          error: metricReadError(type, statsResult.error),
        };
      }
      // No verified spec — fall through to the raw sample path with the ORIGINAL window.
    }

    // For other types, read raw records. Nutrition is frequently logged after the fact,
    // so it widens to a day-aligned rolling lookback (or keeps the requested window if
    // that already reaches further back). Idempotent: nutrition upserts by (source,
    // source_id), so re-reading the same correlations every sync is free server-side.
    const rawStartDate = type === 'Nutrition'
      ? new Date(Math.min(startDate.getTime(), nutritionLookbackStart(endDate).getTime()))
      : startDate;
    const result = await HealthKit.readHealthRecordsDetailed(type, rawStartDate, endDate);
    const rawRecords = result.records;
    error = metricReadError(type, result.error);

    if (!rawRecords || rawRecords.length === 0) {
      return { data: [], error };
    }

    dataToTransform = rawRecords;

    if (type === 'SleepSession') {
      dataToTransform = HealthKitAggregation.aggregateSleepSessions(
        rawRecords as Parameters<typeof HealthKitAggregation.aggregateSleepSessions>[0]
      );
    }
  }

  const transformed = HealthKitTransformation.transformHealthRecords(dataToTransform, metricConfig);

  if (metricConfig.aggregationStrategy) {
    const aggregated = HealthKitAggregation.aggregateByDay(
      transformed as TransformedRecord[],
      metricConfig.type,
      metricConfig.unit,
      metricConfig.aggregationStrategy,
    );
    return { data: aggregated as HealthDataPayload, error };
  }

  return { data: transformed as HealthDataPayload, error };
}

export const syncHealthData = async (
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates = {}
): Promise<SyncResult> => {
  const startDate = HealthKit.getSyncStartDate(syncDuration);
  const endDate = new Date();

  const enabledMetricStates = healthMetricStates && typeof healthMetricStates === 'object' ? healthMetricStates : {};
  const healthDataTypesToSync = HEALTH_METRICS
    .filter(metric => enabledMetricStates[metric.stateKey])
    .map(metric => metric.recordType);

  const allTransformedData: HealthDataPayload = [];
  const syncErrors: { type: string; error: string }[] = [];

  const results = await runTasksInBatches(
    healthDataTypesToSync,
    METRIC_FETCH_CONCURRENCY,
    type => withTimeout(
      processMetric(type, startDate, endDate),
      METRIC_TIMEOUT_MS,
      `HealthKit query for ${type}`,
    ),
    {
      stopOnError: error => error instanceof TimeoutError,
    },
  );

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const type = healthDataTypesToSync[index];

    if (result.status === 'skipped') {
      const message = 'Skipped because an earlier metric query timed out.';
      addLog(`[HealthKitService] Skipping ${type}: ${message}`, 'WARNING');
      syncErrors.push({ type, error: message });
      continue;
    }

    if (result.status === 'fulfilled') {
      if (result.value.data.length > 0) {
        allTransformedData.push(...result.value.data);
      }
      if (result.value.error) {
        syncErrors.push(result.value.error);
      }
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      addLog(`[HealthKitService] Error processing ${type}: ${message}`, 'ERROR');
      syncErrors.push({ type, error: message });
    }
  }

  // Outbound phase: SparkyFitness diary → HealthKit. Runs before the inbound result
  // is returned, in its own try/catch so a writeback failure never affects the inbound
  // sync outcome.
  try {
    await runWriteback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Writeback phase failed: ${message}`, 'ERROR');
  }

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      return {
        success: true,
        apiResponse,
        syncErrors,
        uploadErrors: apiResponse?.recordErrors ?? [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[HealthKitService] Error sending data to server: ${message}`, 'ERROR');
      return { success: false, error: message, syncErrors };
    }
  } else {
    return { success: true, message: "No new health data to sync.", syncErrors };
  }
};
