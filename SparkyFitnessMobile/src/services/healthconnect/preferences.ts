import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from '../LogService';

export type SyncDuration = 'today' | '24h' | '3d' | '7d' | '30d' | '90d';

// SyncInterval represents how often to sync (background sync frequency)
// Note: '24h' appears in both types - SyncDuration for data range, SyncInterval for frequency
export type SyncInterval = '1h' | '4h' | '24h';

const SYNC_DURATION_KEY = '@HealthConnect:syncDuration';

export const saveHealthPreference = async <T>(key: string, value: T): Promise<void> => {
  try {
    await AsyncStorage.setItem(`@HealthConnect:${key}`, JSON.stringify(value));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to save preference ${key}: ${message}`, 'error', 'ERROR');
    console.error(`Failed to save preference ${key}`, error);
  }
};

export const loadHealthPreference = async <T>(key: string): Promise<T | null> => {
  try {
    const value = await AsyncStorage.getItem(`@HealthConnect:${key}`);
    if (value !== null) {
      return JSON.parse(value) as T;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to load preference ${key}: ${message}`, 'error', 'ERROR');
    console.error(`Failed to load preference ${key}`, error);
    return null;
  }
};

export const saveStringPreference = async (key: string, value: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(`@HealthConnect:${key}`, value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to save string preference ${key}: ${message}`, 'error', 'ERROR');
    console.error(`Failed to save string preference ${key}`, error);
  }
};

export const loadStringPreference = async (key: string): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(`@HealthConnect:${key}`);
    if (value !== null) {
      return value;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to load string preference ${key}: ${message}`, 'error', 'ERROR');
    console.error(`Failed to load string preference ${key}`, error);
    return null;
  }
};

export const saveSyncDuration = async (value: SyncDuration | SyncInterval): Promise<void> => {
  try {
    await AsyncStorage.setItem(SYNC_DURATION_KEY, value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to save sync duration: ${message}`, 'error', 'ERROR');
    console.error(`Failed to save sync duration`, error);
  }
};

export const loadSyncDuration = async (): Promise<SyncDuration> => {
  try {
    const value = await AsyncStorage.getItem(SYNC_DURATION_KEY);
    if (value !== null) {
      return value as SyncDuration;
    }
    return '24h';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[HealthConnectService] Failed to load sync duration: ${message}`, 'error', 'ERROR');
    console.error(`Failed to load sync duration`, error);
    return '24h';
  }
};
