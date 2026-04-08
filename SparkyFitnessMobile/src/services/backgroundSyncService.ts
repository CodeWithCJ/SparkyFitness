import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { syncHealthData, HealthDataPayload } from './api/healthDataApi';
import { addLog, _flushBuffer } from './LogService';
import { HEALTH_METRICS } from '../HealthMetrics';
import {
  loadHealthPreference,
  readHealthRecords,
  transformHealthRecords,
  aggregateSleepSessions,
  aggregateByDay,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  getAggregatedTotalCaloriesByDate,
  getAggregatedDistanceByDate,
  getAggregatedFloorsClimbedByDate,
  resetDatabaseInaccessibleCount,
  getDatabaseInaccessibleCount,
} from './healthConnectService';
import type { TransformedRecord } from '../types/healthRecords';
import { loadLastSyncedTime, saveLastSyncedTime, loadBackgroundSyncEnabled } from './storage';
import { runTasksInBatches, withTimeout, TimeoutError } from '../utils/concurrency';

const METRIC_FETCH_CONCURRENCY = 3;
const METRIC_TIMEOUT_MS = 60_000; // 60s per metric query

const BACKGROUND_TASK_NAME = 'healthDataSync';

// Health records (sleep, workouts, etc.) can arrive in HealthKit/Health Connect hours
// after the event. We overlap session queries by this amount so late-arriving records
// whose event timestamps fall before lastSyncedTime are still picked up. The server
// upserts by record identity, so duplicates are harmless.
const SESSION_OVERLAP_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fetches and transforms a single health metric for background sync.
 * Cumulative metrics use the aggregation API; others read raw records.
 */
async function processBackgroundMetric(
  metric: (typeof HEALTH_METRICS)[number],
  aggregatedStartDate: Date,
  sessionStartDate: Date,
  endDate: Date,
): Promise<HealthDataPayload> {
  const type = metric.recordType;
  let dataToTransform: unknown[] = [];

  // Cumulative metrics use the aggregation API (handles deduplication)
  if (type === 'Steps') {
    dataToTransform = await getAggregatedStepsByDate(aggregatedStartDate, endDate);
  } else if (type === 'ActiveCaloriesBurned') {
    dataToTransform = await getAggregatedActiveCaloriesByDate(aggregatedStartDate, endDate);
  } else if (type === 'TotalCaloriesBurned') {
    dataToTransform = await getAggregatedTotalCaloriesByDate(aggregatedStartDate, endDate);
  } else if (type === 'Distance') {
    dataToTransform = await getAggregatedDistanceByDate(aggregatedStartDate, endDate);
  } else if (type === 'FloorsClimbed') {
    dataToTransform = await getAggregatedFloorsClimbedByDate(aggregatedStartDate, endDate);
  } else {
    // All other metrics: read raw records
    const rawRecords = await readHealthRecords(type, sessionStartDate, endDate);
    if (!rawRecords || rawRecords.length === 0) return [];
    dataToTransform = rawRecords;

    // Post-read aggregation for specific types
    if (type === 'SleepSession') {
      dataToTransform = aggregateSleepSessions(rawRecords);
    }
  }

  const transformed = transformHealthRecords(dataToTransform, metric);
  if (transformed.length === 0) return [];

  if (metric.aggregationStrategy) {
    const aggregated = aggregateByDay(
      transformed as TransformedRecord[],
      metric.type,
      metric.unit,
      metric.aggregationStrategy,
    );
    return aggregated as HealthDataPayload;
  }

  return transformed as HealthDataPayload;
}

// Guard against overlapping syncs from concurrent triggers (background task,
// manual trigger, HealthKit observer). Second caller awaits the in-flight run.
let inflightSync: Promise<void> | null = null;

export const performBackgroundSync = async (taskId: string): Promise<void> => {
  if (inflightSync) {
    addLog(`[Background Sync] Sync already in progress, waiting for it to finish (triggered by ${taskId})`, 'DEBUG');
    return inflightSync;
  }

  inflightSync = performBackgroundSyncInternal(taskId).finally(() => {
    inflightSync = null;
  });
  return inflightSync;
};

const performBackgroundSyncInternal = async (taskId: string): Promise<void> => {
  console.log('[BackgroundSync] taskId', taskId);
  addLog(`[Background Sync] Starting background sync task: ${taskId}`, 'INFO');

  const now = new Date();
  const lastSyncedTimeStr = await loadLastSyncedTime();
  const lastSyncedDate = lastSyncedTimeStr ? new Date(lastSyncedTimeStr) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  addLog(`[Background Sync] Last synced: ${lastSyncedTimeStr ?? 'never (defaulting to 24h ago)'}`, 'DEBUG');
  const endDate = now;

  // Session metrics use an overlap window to catch late-arriving records whose
  // event timestamps predate lastSyncedTime (e.g. overnight sleep synced next morning).
  const sessionStartDate = new Date(lastSyncedDate.getTime() - SESSION_OVERLAP_MS);

  // Aggregated metrics (steps, calories) produce per-day totals. Use start-of-day
  // so we always send complete daily values rather than partial-window slices.
  const aggregatedStartDate = new Date(sessionStartDate);
  aggregatedStartDate.setHours(0, 0, 0, 0);

  addLog(`[Background Sync] Syncing sessions from ${sessionStartDate.toISOString()}, aggregated from ${aggregatedStartDate.toISOString()} to ${endDate.toISOString()}`, 'DEBUG');

  const allData: HealthDataPayload = [];
  const collectedCounts: string[] = [];
  let syncErrors = 0;
  let enabledMetricCount = 0;

  resetDatabaseInaccessibleCount();

  // Filter to enabled metrics first (preferences are fast AsyncStorage reads)
  const enabledMetrics: (typeof HEALTH_METRICS)[number][] = [];
  for (const metric of HEALTH_METRICS) {
    const isEnabled = await loadHealthPreference<boolean>(metric.preferenceKey);
    if (isEnabled) {
      enabledMetrics.push(metric);
    }
  }
  enabledMetricCount = enabledMetrics.length;
  addLog(`[Background Sync] Found ${enabledMetricCount} enabled metrics`, 'INFO');

  if (enabledMetricCount === 0) {
    await addLog('[Background Sync] No metrics enabled — nothing to sync', 'INFO');
    return;
  }

  const results = await runTasksInBatches(
    enabledMetrics,
    METRIC_FETCH_CONCURRENCY,
    metric => withTimeout(
      processBackgroundMetric(metric, aggregatedStartDate, sessionStartDate, endDate),
      METRIC_TIMEOUT_MS,
      `Background query for ${metric.recordType}`,
    ),
    {
      stopOnError: error => error instanceof TimeoutError,
    },
  );

  let hasTimeouts = false;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const metric = enabledMetrics[i];

    if (result.status === 'skipped') {
      syncErrors++;
      hasTimeouts = true;
      addLog(
        `[Background Sync] Skipping ${metric.label} because an earlier metric timed out; will retry next cycle`,
        'WARNING',
      );
    } else if (result.status === 'fulfilled') {
      if (result.value.length > 0) {
        allData.push(...result.value);
        collectedCounts.push(`${metric.id}: ${result.value.length}`);
      }
    } else {
      syncErrors++;
      if (result.reason instanceof TimeoutError) {
        hasTimeouts = true;
      }
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      addLog(`[Background Sync] Error syncing ${metric.label}: ${message}`, 'ERROR');
    }
  }

  const inaccessibleCount = getDatabaseInaccessibleCount();

  if (inaccessibleCount > 0 && allData.length === 0) {
    await addLog(
      `[Background Sync] Device appears locked — ${inaccessibleCount} HealthKit query(s) returned database inaccessible ` +
      `(${enabledMetricCount} metric(s) enabled). Skipping timestamp update; will retry next cycle.`,
      'WARNING'
    );
    return;
  }

  if (inaccessibleCount > 0) {
    addLog(
      `[Background Sync] Partial data collected — ${inaccessibleCount} query(s) hit database inaccessible, ` +
      `but ${allData.length} records were still collected. Proceeding with sync.`,
      'WARNING'
    );
  }

  if (allData.length > 0) {
    addLog(`[Background Sync] Collected ${allData.length} records (${collectedCounts.join(', ')})`, 'DEBUG');
    addLog(`[Background Sync] Sending ${allData.length} records to server`, 'INFO');
    await syncHealthData(allData);

    if (hasTimeouts) {
      addLog(
        '[Background Sync] Skipping timestamp update — metric(s) timed out, will retry from same window',
        'WARNING',
      );
    } else {
      await saveLastSyncedTime();
    }

    await addLog(`[Background Sync] Sync completed successfully${syncErrors > 0 ? ` (${syncErrors} metric(s) had errors)` : ''}`, 'SUCCESS');
  } else {
    await addLog(`[Background Sync] No health data collected to sync${syncErrors > 0 ? ` (${syncErrors} metric(s) had errors)` : ''}`, 'INFO');
  }
};

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  addLog('[Background Sync] Task invoked by OS', 'INFO');
  try {
    await performBackgroundSync(BACKGROUND_TASK_NAME);
    // Flush logs before returning — iOS may suspend the app immediately after
    // the task completes, before the 5-second flush timer fires.
    await _flushBuffer();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(`[Background Sync] Task failed: ${message}`, 'ERROR');
    await _flushBuffer();
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export const configureBackgroundSync = async (): Promise<void> => {
  try {
    const enabled = await loadBackgroundSyncEnabled();
    if (!enabled) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME).catch(() => {});
      addLog('[Background Sync] Background sync disabled, task unregistered', 'INFO');
      return;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: 240, // minutes; Android respects this roughly, iOS treats it as a hint
    });
    // const status = await BackgroundTask.getStatusAsync();
    // // if (status === BackgroundTask.BackgroundTaskStatus.Available) {
    // //   addLog('[Background Sync] Background task registered successfully', 'INFO');
    // // } else {
    // //   addLog('[Background Sync] Background task registration skipped (restricted environment)', 'WARNING');
    // // }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Failed to register background task: ${message}`, 'ERROR');
  }
};

export const stopBackgroundSync = async (): Promise<void> => {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    addLog('[Background Sync] Background task unregistered', 'INFO');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Background task failed to stop: ${message}`, 'ERROR');
  }
};

export const triggerManualSync = async (): Promise<void> => {
  addLog('[Background Sync] Manual sync triggered', 'INFO');
  await performBackgroundSync('manual-sync');
};
