import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveServerConfig,
  getActiveServerConfig,
  getAllServerConfigs,
  setActiveServerConfig,
  deleteServerConfig,
  saveTimeRange,
  loadTimeRange,
  saveLastSyncedTime,
  loadLastSyncedTime,
  ServerConfig,
} from '../../src/services/storage';

describe('storage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('saveServerConfig', () => {
    const testConfig: ServerConfig = {
      id: 'test-id-1',
      url: 'https://example.com',
      apiKey: 'test-api-key',
    };

    test('saves new config to storage', async () => {
      await saveServerConfig(testConfig);

      const configs = await getAllServerConfigs();
      expect(configs).toEqual([testConfig]);
    });

    test('updates existing config with same ID', async () => {
      await saveServerConfig(testConfig);

      const updatedConfig = { ...testConfig, apiKey: 'new-key' };
      await saveServerConfig(updatedConfig);

      const configs = await getAllServerConfigs();
      expect(configs).toEqual([updatedConfig]);
      expect(configs).toHaveLength(1);
    });

    test('sets saved config as active automatically', async () => {
      await saveServerConfig(testConfig);

      const activeConfig = await getActiveServerConfig();
      expect(activeConfig).toEqual(testConfig);
    });

    test('throws when setItem fails', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage error'));

      await expect(saveServerConfig(testConfig)).rejects.toThrow('Storage error');
    });
  });

  describe('getActiveServerConfig', () => {
    const testConfig: ServerConfig = {
      id: 'active-id',
      url: 'https://example.com',
      apiKey: 'test-key',
    };

    test('returns null when no active config ID exists', async () => {
      const result = await getActiveServerConfig();

      expect(result).toBeNull();
    });

    test("returns null when active ID doesn't match any config", async () => {
      await saveServerConfig(testConfig);
      await setActiveServerConfig('nonexistent-id');

      const result = await getActiveServerConfig();

      expect(result).toBeNull();
    });

    test('returns matching config when active ID exists', async () => {
      await saveServerConfig(testConfig);

      const result = await getActiveServerConfig();

      expect(result).toEqual(testConfig);
    });

    test('throws on storage error', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      await expect(getActiveServerConfig()).rejects.toThrow('Storage error');
    });
  });

  describe('getAllServerConfigs', () => {
    test('returns empty array when no configs exist', async () => {
      const result = await getAllServerConfigs();

      expect(result).toEqual([]);
    });

    test('returns all saved configs', async () => {
      const config1: ServerConfig = { id: '1', url: 'https://a.com', apiKey: 'key1' };
      const config2: ServerConfig = { id: '2', url: 'https://b.com', apiKey: 'key2' };

      await saveServerConfig(config1);
      await saveServerConfig(config2);

      const result = await getAllServerConfigs();

      expect(result).toEqual([config1, config2]);
    });

    test('returns empty array when stored JSON is malformed', async () => {
      await AsyncStorage.setItem('serverConfigs', 'not valid json');

      const result = await getAllServerConfigs();

      expect(result).toEqual([]);
    });

    test("returns empty array on storage error (doesn't throw)", async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await getAllServerConfigs();

      expect(result).toEqual([]);
    });
  });

  describe('setActiveServerConfig', () => {
    test('saves config ID to storage', async () => {
      const config: ServerConfig = { id: 'my-config-id', url: 'https://a.com', apiKey: 'k1' };
      await saveServerConfig(config);

      await setActiveServerConfig('my-config-id');

      const activeConfig = await getActiveServerConfig();
      expect(activeConfig).toEqual(config);
    });

    test('throws on storage error', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage error'));

      await expect(setActiveServerConfig('id')).rejects.toThrow('Storage error');
    });
  });

  describe('deleteServerConfig', () => {
    const config1: ServerConfig = { id: 'id-1', url: 'https://a.com', apiKey: 'k1' };
    const config2: ServerConfig = { id: 'id-2', url: 'https://b.com', apiKey: 'k2' };

    test('removes config from storage', async () => {
      await saveServerConfig(config1);
      await saveServerConfig(config2);

      await deleteServerConfig('id-1');

      const configs = await getAllServerConfigs();
      expect(configs).toEqual([config2]);
    });

    test('clears active config when deleted config was active', async () => {
      await saveServerConfig(config1);
      await saveServerConfig(config2);
      await setActiveServerConfig('id-1');

      await deleteServerConfig('id-1');

      const activeConfig = await getActiveServerConfig();
      expect(activeConfig).toBeNull();
    });

    test('preserves active config when deleted config was not active', async () => {
      await saveServerConfig(config1);
      await saveServerConfig(config2);
      await setActiveServerConfig('id-2');

      await deleteServerConfig('id-1');

      const activeConfig = await getActiveServerConfig();
      expect(activeConfig).toEqual(config2);
    });

    test('throws when setItem fails', async () => {
      await saveServerConfig(config1);
      await saveServerConfig(config2);

      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage error'));

      await expect(deleteServerConfig('id-1')).rejects.toThrow('Storage error');
    });
  });

  describe('saveTimeRange', () => {
    test('saves time range value to storage', async () => {
      await saveTimeRange('7d');

      const result = await loadTimeRange();
      expect(result).toBe('7d');
    });

    test('throws on storage error', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage error'));

      await expect(saveTimeRange('24h')).rejects.toThrow('Storage error');
    });
  });

  describe('loadTimeRange', () => {
    test('returns saved time range', async () => {
      await saveTimeRange('30d');

      const result = await loadTimeRange();

      expect(result).toBe('30d');
    });

    test('returns null when no value exists', async () => {
      const result = await loadTimeRange();

      expect(result).toBeNull();
    });

    test("returns null on storage error (doesn't throw)", async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadTimeRange();

      expect(result).toBeNull();
    });
  });

  describe('saveLastSyncedTime', () => {
    test('saves current ISO timestamp', async () => {
      const mockDate = new Date('2024-06-15T12:30:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      await saveLastSyncedTime();

      jest.restoreAllMocks();
      const result = await loadLastSyncedTime();
      expect(result).toBe('2024-06-15T12:30:00.000Z');
    });

    test('returns the saved timestamp', async () => {
      const mockDate = new Date('2024-06-15T12:30:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const result = await saveLastSyncedTime();

      expect(result).toBe('2024-06-15T12:30:00.000Z');
    });

    test("returns null on storage error (doesn't throw)", async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await saveLastSyncedTime();

      expect(result).toBeNull();
    });
  });

  describe('loadLastSyncedTime', () => {
    test('returns saved timestamp', async () => {
      const mockDate = new Date('2024-06-15T12:30:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      await saveLastSyncedTime();
      jest.restoreAllMocks();

      const result = await loadLastSyncedTime();

      expect(result).toBe('2024-06-15T12:30:00.000Z');
    });

    test('returns null when no value exists', async () => {
      const result = await loadLastSyncedTime();

      expect(result).toBeNull();
    });

    test("returns null on storage error (doesn't throw)", async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadLastSyncedTime();

      expect(result).toBeNull();
    });
  });
});
