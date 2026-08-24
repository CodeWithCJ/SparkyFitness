import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { AppState } from 'react-native';
import { syncHealthData, HealthDataPayload } from './api/healthDataApi';
import { runWriteback } from './writeback';
import { addLog, _flushBuffer } from './LogService';
import { HEALTH_METRICS } from '../HealthMetrics';
import {
  loadHealthPreference,
  healthReadProvider,
  resetDatabaseInaccessibleCount,
  getDatabaseInaccessibleCount,
  getClientUnavailableCount,
} from './healthConnectService';
import { collectHealthData, sessionTelemetryOutcomesUsable } from './shared/healthSyncEngine';
import { markEnrichedSessions } from './shared/enrichedSessionCache';
import { buildBackgroundWindows, MAX_BACKGROUND_LOOKBACK_DAYS } from '../utils/syncUtils';
import {
  loadLastSyncedTime,
  saveLastSyncedTime,
  loadBackgroundSyncEnabled,
  savePendingHealthSyncCacheRefresh,
  consumePendingHealthSyncCacheRefresh,
} from './storage';
import { queryClient } from '../hooks/queryClient';
import { refreshHealthSyncCache } from '../hooks/refreshHealthSyncCache';
import { isBackfillRunning, markSyncInFlight } from './autoSyncCoordinator';
import { listMedications, listEntries } from './api/medicationsApi';
import { reconcileMedicationReminders } from './medicationReminderService';
import { getTodayDate } from '../utils/dateUtils';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  BACKGROUND_TELEMETRY_BUDGET,
  createTelemetryRunContext,
  type TelemetryRunContext,
} from './shared/telemetryBudget';

const isAppActive = (): boolean => AppState.currentState === 'active';

const BACKGROUND_TASK_NAME = 'healthDataSync';

// Guard against overlapping syncs from concurrent triggers (background task,
// manual trigger, HealthKit observer). Second caller awaits the in-flight run.
let inflightSync: Promise<void> | null = null;

async function refreshHealthSyncCacheWhenActive() {
  if (isAppActive()) {
    refreshHealthSyncCache(queryClient);
    return;
  }

  await savePendingHealthSyncCacheRefresh();
  if (isAppActive()) {
    await flushPendingHealthSyncCacheRefresh();
  }
}

export const flushPendingHealthSyncCacheRefresh = async (): Promise<boolean> => {
  if (!isAppActive()) {
    return false;
  }

  const shouldRefresh = await consumePendingHealthSyncCacheRefresh();
  if (!shouldRefresh) {
    return false;
  }

  refreshHealthSyncCache(queryClient);
  return true;
}

export const performBackgroundSync = async (taskId: string): Promise<void> => {
  if (inflightSync) {
    addLog(`[Background Sync] Sync already in progress, waiting for it to finish (triggered by ${taskId})`, 'DEBUG');
    return inflightSync;
  }

  const syncDone = markSyncInFlight();
  inflightSync = performBackgroundSyncInternal(taskId).finally(() => {
    inflightSync = null;
    syncDone();
  });
  return inflightSync;
};

/**
 * taskId 'manual-sync' is triggerManualSync — a user explicitly tapping a
 * button while looking at the app (currently only the Dev Tools "Trigger
 * Sync" action). Everything else that reaches this function (the real OS
 * background task, and the iOS 'healthkit-observer' silent-delivery callback)
 * runs with no user present and must stay capped/non-interactive: a route
 * consent dialog cannot be shown headless, and an unbounded per-workout
 * telemetry read has no time budget to respect.
 */
const isForegroundTriggeredSync = (taskId: string): boolean =>
  taskId === 'manual-sync';

const performBackgroundSyncInternal = async (taskId: string): Promise<void> => {
  if (isBackfillRunning()) {
    addLog(`[Background Sync] Skipping ${taskId} — history import is running`, 'INFO');
    return;
  }

  addLog(`[Background Sync] Starting background sync task: ${taskId}`, 'INFO');

  // Limits are carried per run rather than via module state so a capped
  // headless run overlapping a foreground sync cannot strip the foreground
  // run's budget or its route-consent UI; see telemetryBudget.ts. Foreground
  // triggers get no cap and may show UI (the user is present to answer a route
  // consent prompt); everything else is capped and headless.
  const telemetry = isForegroundTriggeredSync(taskId)
    ? createTelemetryRunContext()
    : createTelemetryRunContext({
        budget: BACKGROUND_TELEMETRY_BUDGET,
        interactive: false,
      });
  await runBackgroundSync(taskId, telemetry);
};

const runBackgroundSync = async (taskId: string, telemetry: TelemetryRunContext): Promise<void> => {
  const lastSyncedTimeStr = await loadLastSyncedTime();
  addLog(`[Background Sync] Last synced: ${lastSyncedTimeStr ?? 'never (defaulting to 24h ago)'}`, 'INFO');

  // Session reads use the cursor minus a 6h overlap so late-arriving records are
  // still picked up; day-aggregated reads align to start-of-day so complete daily
  // values are sent, never partial-window slices (see buildBackgroundWindows).
  const windows = buildBackgroundWindows(lastSyncedTimeStr);

  addLog(`[Background Sync] Syncing sessions from ${windows.sessionStart.toISOString()}, aggregated from ${windows.aggregatedStart.toISOString()} to ${windows.end.toISOString()}`, 'INFO');

  // The clamp stops a stuck cursor from widening the window every cycle until
  // it can never finish, but the span it drops is genuinely not read by the
  // background task — say so rather than silently skipping it (#2191).
  if (windows.clampedFrom) {
    const skippedDays = Math.round(
      (windows.sessionStart.getTime() - windows.clampedFrom.getTime()) / (24 * 60 * 60 * 1000),
    );
    addLog(
      `[Background Sync] Last sync was ${MAX_BACKGROUND_LOOKBACK_DAYS}+ days ago — reading only the last ` +
      `${MAX_BACKGROUND_LOOKBACK_DAYS} days. About ${skippedDays} earlier day(s) ` +
      `(${windows.clampedFrom.toISOString()} to ${windows.sessionStart.toISOString()}) are NOT covered here. ` +
      `Run History Import, or a manual sync with a wider time range, to bring them in.`,
      'WARNING',
    );
  }

  const allData: HealthDataPayload = [];
  const collectedCounts: string[] = [];
  let syncErrors = 0;

  resetDatabaseInaccessibleCount();

  // Filter to enabled metrics first (preferences are fast AsyncStorage reads)
  const enabledMetrics: (typeof HEALTH_METRICS)[number][] = [];
  for (const metric of HEALTH_METRICS) {
    const isEnabled = await loadHealthPreference<boolean>(metric.preferenceKey);
    if (isEnabled) {
      enabledMetrics.push(metric);
    }
  }
  const enabledMetricCount = enabledMetrics.length;
  addLog(`[Background Sync] Found ${enabledMetricCount} enabled metrics`, 'INFO');

  if (enabledMetricCount === 0) {
    await addLog('[Background Sync] No metrics enabled — nothing to sync', 'INFO');
    return;
  }

  const outcomes = await collectHealthData(healthReadProvider, enabledMetrics, windows, {
    timeoutLabelPrefix: 'Background query',
    telemetry,
  });

  // Staged telemetry keys are only committable when the session read itself
  // completed; see sessionTelemetryOutcomesUsable.
  const telemetryUsable = sessionTelemetryOutcomesUsable(outcomes);

  for (const outcome of outcomes) {
    const metric = outcome.metric;

    if (outcome.status === 'skipped') {
      syncErrors++;
      addLog(
        `[Background Sync] Skipping ${metric.defaultLabel} because an earlier metric timed out; will retry next cycle`,
        'WARNING',
      );
    } else if (outcome.status === 'fulfilled') {
      if (outcome.data.length > 0) {
        // Per-record push: spreading a day of per-sample records (e.g.
        // continuous heart rate) into one call can exceed the engine's
        // argument limit and throw RangeError.
        for (const record of outcome.data) {
          allData.push(record);
        }
        collectedCounts.push(`${metric.id}: ${outcome.data.length}`);
      }
      if (outcome.error) {
        syncErrors++;
        addLog(
          `[Background Sync] ${metric.defaultLabel} completed with read errors: ${outcome.error}`,
          'WARNING',
        );
      }
    } else {
      syncErrors++;
      addLog(`[Background Sync] Error syncing ${metric.defaultLabel}: ${outcome.error}`, 'ERROR');
    }
  }

  const inaccessibleCount = getDatabaseInaccessibleCount();

  // One line for the whole run instead of one error per metric. The reads
  // already surfaced errors, which hold the cursor — this just makes the cause
  // legible in the exported diagnostic (#2191).
  const clientUnavailableCount = getClientUnavailableCount();
  if (clientUnavailableCount > 0) {
    addLog(
      `[Background Sync] Health Connect was unavailable for ${clientUnavailableCount} metric read(s) ` +
      `(the client disconnects when the app is backgrounded or the provider updates). ` +
      `Reconnect was attempted once; unread metrics hold the sync timestamp and retry next cycle.`,
      'WARNING',
    );
  }

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
    addLog(`[Background Sync] Collected ${allData.length} records (${collectedCounts.join(', ')})`, 'INFO');
    addLog(`[Background Sync] Sending ${allData.length} records to server`, 'INFO');
    const uploadSummary = await syncHealthData(allData);
    // Only a fully accepted upload commits the telemetry reuse cache; see the
    // invariant on markEnrichedSessions.
    if (telemetryUsable && (uploadSummary?.recordErrors?.length ?? 0) === 0) {
      await markEnrichedSessions(telemetry.drainCollected());
    }
    await refreshHealthSyncCacheWhenActive();

    if (syncErrors > 0) {
      addLog(
        `[Background Sync] Skipping timestamp update — ${syncErrors} metric(s) had errors, will retry from same window`,
        'WARNING',
      );
    } else {
      await saveLastSyncedTime();
    }

    await addLog(`[Background Sync] Sync completed successfully${syncErrors > 0 ? ` (${syncErrors} metric(s) had errors)` : ''}`, 'INFO');
  } else {
    await addLog(`[Background Sync] No health data collected to sync${syncErrors > 0 ? ` (${syncErrors} metric(s) had errors)` : ''}`, 'INFO');
  }

  // Outbound phase: SparkyFitness diary → OS health store (Health Connect on
  // Android, HealthKit on iOS; resolved via ./writeback). Runs regardless of
  // inbound results and in its own try/catch so a writeback failure never affects
  // the inbound sync or its cursor above.
  try {
    await runWriteback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(`[Background Sync] Writeback phase failed: ${message}`, 'ERROR');
  }

  // Reconcile medication reminders against fresh server schedules. With
  // reminders disabled the fetches are skipped but the reconcile still runs
  // so any pending reminders get cancelled.
  try {
    const prefs = useAppPreferencesStore.getState();
    const remindersActive = prefs.medicationRemindersEnabled && prefs.notificationsEnabled;
    const today = getTodayDate();
    const [medications, entries] = remindersActive
      ? await Promise.all([
          listMedications({ activeOnly: true }),
          listEntries({ fromDate: today, toDate: today }),
        ])
      : [[], []];
    await reconcileMedicationReminders(medications, entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(`[Background Sync] Medication reminder reconciliation failed: ${message}`, 'ERROR');
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
      // Disabled temporarily due to log flooding
      // addLog('[Background Sync] Background sync disabled, task unregistered', 'DEBUG');
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
