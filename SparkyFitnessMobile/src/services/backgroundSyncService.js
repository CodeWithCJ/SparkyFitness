import BackgroundFetch from 'react-native-background-fetch';
import { syncHealthData } from './api';
import { addLog } from './LogService';
import { loadHealthPreference, getSyncDuration } from './healthConnectService';
import { readStepRecords, aggregateStepsByDate, readActiveCaloriesRecords, aggregateActiveCaloriesByDate } from './healthConnectService';

const BACKGROUND_FETCH_TASK_ID = 'healthDataSync';

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
    console.log('[BackgroundFetch] taskId', taskId);
    addLog(`[Background Sync] Background fetch triggered: ${taskId}`);

    try {
      const isStepsEnabled = await loadHealthPreference('syncStepsEnabled');
      const isActiveCaloriesEnabled = await loadHealthPreference('syncCaloriesEnabled');
      const syncDuration = await getSyncDuration(); // This will be '1h', '4h', '24h'
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

        if (allAggregatedData.length > 0) {
          await syncHealthData(allAggregatedData);
          addLog('[Background Sync] Health data synced successfully.', 'info', 'SUCCESS');
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