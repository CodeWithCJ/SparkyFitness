import { Platform } from 'react-native';

// Platform-specific health service exports
// On iOS: uses HealthKit
// On Android: uses Health Connect

let healthService;

if (Platform.OS === 'ios') {
  healthService = require('./healthKitService');
} else {
  healthService = require('./healthConnectService');
}

// Export all functions from the appropriate service
export const initHealthConnect = healthService.initHealthKit || healthService.initHealthConnect;
export const requestHealthPermissions = healthService.requestHealthPermissions;
export const readStepRecords = healthService.readStepRecords;
export const aggregateStepsByDate = healthService.aggregateStepsByDate;
export const readActiveCaloriesRecords = healthService.readActiveCaloriesRecords;
export const aggregateActiveCaloriesByDate = healthService.aggregateActiveCaloriesByDate;
export const aggregateTotalCaloriesByDate = healthService.aggregateTotalCaloriesByDate;
export const readHeartRateRecords = healthService.readHeartRateRecords;
export const aggregateHeartRateByDate = healthService.aggregateHeartRateByDate;
export const loadHealthPreference = healthService.loadHealthPreference;
export const saveStringPreference = healthService.saveStringPreference;
export const loadStringPreference = healthService.loadStringPreference;
export const getSyncStartDate = healthService.getSyncStartDate;
export const readHealthRecords = healthService.readHealthRecords;
export const syncHealthData = healthService.syncHealthData;
export const saveHealthPreference = healthService.saveHealthPreference;
export const saveSyncDuration = healthService.saveSyncDuration;
export const loadSyncDuration = healthService.loadSyncDuration;
export const transformHealthRecords = healthService.transformHealthRecords;
