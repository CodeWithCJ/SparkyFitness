import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ServerConfig {
  id: string;
  url: string;
  apiKey: string;
}

export type TimeRange = 'today' | '24h' | '3d' | '7d' | '30d' | '90d';

const SERVER_CONFIGS_KEY = 'serverConfigs';
const ACTIVE_SERVER_CONFIG_ID_KEY = 'activeServerConfigId';
const TIME_RANGE_KEY = 'timeRange';
const LAST_SYNCED_TIME_KEY = 'lastSyncedTime';

/**
 * Saves a new server configuration or updates an existing one.
 * If a config with the same ID exists, it updates it. Otherwise, it adds a new one.
 * Also sets the saved/updated config as the active one.
 */
export const saveServerConfig = async (config: ServerConfig): Promise<void> => {
  try {
    const configs = await getAllServerConfigs();
    const index = configs.findIndex(c => c.id === config.id);

    if (index > -1) {
      configs[index] = config; // Update existing
    } else {
      configs.push(config); // Add new
    }

    await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(configs));
    await setActiveServerConfig(config.id); // Set as active
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
      console.log('[storage.js] No active config ID found.');
      return null;
    }
    console.log(`[storage.js] Active config ID: ${activeId}`);

    const configs = await getAllServerConfigs();
    return configs.find(config => config.id === activeId) || null;
  } catch (e) {
    console.error('Failed to retrieve active server config.', e);
    throw e;
  }
};

/**
 * Retrieves all saved server configurations.
 */
export const getAllServerConfigs = async (): Promise<ServerConfig[]> => {
  try {
    const jsonValue = await AsyncStorage.getItem(SERVER_CONFIGS_KEY);
    return jsonValue != null ? (JSON.parse(jsonValue) as ServerConfig[]) : [];
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
 * Deletes a specific server configuration.
 * If the deleted config was active, it clears the active config.
 */
export const deleteServerConfig = async (configId: string): Promise<void> => {
  try {
    let configs = await getAllServerConfigs();
    configs = configs.filter(config => config.id !== configId);
    await AsyncStorage.setItem(SERVER_CONFIGS_KEY, JSON.stringify(configs));

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
