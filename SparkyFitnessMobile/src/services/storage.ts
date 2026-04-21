import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { CATEGORY_ORDER } from '../HealthMetrics';
import { addLog } from './LogService';

export interface ProxyHeader {
  name: string;
  value: string;
}

export interface ServerConfig {
  id: string;
  url: string;
  apiKey: string;
  authType?: 'apiKey' | 'session';
  sessionToken?: string;
  proxyHeaders?: ProxyHeader[];
}

/** Config shape stored in AsyncStorage (apiKey stripped out). */
interface StoredServerConfig {
  id: string;
  url: string;
  apiKey?: string; // Present only in legacy data before migration
  authType?: 'apiKey' | 'session';
}

export type TimeRange = 'today' | '24h' | '3d' | '7d' | '30d' | '90d' | '180d' | '365d';

const SERVER_CONFIGS_KEY = 'serverConfigs';
const ACTIVE_SERVER_CONFIG_ID_KEY = 'activeServerConfigId';
const TIME_RANGE_KEY = 'timeRange';
const LAST_SYNCED_TIME_KEY = 'lastSyncedTime';
const BACKGROUND_SYNC_ENABLED_KEY = 'backgroundSyncEnabled';
const SYNC_ON_OPEN_ENABLED_KEY = 'syncOnOpenEnabled';
const PENDING_HEALTH_SYNC_CACHE_REFRESH_KEY = 'pendingHealthSyncCacheRefresh';

const secureStoreKey = (configId: string) => `apiKey_${configId}`;
const sessionTokenSecureStoreKey = (configId: string) => `sessionToken_${configId}`;
const proxyHeadersSecureStoreKey = (configId: string) => `proxyHeaders_${configId}`;
const secureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const proxyHeadersToRecord = (headers?: ProxyHeader[]): Record<string, string> => {
  if (!headers?.length) return {};
  return Object.fromEntries(headers.map(h => [h.name, h.value]));
};

// undefined = cache cold (not yet read), null = no active config, ServerConfig = cached config
let activeServerConfigCache: ServerConfig | null | undefined = undefined;

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
    const index = stored.findIndex(c => c.id === config.id);
    const existingAuthType = index > -1 ? stored[index].authType : undefined;
    const authType = config.authType ?? existingAuthType;

    const stripped: StoredServerConfig = {
      id: config.id,
      url: config.url,
      ...(authType ? { authType } : {}),
    };

    if (index > -1) {
      stored[index] = stripped;
    } else {
      stored.push(stripped);
    }

    await SecureStore.setItemAsync(secureStoreKey(config.id), config.apiKey, secureStoreOptions);

    if (config.sessionToken !== undefined) {
      if (config.sessionToken) {
        await SecureStore.setItemAsync(sessionTokenSecureStoreKey(config.id), config.sessionToken, secureStoreOptions);
      } else {
        await SecureStore.deleteItemAsync(sessionTokenSecureStoreKey(config.id));
      }
    }

    if (config.proxyHeaders?.length) {
      await SecureStore.setItemAsync(proxyHeadersSecureStoreKey(config.id), JSON.stringify(config.proxyHeaders), secureStoreOptions);
    } else {
      await SecureStore.deleteItemAsync(proxyHeadersSecureStoreKey(config.id));
    }

    await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(stored));
    activeServerConfigCache = undefined;
    await setActiveServerConfig(config.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    addLog(`[Storage] Failed to save server config: ${message}`, 'ERROR');
    throw e;
  }
};

/**
 * Retrieves the currently active server configuration.
 */
export const getActiveServerConfig = async (): Promise<ServerConfig | null> => {
  if (activeServerConfigCache !== undefined) {
    return activeServerConfigCache;
  }

  try {
    const activeId = await AsyncStorage.getItem(ACTIVE_SERVER_CONFIG_ID_KEY);
    if (!activeId) {
      activeServerConfigCache = null;
      return null;
    }

    const configs = await getAllServerConfigs();
    const result = configs.find(config => config.id === activeId) || null;
    // Only cache non-null results; getAllServerConfigs swallows errors and returns [],
    // so a transient failure would otherwise be cached as "no config" permanently.
    if (result !== null) {
      activeServerConfigCache = result;
    }
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    addLog(`[Storage] Failed to retrieve active server config: ${message}`, 'ERROR');
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
        const sessionToken = await SecureStore.getItemAsync(sessionTokenSecureStoreKey(entry.id), secureStoreOptions);
        const proxyHeadersJson = await SecureStore.getItemAsync(proxyHeadersSecureStoreKey(entry.id), secureStoreOptions);
        let proxyHeaders: ProxyHeader[] | undefined;
        if (proxyHeadersJson) {
          try { proxyHeaders = JSON.parse(proxyHeadersJson); } catch {
            addLog(`Failed to parse proxy headers for config ${entry.id}.`, 'ERROR');
          }
        }

        const base = {
          id: entry.id,
          url: entry.url,
          ...(entry.authType ? { authType: entry.authType } : {}),
          ...(sessionToken ? { sessionToken } : {}),
          ...(proxyHeaders?.length ? { proxyHeaders } : {}),
        };

        if (secureKey != null) {
          if (entry.apiKey) migrated = true;
          return { ...base, apiKey: secureKey };
        }

        // Legacy migration: key still in AsyncStorage
        if (entry.apiKey) {
          await SecureStore.setItemAsync(secureStoreKey(entry.id), entry.apiKey, secureStoreOptions);
          migrated = true;
          return { ...base, apiKey: entry.apiKey };
        }

        return { ...base, apiKey: '' };
      }),
    );

    // Strip migrated plaintext keys from AsyncStorage.
    // Re-read to avoid overwriting configs saved by concurrent saveServerConfig calls.
    if (migrated) {
      const current = await getRawStoredConfigs();
      const cleaned = current.map(({ id, url, authType }) => ({
        id,
        url,
        ...(authType ? { authType } : {}),
      }));
      await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(cleaned));
    }

    return configs;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    addLog(`[Storage] Failed to retrieve all server configs: ${message}`, 'ERROR');
    return [];
  }
};

/**
 * Sets a specific server configuration as the active one.
 */
export const setActiveServerConfig = async (configId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(ACTIVE_SERVER_CONFIG_ID_KEY, configId);
    activeServerConfigCache = undefined;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    addLog(`[Storage] Failed to set active server config: ${message}`, 'ERROR');
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
    activeServerConfigCache = undefined;
    await SecureStore.deleteItemAsync(secureStoreKey(configId));
    await SecureStore.deleteItemAsync(sessionTokenSecureStoreKey(configId));
    await SecureStore.deleteItemAsync(proxyHeadersSecureStoreKey(configId));

    const activeId = await AsyncStorage.getItem(ACTIVE_SERVER_CONFIG_ID_KEY);
    if (activeId === configId) {
      await AsyncStorage.removeItem(ACTIVE_SERVER_CONFIG_ID_KEY);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    addLog(`[Storage] Failed to delete server config: ${message}`, 'ERROR');
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
    const message = e instanceof Error ? e.message : String(e);
    addLog(`[Storage] Failed to save time range: ${message}`, 'ERROR');
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
    const message = e instanceof Error ? e.message : String(e);
    addLog(`[Storage] Failed to load time range: ${message}`, 'ERROR');
    return null;
  }
};

export const loadLastSyncedTime = async (): Promise<string | null> => {
  try {
    const synced = await AsyncStorage.getItem(LAST_SYNCED_TIME_KEY);
    return synced;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to retrieve sync time: ${message}`, 'ERROR');
    return null;
  }
};

export const saveLastSyncedTime = async (): Promise<string | null> => {
  try {
    const timestamp = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNCED_TIME_KEY, timestamp);
    return timestamp;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to save sync time: ${message}`, 'ERROR');
    return null;
  }
};

export const saveBackgroundSyncEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(BACKGROUND_SYNC_ENABLED_KEY, JSON.stringify(enabled));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to save background sync enabled preference: ${message}`, 'ERROR');
  }
};

export const loadBackgroundSyncEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(BACKGROUND_SYNC_ENABLED_KEY);
    if (value === null) return false;
    return JSON.parse(value) as boolean;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to load background sync enabled preference: ${message}`, 'ERROR');
    return false;
  }
};

export const saveSyncOnOpenEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(SYNC_ON_OPEN_ENABLED_KEY, JSON.stringify(enabled));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to save sync on open preference: ${message}`, 'ERROR');
  }
};

export const loadSyncOnOpenEnabled = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(SYNC_ON_OPEN_ENABLED_KEY);
    if (value === null) return false;
    return JSON.parse(value) as boolean;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to load sync on open preference: ${message}`, 'ERROR');
    return false;
  }
};

export const savePendingHealthSyncCacheRefresh = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(PENDING_HEALTH_SYNC_CACHE_REFRESH_KEY, 'true');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to save pending health sync cache refresh: ${message}`, 'ERROR');
  }
};

export const consumePendingHealthSyncCacheRefresh = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(PENDING_HEALTH_SYNC_CACHE_REFRESH_KEY);
    if (value !== 'true') {
      return false;
    }

    await AsyncStorage.removeItem(PENDING_HEALTH_SYNC_CACHE_REFRESH_KEY);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to consume pending health sync cache refresh: ${message}`, 'ERROR');
    return false;
  }
};

const COLLAPSED_CATEGORIES_KEY = '@HealthMetrics:collapsedCategories';

export const saveCollapsedCategories = async (categories: string[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify(categories));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to save collapsed categories: ${message}`, 'ERROR');
  }
};

export const loadCollapsedCategories = async (): Promise<string[]> => {
  try {
    const value = await AsyncStorage.getItem(COLLAPSED_CATEGORIES_KEY);
    if (value) {
      return JSON.parse(value);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Storage] Failed to load collapsed categories: ${message}`, 'ERROR');
  }
  // Default: all categories except Common are collapsed
  return CATEGORY_ORDER.filter(c => c !== 'Common');
};

export const clearSessionToken = async (configId: string): Promise<void> => {
  await SecureStore.deleteItemAsync(sessionTokenSecureStoreKey(configId));
  activeServerConfigCache = undefined;
};

export const clearServerConfigCache = (): void => {
  activeServerConfigCache = undefined;
};
