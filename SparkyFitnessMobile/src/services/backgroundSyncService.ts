import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import type { FeatureChoicesResponse } from '@workspace/shared';
import { registerAllOutboxHandlers } from '../offline/handlers';
import { drainOutbox } from '../offline/syncEngine';
import { accountGeneration as currentAccountGeneration } from '../offline/accountGeneration';
import { remindAboutLongWaitingUploads } from '../offline/waitingReminder';
import { AppState, Platform } from 'react-native';
import { syncHealthData, HealthDataPayload } from './api/healthDataApi';
import { runWriteback } from './writeback';
import { addLog, _flushBuffer } from './LogService';
import { HEALTH_METRICS } from '../HealthMetrics';
import {
  initHealthConnect,
  loadHealthPreference,
  healthReadProvider,
  resetDatabaseInaccessibleCount,
  getDatabaseInaccessibleCount,
  getClientUnavailableCount,
} from './healthConnectService';
import {
  collectHealthData,
  sessionTelemetryOutcomesUsable,
  runSerializedSync,
} from './shared/healthSyncEngine';
import { markEnrichedSessions } from './shared/enrichedSessionCache';
import {
  buildBackgroundWindows,
  MAX_BACKGROUND_LOOKBACK_DAYS,
} from '../utils/syncUtils';
import {
  loadLastSyncedTime,
  saveLastSyncedTime,
  loadBackgroundSyncEnabled,
  savePendingHealthSyncCacheRefresh,
  consumePendingHealthSyncCacheRefresh,
  getActiveServerConfigId,
} from './storage';
import { queryClient } from '../hooks/queryClient';
import { featureChoicesQueryKey } from '../hooks/queryKeys';
import { refreshHealthSyncCache } from '../hooks/refreshHealthSyncCache';
import { isBackfillRunning, markSyncInFlight } from './autoSyncCoordinator';
import { listMedications, listEntries } from './api/medicationsApi';
import { fetchFeatureChoices } from './api/featureChoicesApi';
import {
  cancelMedicationRemindersOfOtherServers,
  reconcileMedicationReminders,
} from './medicationReminderService';
import { retryPendingMedicationActions } from './medicationNotificationHandler';
import { reconcileOralCareReminders } from './oralCareReminderService';
import { ensureI18nInitialized } from '../localization/i18n';
import { featureOnState, type FeatureOnState } from '../utils/featureOnState';
import { getTodayDate } from '../utils/dateUtils';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  BACKGROUND_TELEMETRY_BUDGET,
  createTelemetryRunContext,
  type TelemetryRunContext,
} from './shared/telemetryBudget';
import { refreshAndroidWidgetsFromServer } from './androidWidgetSyncService';

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

export const flushPendingHealthSyncCacheRefresh =
  async (): Promise<boolean> => {
    if (!isAppActive()) {
      return false;
    }

    const shouldRefresh = await consumePendingHealthSyncCacheRefresh();
    if (!shouldRefresh) {
      return false;
    }

    refreshHealthSyncCache(queryClient);
    return true;
  };

export const performBackgroundSync = async (taskId: string): Promise<void> => {
  if (inflightSync) {
    addLog(
      `[Background Sync] Sync already in progress, waiting for it to finish (triggered by ${taskId})`,
      'DEBUG'
    );
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
    addLog(
      `[Background Sync] Skipping ${taskId} — history import is running`,
      'INFO'
    );
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
  // Once per run, whatever the health sync did: it returns early with no
  // metric on, when the health provider cannot start, on a locked device and
  // after an account change, and the reminders follow the feature switches
  // all the same.
  try {
    await reconcileRemindersInBackground();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      `[Background Sync] Reminder reconciliation failed: ${message}`,
      'ERROR'
    );
  }
  // Best effort: the OS decides when this task runs, so uploads of work
  // logged offline also go out on reconnect and when the app opens.
  registerAllOutboxHandlers();
  await drainOutbox('background');
  await remindAboutLongWaitingUploads().catch(() => undefined);
  if (Platform.OS === 'android') {
    try {
      await refreshAndroidWidgetsFromServer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(
        `[Background Sync] Android widget refresh failed: ${message}`,
        'ERROR'
      );
    }
  }
};

const runBackgroundSync = async (
  taskId: string,
  telemetry: TelemetryRunContext
): Promise<void> => {
  return runSerializedSync(async () => {
    const lastSyncedTimeStr = await loadLastSyncedTime();
    addLog(
      `[Background Sync] Last synced: ${lastSyncedTimeStr ?? 'never (defaulting to 24h ago)'}`,
      'INFO'
    );

    // Session reads use the cursor minus a 6h overlap so late-arriving records are
    // still picked up; day-aggregated reads align to start-of-day so complete daily
    // values are sent, never partial-window slices (see buildBackgroundWindows).
    const windows = buildBackgroundWindows(lastSyncedTimeStr);

    addLog(
      `[Background Sync] Syncing sessions from ${windows.sessionStart.toISOString()}, aggregated from ${windows.aggregatedStart.toISOString()} to ${windows.end.toISOString()}`,
      'INFO'
    );

    // The clamp stops a stuck cursor from widening the window every cycle until
    // it can never finish, but the span it drops is genuinely not read by the
    // background task — say so rather than silently skipping it (#2191).
    if (windows.clampedFrom) {
      const skippedDays = Math.round(
        (windows.sessionStart.getTime() - windows.clampedFrom.getTime()) /
          (24 * 60 * 60 * 1000)
      );
      addLog(
        `[Background Sync] Last sync was ${MAX_BACKGROUND_LOOKBACK_DAYS}+ days ago — reading only the last ` +
          `${MAX_BACKGROUND_LOOKBACK_DAYS} days. About ${skippedDays} earlier day(s) ` +
          `(${windows.clampedFrom.toISOString()} to ${windows.sessionStart.toISOString()}) are NOT covered here. ` +
          `Run History Import, or a manual sync with a wider time range, to bring them in.`,
        'WARNING'
      );
    }

    const allData: HealthDataPayload = [];
    const collectedCounts: string[] = [];
    let syncErrors = 0;

    resetDatabaseInaccessibleCount();

    // Filter to enabled metrics first (preferences are fast AsyncStorage reads)
    const enabledMetrics: (typeof HEALTH_METRICS)[number][] = [];
    for (const metric of HEALTH_METRICS) {
      const isEnabled = await loadHealthPreference<boolean>(
        metric.preferenceKey
      );
      if (isEnabled) {
        enabledMetrics.push(metric);
      }
    }
    const enabledMetricCount = enabledMetrics.length;
    addLog(
      `[Background Sync] Found ${enabledMetricCount} enabled metrics`,
      'INFO'
    );

    if (enabledMetricCount === 0) {
      await addLog(
        '[Background Sync] No metrics enabled — nothing to sync',
        'INFO'
      );
      return;
    }

    const healthConnectInitialized = await initHealthConnect();
    if (!healthConnectInitialized) {
      await addLog(
        '[Background Sync] Health provider initialization failed — skipping health reads and timestamp update; will retry next cycle. Check provider availability and health permissions in Settings.',
        'WARNING'
      );
      return;
    }

    const configId =
      typeof getActiveServerConfigId === 'function'
        ? await getActiveServerConfigId()
        : null;
    const runId =
      typeof healthReadProvider.beginRun === 'function'
        ? (healthReadProvider.beginRun(configId) ?? undefined)
        : undefined;

    try {
      const outcomes = await collectHealthData(
        healthReadProvider,
        enabledMetrics,
        windows,
        {
          timeoutLabelPrefix: 'Background query',
          telemetry,
          configId,
          runId,
        }
      );

      // Staged telemetry keys are only committable when the session read itself
      // completed; see sessionTelemetryOutcomesUsable.
      const telemetryUsable = sessionTelemetryOutcomesUsable(outcomes);

      for (const outcome of outcomes) {
        const metric = outcome.metric;

        if (outcome.status === 'skipped') {
          syncErrors++;
          addLog(
            `[Background Sync] Skipping ${metric.defaultLabel} because an earlier metric timed out; will retry next cycle`,
            'WARNING'
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
              'WARNING'
            );
          }
        } else {
          syncErrors++;
          addLog(
            `[Background Sync] Error syncing ${metric.defaultLabel}: ${outcome.error}`,
            'ERROR'
          );
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
          'WARNING'
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

      const currentConfigId =
        typeof getActiveServerConfigId === 'function'
          ? await getActiveServerConfigId()
          : null;
      if (currentConfigId !== configId) {
        healthReadProvider.cancelWaterDeletionRun?.(runId);
        await addLog(
          '[Background Sync] Active account changed during sync; aborted.',
          'WARNING'
        );
        return;
      }

      if (allData.length > 0) {
        addLog(
          `[Background Sync] Collected ${allData.length} records (${collectedCounts.join(', ')})`,
          'INFO'
        );
        addLog(
          `[Background Sync] Sending ${allData.length} records to server`,
          'INFO'
        );
        const uploadSummary = await syncHealthData(allData);
        // Only a fully accepted upload commits the telemetry reuse cache; see the
        // invariant on markEnrichedSessions.
        if ((uploadSummary?.recordErrors?.length ?? 0) === 0) {
          if (telemetryUsable) {
            await markEnrichedSessions(telemetry.drainCollected());
          }
          await healthReadProvider.commitRun?.(runId);
        }
        await refreshHealthSyncCacheWhenActive();

        if (syncErrors > 0) {
          addLog(
            `[Background Sync] Skipping timestamp update — ${syncErrors} metric(s) had errors, will retry from same window`,
            'WARNING'
          );
        } else {
          await saveLastSyncedTime();
        }

        await addLog(
          `[Background Sync] Sync completed successfully${syncErrors > 0 ? ` (${syncErrors} metric(s) had errors)` : ''}`,
          'INFO'
        );
      } else {
        await healthReadProvider.commitRun?.(runId);
        await addLog(
          `[Background Sync] No health data collected to sync${syncErrors > 0 ? ` (${syncErrors} metric(s) had errors)` : ''}`,
          'INFO'
        );
      }

      // Outbound phase: SparkyFitness diary → OS health store (Health Connect on
      // Android, HealthKit on iOS; resolved via ./writeback). Runs regardless of
      // inbound results and in its own try/catch so a writeback failure never affects
      // the inbound sync or its cursor above.
      try {
        await runWriteback();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await addLog(
          `[Background Sync] Writeback phase failed: ${message}`,
          'ERROR'
        );
      }
    } finally {
      if (runId != null) {
        healthReadProvider.cancelWaterDeletionRun?.(runId);
      }
    }
  });
};

/**
 * Whether a newer read of the feature choices than the one this run started at
 * `readStartedAt` says something else about `feature`: the app, running in
 * the same JS runtime (a HealthKit observer run, or a manual sync), learned
 * it meanwhile and reconciles the reminders itself. A headless run has an
 * empty query cache, so its own read stands.
 */
const featureStateChangedSince = (
  feature: 'medications' | 'oralCare',
  readStartedAt: number,
  featureState: FeatureOnState
): boolean => {
  const cached = queryClient.getQueryState<FeatureChoicesResponse | null>(
    featureChoicesQueryKey
  );
  if (!cached || cached.data === undefined) return false;
  if (cached.dataUpdatedAt <= readStartedAt) return false;
  return featureOnState(feature, cached.data) !== featureState;
};

/** One read of the feature choices, shared by the reminder passes of a run:
 * the answer (null from a server older than Features), or undefined with why
 * there is none. */
interface FeatureChoicesRead {
  response: FeatureChoicesResponse | null | undefined;
  failure: string;
  startedAt: number;
}

const readFeatureChoices = async (): Promise<FeatureChoicesRead> => {
  const startedAt = Date.now();
  try {
    return {
      response: await fetchFeatureChoices(),
      failure: 'empty answer',
      startedAt,
    };
  } catch (error) {
    return {
      response: undefined,
      failure: error instanceof Error ? error.message : String(error),
      startedAt,
    };
  }
};

/**
 * Reconciles the reminders that follow a feature switch (#3487): medication
 * and brushing reminders. The choices are read once, and only when either
 * kind of reminder is wanted; each pass runs even when the other fails.
 */
const reconcileRemindersInBackground = async (): Promise<void> => {
  const prefs = useAppPreferencesStore.getState();
  const medicationsWanted =
    prefs.medicationRemindersEnabled && prefs.notificationsEnabled;
  // With brushing reminders off, the app cancelled them when the setting
  // changed; nothing here schedules them.
  const brushingWanted =
    prefs.oralCareRemindersEnabled && prefs.notificationsEnabled;

  const logFailure = async (kind: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      `[Background Sync] ${kind} reminder reconciliation failed: ${message}`,
      'ERROR'
    );
  };

  if (!medicationsWanted) {
    // The fetches are skipped but the reconcile still runs, so any pending
    // reminders get cancelled.
    try {
      await reconcileMedicationReminders([], [], { active: false });
    } catch (error) {
      await logFailure('Medication', error);
    }
  }
  if (!medicationsWanted && !brushingWanted) return;
  // A run with the app closed has not set up i18n, so the reminders below
  // (and their Android channel names) would be written in English, or with
  // empty texts.
  await ensureI18nInitialized(prefs.languagePreference);

  // The medication passes are bound to the account signed in now and to the
  // server active now. One read before an account change (another server, or
  // another account on the same one) is dropped when it reaches the queue,
  // and one that runs after a switch to another server does nothing (an
  // unreadable id binds nothing). The reads below follow whichever account
  // is signed in when each one is sent, so the account is taken before them.
  const accountGeneration = currentAccountGeneration();
  let serverId: string | null | undefined;
  try {
    serverId =
      typeof getActiveServerConfigId === 'function'
        ? await getActiveServerConfigId()
        : undefined;
  } catch {
    serverId = undefined;
  }
  const read = await readFeatureChoices();

  if (medicationsWanted) {
    try {
      await reconcileMedicationRemindersInBackground(read, {
        accountGeneration,
        serverId,
      });
    } catch (error) {
      await logFailure('Medication', error);
    }
  }
  if (brushingWanted) {
    try {
      await reconcileBrushingRemindersInBackground(read, accountGeneration);
    } catch (error) {
      await logFailure('Brushing', error);
    }
  }
};

/**
 * Reconciles medication reminders against fresh server schedules, while the
 * reminder preferences want them. Medications turned off in Settings →
 * Features (#3487) cancels them. When the choices cannot be read the active
 * server's reminders are left exactly as they are: a run that cannot tell
 * must not cancel reminders the person wants, nor bring back ones they turned
 * off. Those of a server switched away from still stop, and waiting Taken /
 * Skip presses are replayed. A reconcile is the last caller's (see
 * `reconcileMedicationReminders`), so this run never reconciles on a state
 * the app has read differently since: the app owns that one.
 */
const reconcileMedicationRemindersInBackground = async (
  read: FeatureChoicesRead,
  bound: { accountGeneration: number; serverId: string | null | undefined }
): Promise<void> => {
  const featureState = featureOnState('medications', read.response);
  if (featureState === 'unknown') {
    await addLog(
      `[Background Sync] Medication reminders left as they are: feature choices could not be read (${read.failure})`,
      'WARNING'
    );
    // The reconcile that would replay waiting presses is not run; the replay
    // checks whose they are and does nothing when none wait.
    await retryPendingMedicationActions();
    await cancelMedicationRemindersOfOtherServers();
    return;
  }

  const deferToNewerRead = async (): Promise<boolean> => {
    if (
      !featureStateChangedSince('medications', read.startedAt, featureState)
    ) {
      return false;
    }
    await addLog(
      '[Background Sync] Medication reminders left to the app: it read the feature choices again meanwhile',
      'DEBUG'
    );
    return true;
  };

  if (featureState === 'off') {
    if (await deferToNewerRead()) return;
    await reconcileMedicationReminders([], [], {
      active: false,
      serverId: bound.serverId,
      accountGeneration: bound.accountGeneration,
    });
    return;
  }

  const today = getTodayDate();
  const [medications, entries] = await Promise.all([
    listMedications({ activeOnly: true }),
    listEntries({ fromDate: today, toDate: today }),
  ]);
  if (await deferToNewerRead()) return;
  await reconcileMedicationReminders(medications, entries, {
    active: true,
    serverId: bound.serverId,
    accountGeneration: bound.accountGeneration,
  });
};

/**
 * Brushing reminders follow Oral care in Settings → Features (#3487), so a
 * switch made on another phone applies here without opening the app: off
 * cancels them and clears those shown; on schedules the preference times,
 * unless the scheduled ones are already those times in today's language
 * (`skipWhenCurrent`), so a run does not rewrite them every time. When the
 * choices cannot be read they are left exactly as they are, and a state the
 * app has read differently since (checked again right before the reconcile)
 * is the app's to apply, as is everything after an account change during the
 * run: the choices belong to the account the run started for. They hold no
 * account data, so they are not bound to a server.
 */
const reconcileBrushingRemindersInBackground = async (
  read: FeatureChoicesRead,
  accountGeneration: number
): Promise<void> => {
  const featureState = featureOnState('oralCare', read.response);
  if (featureState === 'unknown') {
    await addLog(
      `[Background Sync] Brushing reminders left as they are: feature choices could not be read (${read.failure})`,
      'WARNING'
    );
    return;
  }
  if (featureStateChangedSince('oralCare', read.startedAt, featureState)) {
    await addLog(
      '[Background Sync] Brushing reminders left to the app: it read the feature choices again meanwhile',
      'DEBUG'
    );
    return;
  }
  // The choices were read for the account signed in when the run started;
  // after a switch they say nothing about the one signed in now.
  if (currentAccountGeneration() !== accountGeneration) {
    await addLog(
      '[Background Sync] Brushing reminders left to the app: the account changed during the run',
      'DEBUG'
    );
    return;
  }
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.oralCareRemindersEnabled || !prefs.notificationsEnabled) return;
  await reconcileOralCareReminders({
    mode: featureState === 'on' ? 'on' : 'off',
    times: prefs.oralCareReminderTimes,
    dismissDelivered: featureState === 'off',
    skipWhenCurrent: true,
  });
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
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME).catch(
        () => {}
      );
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
    addLog(
      `[Background Sync] Failed to register background task: ${message}`,
      'ERROR'
    );
  }
};

export const stopBackgroundSync = async (): Promise<void> => {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    addLog('[Background Sync] Background task unregistered', 'INFO');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[Background Sync] Background task failed to stop: ${message}`,
      'ERROR'
    );
  }
};

export const triggerManualSync = async (): Promise<void> => {
  addLog('[Background Sync] Manual sync triggered', 'INFO');
  await performBackgroundSync('manual-sync');
};
