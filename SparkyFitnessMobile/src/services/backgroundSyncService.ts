import BackgroundFetch, { HeadlessEvent } from 'react-native-background-fetch';
import { syncHealthData, HealthDataPayload } from './api';
import { addLog } from './LogService';
import {
  loadHealthPreference,
  loadSyncDuration,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  readSleepSessionRecords,
  readStressRecords,
  readExerciseSessionRecords,
  readWorkoutRecords,
} from './healthConnectService';
import { saveLastSyncedTime } from './storage';
import { SyncInterval } from './healthconnect/preferences';

const BACKGROUND_FETCH_TASK_ID = 'healthDataSync';

const performBackgroundSync = async (taskId: string): Promise<void> => {
  console.log('[BackgroundFetch] taskId', taskId);
  addLog(`[Background Sync] Starting background sync task: ${taskId}`, 'info');

  try {
    const isStepsEnabled = await loadHealthPreference<boolean>('syncStepsEnabled');
    const isActiveCaloriesEnabled = await loadHealthPreference<boolean>('syncCaloriesEnabled');
    const isSleepSessionEnabled = await loadHealthPreference<boolean>('isSleepSessionSyncEnabled');
    const isStressEnabled = await loadHealthPreference<boolean>('isStressSyncEnabled');
    const isExerciseSessionEnabled = await loadHealthPreference<boolean>('isExerciseSessionSyncEnabled');
    const isWorkoutEnabled = await loadHealthPreference<boolean>('isWorkoutSyncEnabled');

    const syncDuration = await loadSyncDuration() as SyncInterval; // Background sync uses SyncInterval ('1h', '4h', '24h')
    const fourHourSyncTime = await loadHealthPreference<string>('fourHourSyncTime') ?? '00:00';
    const dailySyncTime = await loadHealthPreference<string>('dailySyncTime') ?? '00:00';

    let shouldSync = false;
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let syncReason = '';

    if (syncDuration === '1h') {
      shouldSync = true; // Sync every hour
      syncReason = 'hourly sync enabled';
    } else if (syncDuration === '4h') {
      const [h, m] = fourHourSyncTime.split(':').map(Number);
      // Check if current time is within a reasonable window of the configured sync time
      if (currentHour % 4 === h && currentMinute >= m && currentMinute < m + 15) { // Sync within 15 mins of configured time
        shouldSync = true;
        syncReason = `4-hour sync window (configured: ${fourHourSyncTime})`;
      } else {
        addLog(`[Background Sync] Skipping: outside 4-hour sync window (current: ${currentHour}:${currentMinute}, configured: ${fourHourSyncTime})`, 'debug');
      }
    } else if (syncDuration === '24h') {
      const [h, m] = dailySyncTime.split(':').map(Number);
      if (currentHour === h && currentMinute >= m && currentMinute < m + 15) { // Sync within 15 mins of configured time
        shouldSync = true;
        syncReason = `daily sync window (configured: ${dailySyncTime})`;
      } else {
        addLog(`[Background Sync] Skipping: outside daily sync window (current: ${currentHour}:${currentMinute}, configured: ${dailySyncTime})`, 'debug');
      }
    }

    if (shouldSync) {
      addLog(`[Background Sync] Proceeding with sync: ${syncReason}`, 'debug');
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date(endDate);
      // Adjust startDate based on syncDuration
      if (syncDuration === '1h') {
        startDate.setHours(endDate.getHours() - 1, 0, 0, 0);
      } else if (syncDuration === '4h') {
        startDate.setHours(endDate.getHours() - 4, 0, 0, 0);
      } else if (syncDuration === '24h') {
        startDate.setDate(endDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
      }

      const allAggregatedData: HealthDataPayload = [];
      const collectedCounts: string[] = [];

      if (isStepsEnabled) {
        const aggregatedStepsData = await getAggregatedStepsByDate(startDate, endDate);
        allAggregatedData.push(...aggregatedStepsData);
        if (aggregatedStepsData.length > 0) collectedCounts.push(`steps: ${aggregatedStepsData.length}`);
      }

      if (isActiveCaloriesEnabled) {
        const aggregatedActiveCaloriesData = await getAggregatedActiveCaloriesByDate(startDate, endDate);
        allAggregatedData.push(...aggregatedActiveCaloriesData);
        if (aggregatedActiveCaloriesData.length > 0) collectedCounts.push(`calories: ${aggregatedActiveCaloriesData.length}`);
      }

      if (isSleepSessionEnabled) {
        const sleepRecords = await readSleepSessionRecords(startDate, endDate);
        // Sleep records are already aggregated by session, no further aggregation needed
        allAggregatedData.push(...(sleepRecords as HealthDataPayload));
        if (sleepRecords.length > 0) collectedCounts.push(`sleep: ${sleepRecords.length}`);
      }

      if (isStressEnabled) {
        const stressRecords = await readStressRecords(startDate, endDate);
        // Stress records are individual measurements, no further aggregation needed
        allAggregatedData.push(...(stressRecords as HealthDataPayload));
        if (stressRecords.length > 0) collectedCounts.push(`stress: ${stressRecords.length}`);
      }

      if (isExerciseSessionEnabled) {
        const exerciseRecords = await readExerciseSessionRecords(startDate, endDate);
        // Exercise records are individual sessions, no further aggregation needed
        allAggregatedData.push(...(exerciseRecords as HealthDataPayload));
        if (exerciseRecords.length > 0) collectedCounts.push(`exercise: ${exerciseRecords.length}`);
      }

      if (isWorkoutEnabled) {
        const workoutRecords = await readWorkoutRecords(startDate, endDate);
        // Workout records are individual sessions, no further aggregation needed
        allAggregatedData.push(...(workoutRecords as HealthDataPayload));
        if (workoutRecords.length > 0) collectedCounts.push(`workouts: ${workoutRecords.length}`);
      }

      if (allAggregatedData.length > 0) {
        addLog(`[Background Sync] Collected ${allAggregatedData.length} records (${collectedCounts.join(', ')})`, 'debug');
        await syncHealthData(allAggregatedData);
        await saveLastSyncedTime();
        addLog(`[Background Sync] Sync completed successfully`, 'info', 'SUCCESS');
      } else {
        addLog(`[Background Sync] No health data collected to sync`, 'debug');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Sync Error: ${message}`, 'error', 'ERROR');
  }

  BackgroundFetch.finish(taskId);
};

export const HeadlessTask = async (event: HeadlessEvent): Promise<void> => {
  // Get taskId from event
  const taskId = event.taskId;
  const isTimeout = event.timeout;
  if (isTimeout) {
    console.log('[BackgroundFetch] Headless TIMEOUT:', taskId);
    BackgroundFetch.finish(taskId);
    return;
  }
  console.log('[BackgroundFetch HeadlessTask] start: ', taskId);
  await performBackgroundSync(taskId);
};

export const configureBackgroundSync = async (): Promise<void> => {
  BackgroundFetch.configure({
    minimumFetchInterval: 15, // <-- minutes (15 is minimum allowed)
    stopOnTerminate: false,    // <-- Android only,
    startOnBoot: true,         // <-- Android only
    enableHeadless: true,
    forceAlarmManager: false,  // <-- Android only,
    requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY, // Require any network connection
    requiresCharging: false,    // Don't require charging
    requiresDeviceIdle: false,  // Don't require device to be idle
    requiresBatteryNotLow: false, // Don't require battery not to be low
  }, async (taskId: string) => {
    await performBackgroundSync(taskId);
  }, (taskId: string) => {
    // This callback is called on timeout - taskId is passed, not an error
    addLog(`[Background Sync] Background fetch timeout for task: ${taskId}`, 'error', 'ERROR');
    BackgroundFetch.finish(taskId);
  });
};

export const startBackgroundSync = async (): Promise<void> => {
  try {
    await BackgroundFetch.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Background fetch failed to start: ${message}`, 'error', 'ERROR');
  }
};

export const stopBackgroundSync = async (): Promise<void> => {
  try {
    await BackgroundFetch.stop(BACKGROUND_FETCH_TASK_ID);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Background Sync] Background fetch failed to stop: ${message}`, 'error', 'ERROR');
  }
};
