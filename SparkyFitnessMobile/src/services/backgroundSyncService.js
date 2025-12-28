import BackgroundFetch from 'react-native-background-fetch';
import { syncHealthData } from './api';
import { addLog } from './LogService';
import { loadHealthPreference, loadSyncDuration, readStepRecords, aggregateStepsByDate, readActiveCaloriesRecords, aggregateActiveCaloriesByDate, readSleepSessionRecords, readStressRecords, readExerciseSessionRecords, readWorkoutRecords } from './healthConnectService';
import { readSleepSessionRecords as readSleepSessionRecordsHK, readStressRecords as readStressRecordsHK, readWorkoutRecords as readWorkoutRecordsHK } from './healthkit';
import { Platform } from 'react-native';
import { saveLastSyncedTime } from './storage';
const BACKGROUND_FETCH_TASK_ID = 'healthDataSync';

const performBackgroundSync = async (taskId) => {
  console.log('[BackgroundFetch] taskId', taskId);
  addLog(`[Background Sync] Background fetch triggered: ${taskId}`);

  try {
    const isStepsEnabled = await loadHealthPreference('syncStepsEnabled');
    const isActiveCaloriesEnabled = await loadHealthPreference('syncCaloriesEnabled');
    const isSleepSessionEnabled = await loadHealthPreference('isSleepSessionSyncEnabled');
    const isStressEnabled = await loadHealthPreference('isStressSyncEnabled');
    const isExerciseSessionEnabled = await loadHealthPreference('isExerciseSessionSyncEnabled');
    const isWorkoutEnabled = await loadHealthPreference('isWorkoutSyncEnabled');

    const syncDuration = await loadSyncDuration(); // This will be '1h', '4h', '24h'
    const fourHourSyncTime = await loadHealthPreference('fourHourSyncTime');
    const dailySyncTime = await loadHealthPreference('dailySyncTime');

    let shouldSync = false;
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (syncDuration === '1h') {
      shouldSync = true; // Sync every hour
    } else if (syncDuration === '4h') {
      const [h, m] = fourHourSyncTime.split(':').map(Number);
      // Check if current time is within a reasonable window of the configured sync time
      if (currentHour % 4 === h && currentMinute >= m && currentMinute < m + 15) { // Sync within 15 mins of configured time
        shouldSync = true;
      }
    } else if (syncDuration === '24h') {
      const [h, m] = dailySyncTime.split(':').map(Number);
      if (currentHour === h && currentMinute >= m && currentMinute < m + 15) { // Sync within 15 mins of configured time
        shouldSync = true;
      }
    }

    if (shouldSync) {
      addLog(`[Background Sync] Performing health data sync.`);
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

      let allAggregatedData = [];

      if (isStepsEnabled) {
        const stepRecords = await readStepRecords(startDate, endDate);
        const aggregatedStepsData = aggregateStepsByDate(stepRecords);
        allAggregatedData = allAggregatedData.concat(aggregatedStepsData);
      }

      if (isActiveCaloriesEnabled) {
        const activeCaloriesRecords = await readActiveCaloriesRecords(startDate, endDate);
        const aggregatedActiveCaloriesData = aggregateActiveCaloriesByDate(activeCaloriesRecords);
        allAggregatedData = allAggregatedData.concat(aggregatedActiveCaloriesData);
      }

      if (isSleepSessionEnabled) {
        let sleepRecords;
        if (Platform.OS === 'ios') {
          sleepRecords = await readSleepSessionRecordsHK(startDate, endDate);
        } else {
          sleepRecords = await readSleepSessionRecords(startDate, endDate);
        }
        // Sleep records are already aggregated by session, no further aggregation needed
        allAggregatedData = allAggregatedData.concat(sleepRecords);
      }

      if (isStressEnabled) {
        let stressRecords;
        if (Platform.OS === 'ios') {
          stressRecords = await readStressRecordsHK(startDate, endDate);
        } else {
          stressRecords = await readStressRecords(startDate, endDate);
        }
        // Stress records are individual measurements, no further aggregation needed
        allAggregatedData = allAggregatedData.concat(stressRecords);
      }

      if (isExerciseSessionEnabled) {
        let exerciseRecords;
        if (Platform.OS === 'ios') {
          exerciseRecords = await readWorkoutRecordsHK(startDate, endDate); // HealthKit uses 'Workout' for exercise sessions
        } else {
          exerciseRecords = await readExerciseSessionRecords(startDate, endDate);
        }
        // Exercise records are individual sessions, no further aggregation needed
        allAggregatedData = allAggregatedData.concat(exerciseRecords);
      }

      if (allAggregatedData.length > 0) {
        await syncHealthData(allAggregatedData);
        addLog('[Background Sync] Health data synced successfully.', 'info', 'SUCCESS');
        await saveLastSyncedTime();
      } else {
        addLog('[Background Sync] No health data to sync.', 'info', 'INFO');
      }
    } else {
      addLog(`[Background Sync] Not time to sync yet. Current time: ${now.toLocaleTimeString()}, Sync frequency: ${syncDuration}`);
    }
  } catch (error) {
    addLog(`[Background Sync] Sync Error: ${error.message}`, 'error', 'ERROR');
  }

  BackgroundFetch.finish(taskId);
};

export const HeadlessTask = async (event) => {
  // Get taskId from event
  let taskId = event.taskId;
  let isTimeout = event.timeout;
  if (isTimeout) {
    console.log('[BackgroundFetch] Headless TIMEOUT:', taskId);
    BackgroundFetch.finish(taskId);
    return;
  }
  console.log('[BackgroundFetch HeadlessTask] start: ', taskId);
  await performBackgroundSync(taskId);
};

export const configureBackgroundSync = async () => {
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
  }, async (taskId) => {
    await performBackgroundSync(taskId);
  }, (error) => {
    addLog(`[Background Sync] Background fetch failed to configure: ${error.message}`, 'error', 'ERROR');
  });
};

export const startBackgroundSync = async () => {
  try {
    await BackgroundFetch.start(BACKGROUND_FETCH_TASK_ID);
    addLog('[Background Sync] Background fetch started successfully.');
  } catch (error) {
    addLog(`[Background Sync] Background fetch failed to start: ${error.message}`, 'error', 'ERROR');
  }
};

export const stopBackgroundSync = async () => {
  try {
    await BackgroundFetch.stop(BACKGROUND_FETCH_TASK_ID);
    addLog('[Background Sync] Background fetch stopped successfully.');
  } catch (error) {
    addLog(`[Background Sync] Background fetch failed to stop: ${error.message}`, 'error', 'ERROR');
  }
};