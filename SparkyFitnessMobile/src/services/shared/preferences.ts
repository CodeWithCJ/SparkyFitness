import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from '../LogService';
import { SyncDuration, SyncInterval } from '../../utils/syncUtils';

// Re-export types for convenience
export { SyncDuration, SyncInterval };

export interface PreferenceFunctions {
  saveHealthPreference: <T>(key: string, value: T) => Promise<void>;
  loadHealthPreference: <T>(key: string) => Promise<T | null>;
  saveStringPreference: (key: string, value: string) => Promise<void>;
  loadStringPreference: (key: string) => Promise<string | null>;
  saveSyncDuration: (value: SyncDuration | SyncInterval) => Promise<void>;
  loadSyncDuration: () => Promise<SyncDuration>;
}

/**
 * Creates preference functions with a configurable storage prefix and log tag.
 * This allows both HealthConnect (Android) and HealthKit (iOS) to share the same
 * preference logic while using platform-specific storage keys and log messages.
 *
 * @param storagePrefix - The prefix for AsyncStorage keys (e.g., '@HealthConnect' or '@HealthKit')
 * @param logTag - The tag for log messages (e.g., '[HealthConnectService]' or '[HealthKitService]')
 */
export const createPreferenceFunctions = (
  storagePrefix: string,
  logTag: string
): PreferenceFunctions => {
  const syncDurationKey = `${storagePrefix}:syncDuration`;

  const saveHealthPreference = async <T>(key: string, value: T): Promise<void> => {
    try {
      await AsyncStorage.setItem(`${storagePrefix}:${key}`, JSON.stringify(value));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${logTag} Failed to save preference ${key}: ${message}`, 'ERROR');
    }
  };

  const loadHealthPreference = async <T>(key: string): Promise<T | null> => {
    try {
      const value = await AsyncStorage.getItem(`${storagePrefix}:${key}`);
      if (value !== null) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${logTag} Failed to load preference ${key}: ${message}`, 'ERROR');
      return null;
    }
  };

  const saveStringPreference = async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(`${storagePrefix}:${key}`, value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${logTag} Failed to save string preference ${key}: ${message}`, 'ERROR');
    }
  };

  const loadStringPreference = async (key: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(`${storagePrefix}:${key}`);
      if (value !== null) {
        return value;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${logTag} Failed to load string preference ${key}: ${message}`, 'ERROR');
      return null;
    }
  };

  const saveSyncDuration = async (value: SyncDuration | SyncInterval): Promise<void> => {
    try {
      await AsyncStorage.setItem(syncDurationKey, value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${logTag} Failed to save sync duration: ${message}`, 'ERROR');
    }
  };

  const loadSyncDuration = async (): Promise<SyncDuration> => {
    try {
      const value = await AsyncStorage.getItem(syncDurationKey);
      return (value as SyncDuration) ?? '24h';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${logTag} Failed to load sync duration: ${message}`, 'ERROR');
      return '24h';
    }
  };

  return {
    saveHealthPreference,
    loadHealthPreference,
    saveStringPreference,
    loadStringPreference,
    saveSyncDuration,
    loadSyncDuration,
  };
};
