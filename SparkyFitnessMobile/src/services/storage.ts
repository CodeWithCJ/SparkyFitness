import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { CATEGORY_ORDER } from '../HealthMetrics';

export interface ServerConfig {
  id: string;
  url: string;
  apiKey: string;
}

/** Config shape stored in AsyncStorage (apiKey stripped out). */
interface StoredServerConfig {
  id: string;
  url: string;
  apiKey?: string; // Present only in legacy data before migration
}

export type TimeRange = 'today' | '24h' | '3d' | '7d' | '30d' | '90d' | '180d' | '365d';

const SERVER_CONFIGS_KEY = 'serverConfigs';
const ACTIVE_SERVER_CONFIG_ID_KEY = 'activeServerConfigId';
const TIME_RANGE_KEY = 'timeRange';
const LAST_SYNCED_TIME_KEY = 'lastSyncedTime';
const BACKGROUND_SYNC_ENABLED_KEY = 'backgroundSyncEnabled';

const secureStoreKey = (configId: string) => `apiKey_${configId}`;
const secureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** Read raw configs from AsyncStorage without hydrating keys from SecureStore. */
const getRawStoredConfigs = async (): Promise<StoredServerConfig[]> => {
  const jsonValue = await AsyncStorage.getItem(SERVER_CONFIGS_KEY);
  if (jsonValue == null) return [];
  try {
    const parsed = JSON.parse(jsonValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Saves a new server configuration or updates an existing one.
 * The API key is stored in SecureStore; only id and url go to AsyncStorage.
 * Also sets the saved/updated config as the active one.
 */
export const saveServerConfig = async (config: ServerConfig): Promise<void> => {
  try {
    const stored = await getRawStoredConfigs();
    const stripped: StoredServerConfig = { id: config.id, url: config.url };
    const index = stored.findIndex(c => c.id === config.id);

    if (index > -1) {
      stored[index] = stripped;
    } else {
      stored.push(stripped);
    }

    await SecureStore.setItemAsync(secureStoreKey(config.id), config.apiKey, secureStoreOptions);
    await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(stored));
    await setActiveServerConfig(config.id);
  } catch (e) {
    console.error('Failed to save server config.', e);
    throw e;
  }
};

/**
 * Retrieves the currently active server configuration.
 */
export const getActiveServerConfig = async (): Promise<ServerConfig | null> => {
  try {
    const activeId = await AsyncStorage.getItem(ACTIVE_SERVER_CONFIG_ID_KEY);
    if (!activeId) {
      return null;
    }

    const configs = await getAllServerConfigs();
    return configs.find(config => config.id === activeId) || null;
  } catch (e) {
    console.error('Failed to retrieve active server config.', e);
    throw e;
  }
};

/**
 * Retrieves all saved server configurations.
 * Hydrates API keys from SecureStore. Migrates legacy keys found in AsyncStorage.
 */
export const getAllServerConfigs = async (): Promise<ServerConfig[]> => {
  try {
    const stored = await getRawStoredConfigs();
    let migrated = false;

    const configs: ServerConfig[] = await Promise.all(
      stored.map(async (entry) => {
        const secureKey = await SecureStore.getItemAsync(secureStoreKey(entry.id), secureStoreOptions);

        if (secureKey != null) {
          // Flag for cleanup if a stale plaintext key remains in AsyncStorage
          if (entry.apiKey) migrated = true;
          return { id: entry.id, url: entry.url, apiKey: secureKey };
        }

        // Legacy migration: key still in AsyncStorage
        if (entry.apiKey) {
          await SecureStore.setItemAsync(secureStoreKey(entry.id), entry.apiKey, secureStoreOptions);
          migrated = true;
          return { id: entry.id, url: entry.url, apiKey: entry.apiKey };
        }

        return { id: entry.id, url: entry.url, apiKey: '' };
      }),
    );

    // Strip migrated plaintext keys from AsyncStorage.
    // Re-read to avoid overwriting configs saved by concurrent saveServerConfig calls.
    if (migrated) {
      const current = await getRawStoredConfigs();
      const cleaned = current.map(({ id, url }) => ({ id, url }));
      await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(cleaned));
    }

    return configs;
  } catch (e) {
    console.error('Failed to retrieve all server configs.', e);
    return [];
  }
};

/**
 * Sets a specific server configuration as the active one.
 */
export const setActiveServerConfig = async (configId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(ACTIVE_SERVER_CONFIG_ID_KEY, configId);
  } catch (e) {
    console.error('Failed to set active server config.', e);
    throw e;
  }
};

/**
 * Deletes a specific server configuration and its SecureStore key.
 * If the deleted config was active, it clears the active config.
 */
export const deleteServerConfig = async (configId: string): Promise<void> => {
  try {
    let stored = await getRawStoredConfigs();
    stored = stored.filter(config => config.id !== configId);
    await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(stored));
    await SecureStore.deleteItemAsync(secureStoreKey(configId));

    const activeId = await AsyncStorage.getItem(ACTIVE_SERVER_CONFIG_ID_KEY);
    if (activeId === configId) {
      await AsyncStorage.removeItem(ACTIVE_SERVER_CONFIG_ID_KEY);
    }
  } catch (e) {
    console.error('Failed to delete server config.', e);
    throw e;
  }
};

/**
 * Saves the selected time range.
 */
export const saveTimeRange = async (timeRange: TimeRange): Promise<void> => {
  try {
    await AsyncStorage.setItem(TIME_RANGE_KEY, timeRange);
  } catch (e) {
    console.error('Failed to save time range.', e);
    throw e;
  }
};

/**
 * Retrieves the saved time range.
 */
export const loadTimeRange = async (): Promise<TimeRange | null> => {
  try {
    const timeRange = await AsyncStorage.getItem(TIME_RANGE_KEY);
    return timeRange as TimeRange | null;
  } catch (e) {
    console.error('Failed to load time range.', e);
    return null;
  }
};

export const loadLastSyncedTime = async (): Promise<string | null> => {
  try {
    const synced = await AsyncStorage.getItem(LAST_SYNCED_TIME_KEY);
    return synced;
  } catch (error) {
    console.error('Failed to retrieve sync time.', error);
    return null;
  }
};

export const saveLastSyncedTime = async (): Promise<string | null> => {
  try {
    const timestamp = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNCED_TIME_KEY, timestamp);
    return timestamp;
  } catch (error) {
    console.error('Failed to save sync time.', error);
    return null;
  }
};

export const saveBackgroundSyncEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(BACKGROUND_SYNC_ENABLED_KEY, JSON.stringify(enabled));
  } catch (error) {
    console.error('Failed to save background sync enabled preference.', error);
  }
};

export const loadBackgroundSyncEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(BACKGROUND_SYNC_ENABLED_KEY);
    if (value === null) return true; // Default to enabled for backwards compat
    return JSON.parse(value) as boolean;
  } catch (error) {
    console.error('Failed to load background sync enabled preference.', error);
    return true;
  }
};

const COLLAPSED_CATEGORIES_KEY = '@HealthMetrics:collapsedCategories';

export const saveCollapsedCategories = async (categories: string[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify(categories));
  } catch (error) {
    console.error('Failed to save collapsed categories:', error);
  }
};

export const loadCollapsedCategories = async (): Promise<string[]> => {
  try {
    const value = await AsyncStorage.getItem(COLLAPSED_CATEGORIES_KEY);
    if (value) {
      return JSON.parse(value);
    }
  } catch (error) {
    console.error('Failed to load collapsed categories:', error);
  }
  // Default: all categories except Common are collapsed
  return CATEGORY_ORDER.filter(c => c !== 'Common');
};
