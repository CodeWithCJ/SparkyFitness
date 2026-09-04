import cron from 'node-cron';
import { log } from '../config/logging.js';
import { processOpenFoodFactsAutoSyncBatch } from './openFoodFactsAutoSyncService.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';

const AUTO_SYNC_CRON = '*/30 * * * * *';
// Offset the activation probe from the processing tick so the two
// reconciliations do not continually supersede each other on active replicas.
const ACTIVITY_WATCH_CRON = '15,45 * * * * *';
let isRunning = false;
let scheduledTask: ReturnType<typeof cron.schedule> | null = null;
let activityWatcherTask: ReturnType<typeof cron.schedule> | null = null;
let reconciliationVersion = 0;
let reconciliationTail: Promise<void> = Promise.resolve();

interface ReconciliationResult {
  active: boolean;
  started: boolean;
}

function stopOpenFoodFactsAutoSyncSchedule(): void {
  if (!scheduledTask) return;
  scheduledTask.stop();
  scheduledTask.destroy();
  scheduledTask = null;
}

async function runOpenFoodFactsAutoSync(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const result = await processOpenFoodFactsAutoSyncBatch();
    if (result.claimed > 0) {
      log(
        'info',
        `[OpenFoodFacts] Automatic sync processed ${result.claimed} queued product(s): ${result.contributed} contributed, ${result.failed} failed, ${result.retried} retained for retry.`
      );
    }
  } catch (error) {
    log('warn', '[OpenFoodFacts] Automatic sync worker failed:', error);
  } finally {
    isRunning = false;
  }
}

function startOpenFoodFactsAutoSyncSchedule(): boolean {
  if (scheduledTask) return false;
  scheduledTask = cron.schedule(AUTO_SYNC_CRON, () => {
    void runScheduledOpenFoodFactsAutoSync();
  });
  void runOpenFoodFactsAutoSync();
  return true;
}

function enqueueScheduleReconciliation(): Promise<ReconciliationResult | null> {
  const requestVersion = ++reconciliationVersion;
  const reconciliation = reconciliationTail.then(async () => {
    // A newer settings transition already queued a fresh database read. Avoid
    // applying or even issuing this superseded request.
    if (requestVersion !== reconciliationVersion) return null;

    let shouldRun: boolean;
    try {
      shouldRun = await openFoodFactsSyncQueueRepository.isFeatureActive();
    } catch (error) {
      if (requestVersion !== reconciliationVersion) return null;
      throw error;
    }

    // The feature may have been toggled while the database read was pending.
    // Only the newest reconciliation is allowed to start or stop the task.
    if (requestVersion !== reconciliationVersion) return null;
    if (!shouldRun) {
      stopOpenFoodFactsAutoSyncSchedule();
      return { active: false, started: false };
    }

    return {
      active: true,
      started: startOpenFoodFactsAutoSyncSchedule(),
    };
  });

  // Serialize reconciliations while allowing a failed probe to be followed by
  // the next watcher tick or settings save.
  reconciliationTail = reconciliation.then(
    () => undefined,
    () => undefined
  );
  return reconciliation;
}

async function runScheduledOpenFoodFactsAutoSync(): Promise<void> {
  try {
    const reconciliation = await enqueueScheduleReconciliation();
    if (reconciliation?.active && !reconciliation.started) {
      await runOpenFoodFactsAutoSync();
    }
  } catch (error) {
    log(
      'warn',
      '[OpenFoodFacts] Could not verify whether automatic sync is active:',
      error
    );
  }
}

async function runOpenFoodFactsActivityWatcher(): Promise<void> {
  try {
    await refreshOpenFoodFactsAutoSyncSchedule();
  } catch (error) {
    log(
      'warn',
      '[OpenFoodFacts] Automatic sync activation check failed; the watcher will retry:',
      error
    );
  }
}

function ensureOpenFoodFactsActivityWatcher(): void {
  if (activityWatcherTask) return;
  activityWatcherTask = cron.schedule(ACTIVITY_WATCH_CRON, () => {
    void runOpenFoodFactsActivityWatcher();
  });
}

export async function refreshOpenFoodFactsAutoSyncSchedule(): Promise<void> {
  await enqueueScheduleReconciliation();
}

export async function scheduleOpenFoodFactsAutoSyncOnStartup(): Promise<void> {
  // Every replica keeps this inexpensive DB-backed watcher, even when the
  // processing task is inactive. That lets replicas observe a later enable
  // transition without relying on which instance served the settings request.
  ensureOpenFoodFactsActivityWatcher();
  try {
    await refreshOpenFoodFactsAutoSyncSchedule();
  } catch (error) {
    // Scheduler availability must never prevent the HTTP API from starting.
    // The activity watcher retries the durable database state on its next tick.
    log(
      'warn',
      '[OpenFoodFacts] Initial automatic sync activation check failed; startup will continue and the watcher will retry:',
      error
    );
  }
}
