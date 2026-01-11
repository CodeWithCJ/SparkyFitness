import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from '../LogService';

export type SyncDuration = 'today' | '24h' | '3d' | '7d' | '30d' | '90d';

// SyncInterval represents how often to sync (background sync frequency)
// Note: '24h' appears in both types - SyncDuration for data range, SyncInterval for frequency
export type SyncInterval = '1h' | '4h' | '24h';

const SYNC_DURATION_KEY = '@HealthKit:syncDuration';

export const saveHealthPreference = async <T>(key: string, value: T): Promise<void> => {
  try {
    await AsyncStorage.setItem(`@HealthKit:${key}`, JSON.stringify(value));
    addLog(`[HealthKitService] Saved preference ${key}: ${JSON.stringify(value)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to save preference ${key}: ${message}`, 'error', 'ERROR');
  }
};

export const loadHealthPreference = async <T>(key: string): Promise<T | null> => {
  try {
    const value = await AsyncStorage.getItem(`@HealthKit:${key}`);
    if (value !== null) {
      return JSON.parse(value) as T;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to load preference ${key}: ${message}`, 'error', 'ERROR');
    return null;
  }
};

export const saveStringPreference = async (key: string, value: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(`@HealthKit:${key}`, value);
    addLog(`[HealthKitService] Saved string preference ${key}: ${value}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to save string preference ${key}: ${message}`, 'error', 'ERROR');
  }
};

export const loadStringPreference = async (key: string): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(`@HealthKit:${key}`);
    if (value !== null) {
      return value;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to load string preference ${key}: ${message}`, 'error', 'ERROR');
    return null;
  }
};

export const saveSyncDuration = async (value: SyncDuration | SyncInterval): Promise<void> => {
  try {
    await AsyncStorage.setItem(SYNC_DURATION_KEY, value);
    addLog(`[HealthKitService] Saved sync duration: ${value}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to save sync duration: ${message}`, 'error', 'ERROR');
  }
};

export const loadSyncDuration = async (): Promise<SyncDuration> => {
  try {
    const value = await AsyncStorage.getItem(SYNC_DURATION_KEY);
    return (value as SyncDuration) ?? '24h';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthKitService] Failed to load sync duration: ${message}`, 'error', 'ERROR');
    return '24h';
  }
};
