import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { syncHealthData, HealthDataPayload } from './api';
import { addLog } from './LogService';
import {
  loadHealthPreference,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  readSleepSessionRecords,
  readStressRecords,
  readExerciseSessionRecords,
  readWorkoutRecords,
} from './healthConnectService';
import { loadLastSyncedTime, saveLastSyncedTime, loadBackgroundSyncEnabled } from './storage';

const BACKGROUND_TASK_NAME = 'healthDataSync';

// Health records (sleep, workouts, etc.) can arrive in HealthKit/Health Connect hours
// after the event. We overlap session queries by this amount so late-arriving records
// whose event timestamps fall before lastSyncedTime are still picked up. The server
// upserts by record identity, so duplicates are harmless.
const SESSION_OVERLAP_MS = 6 * 60 * 60 * 1000; // 6 hours

const performBackgroundSync = async (taskId: string): Promise<void> => {
  console.log('[BackgroundSync] taskId', taskId);
  addLog(`[Background Sync] Starting background sync task: ${taskId}`, 'INFO');

  try {
    const isStepsEnabled = await loadHealthPreference<boolean>('syncStepsEnabled');
    const isActiveCaloriesEnabled = await loadHealthPreference<boolean>('syncCaloriesEnabled');
    const isSleepSessionEnabled = await loadHealthPreference<boolean>('isSleepSessionSyncEnabled');
    const isStressEnabled = await loadHealthPreference<boolean>('isStressSyncEnabled');
    const isExerciseSessionEnabled = await loadHealthPreference<boolean>('isExerciseSessionSyncEnabled');
    const isWorkoutEnabled = await loadHealthPreference<boolean>('isWorkoutSyncEnabled');

    const now = new Date();
    const lastSyncedTimeStr = await loadLastSyncedTime();
    const lastSyncedDate = lastSyncedTimeStr ? new Date(lastSyncedTimeStr) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const endDate = now;

    // Session metrics use an overlap window to catch late-arriving records whose
    // event timestamps predate lastSyncedTime (e.g. overnight sleep synced next morning).
    const sessionStartDate = new Date(lastSyncedDate.getTime() - SESSION_OVERLAP_MS);

    // Aggregated metrics (steps, calories) produce per-day totals. Use start-of-day
    // so we always send complete daily values rather than partial-window slices.
    const aggregatedStartDate = new Date(sessionStartDate);
    aggregatedStartDate.setHours(0, 0, 0, 0);

    addLog(`[Background Sync] Syncing sessions from ${sessionStartDate.toISOString()}, aggregated from ${aggregatedStartDate.toISOString()} to ${endDate.toISOString()}`, 'DEBUG');

    const allAggregatedData: HealthDataPayload = [];
    const collectedCounts: string[] = [];

    if (isStepsEnabled) {
      const aggregatedStepsData = await getAggregatedStepsByDate(aggregatedStartDate, endDate);
      allAggregatedData.push(...aggregatedStepsData);
      if (aggregatedStepsData.length > 0) collectedCounts.push(`steps: ${aggregatedStepsData.length}`);
    }

    if (isActiveCaloriesEnabled) {
      const aggregatedActiveCaloriesData = await getAggregatedActiveCaloriesByDate(aggregatedStartDate, endDate);
      allAggregatedData.push(...aggregatedActiveCaloriesData);
      if (aggregatedActiveCaloriesData.length > 0) collectedCounts.push(`calories: ${aggregatedActiveCaloriesData.length}`);
    }

    if (isSleepSessionEnabled) {
      const sleepRecords = await readSleepSessionRecords(sessionStartDate, endDate);
      allAggregatedData.push(...(sleepRecords as HealthDataPayload));
      if (sleepRecords.length > 0) collectedCounts.push(`sleep: ${sleepRecords.length}`);
    }

    if (isStressEnabled) {
      const stressRecords = await readStressRecords(sessionStartDate, endDate);
      allAggregatedData.push(...(stressRecords as HealthDataPayload));
      if (stressRecords.length > 0) collectedCounts.push(`stress: ${stressRecords.length}`);
    }

    if (isExerciseSessionEnabled) {
      const exerciseRecords = await readExerciseSessionRecords(sessionStartDate, endDate);
      allAggregatedData.push(...(exerciseRecords as HealthDataPayload));
      if (exerciseRecords.length > 0) collectedCounts.push(`exercise: ${exerciseRecords.length}`);
    }

    if (isWorkoutEnabled) {
      const workoutRecords = await readWorkoutRecords(sessionStartDate, endDate);
      allAggregatedData.push(...(workoutRecords as HealthDataPayload));
      if (workoutRecords.length > 0) collectedCounts.push(`workouts: ${workoutRecords.length}`);
    }

    if (allAggregatedData.length > 0) {
      addLog(`[Background Sync] Collected ${allAggregatedData.length} records (${collectedCounts.join(', ')})`, 'DEBUG');
      await syncHealthData(allAggregatedData);
      await saveLastSyncedTime();
      addLog(`[Background Sync] Sync completed successfully`, 'SUCCESS');
    } else {
      addLog(`[Background Sync] No health data collected to sync`, 'DEBUG');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Sync Error: ${message}`, 'ERROR');
    throw error;
  }
};

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    await performBackgroundSync(BACKGROUND_TASK_NAME);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Task failed: ${message}`, 'ERROR');
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
      minimumInterval: 120, // minutes; Android respects this roughly, iOS treats it as a hint
    });
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Available) {
      // addLog('[Background Sync] Background task registered successfully', 'INFO');
    } else {
      addLog('[Background Sync] Background task registration skipped (restricted environment)', 'WARNING');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Failed to register background task: ${message}`, 'ERROR');
  }
};

export const stopBackgroundSync = async (): Promise<void> => {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Background task failed to stop: ${message}`, 'ERROR');
  }
};

export const triggerManualSync = async (): Promise<void> => {
  await performBackgroundSync('manual-sync');
};
