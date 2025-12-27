import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from '../LogService';

const SYNC_DURATION_KEY = '@HealthKit:syncDuration';

export const saveHealthPreference = async (key, value) => {
  try {
    await AsyncStorage.setItem(`@HealthKit:${key}`, JSON.stringify(value));
    addLog(`[HealthKitService] Saved preference ${key}: ${JSON.stringify(value)}`);
  } catch (error) {
    addLog(`[HealthKitService] Failed to save preference ${key}: ${error.message}`, 'error', 'ERROR');
  }
};

export const loadHealthPreference = async (key) => {
  try {
    const value = await AsyncStorage.getItem(`@HealthKit:${key}`);
    if (value !== null) {
      return JSON.parse(value);
    }
    return null;
  } catch (error) {
    addLog(`[HealthKitService] Failed to load preference ${key}: ${error.message}`, 'error', 'ERROR');
    return null;
  }
};

export const saveStringPreference = async (key, value) => {
  try {
    await AsyncStorage.setItem(`@HealthKit:${key}`, value);
    addLog(`[HealthKitService] Saved string preference ${key}: ${value}`);
  } catch (error) {
    addLog(`[HealthKitService] Failed to save string preference ${key}: ${error.message}`, 'error', 'ERROR');
  }
};

export const loadStringPreference = async (key) => {
  try {
    const value = await AsyncStorage.getItem(`@HealthKit:${key}`);
    if (value !== null) {
      return value;
    }
    return null;
  } catch (error) {
    addLog(`[HealthKitService] Failed to load string preference ${key}: ${error.message}`, 'error', 'ERROR');
    return null;
  }
};

export const saveSyncDuration = async (value) => {
  try {
    await AsyncStorage.setItem(SYNC_DURATION_KEY, value);
    addLog(`[HealthKitService] Saved sync duration: ${value}`);
  } catch (error) {
    addLog(`[HealthKitService] Failed to save sync duration: ${error.message}`, 'error', 'ERROR');
  }
};

export const loadSyncDuration = async () => {
  try {
    const value = await AsyncStorage.getItem(SYNC_DURATION_KEY);
    return value ?? '24h';
  } catch (error) {
    addLog(`[HealthKitService] Failed to load sync duration: ${error.message}`, 'error', 'ERROR');
    return '24h';
  }
};
