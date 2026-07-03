import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveHealthPreference,
  loadHealthPreference,
  saveStringPreference,
  loadStringPreference,
  saveSyncDuration,
  loadSyncDuration,
  SyncDuration,
} from '../../../src/services/healthconnect/preferences';
import { addLog } from '../../../src/services/LogService';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockAddLog = addLog as jest.Mock;

describe('preferences', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('saveHealthPreference / loadHealthPreference (JSON storage)', () => {
    test('saves boolean value as JSON', async () => {
      await saveHealthPreference('stepsEnabled', true);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:stepsEnabled',
        JSON.stringify(true)
      );
    });

    test('loads and parses JSON boolean value', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(true));

      const result = await loadHealthPreference<boolean>('stepsEnabled');

      expect(result).toBe(true);
    });

    test('saves object value as JSON', async () => {
      const value = { enabled: true, lastSync: '2024-01-15' };
      await saveHealthPreference('syncStatus', value);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:syncStatus',
        JSON.stringify(value)
      );
    });

    test('loads and parses JSON object value', async () => {
      const value = { enabled: true, lastSync: '2024-01-15' };
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(value));

      const result = await loadHealthPreference<typeof value>('syncStatus');

      expect(result).toEqual(value);
    });

    test('saves array value as JSON', async () => {
      const value = ['steps', 'heartRate', 'weight'];
      await saveHealthPreference('enabledMetrics', value);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:enabledMetrics',
        JSON.stringify(value)
      );
    });

    test('loads and parses JSON array value', async () => {
      const value = ['steps', 'heartRate', 'weight'];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(value));

      const result = await loadHealthPreference<string[]>('enabledMetrics');

      expect(result).toEqual(value);
    });

    test('returns null when key does not exist', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await loadHealthPreference('nonExistentKey');

      expect(result).toBeNull();
    });

    test('logs error and returns undefined on save error', async () => {
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));

      const result = await saveHealthPreference('testKey', 'value');

      expect(result).toBeUndefined();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthConnectService] Failed to save preference testKey: Storage full',
        'ERROR'
      );
    });

    test('logs error and returns null on load error', async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadHealthPreference('testKey');

      expect(result).toBeNull();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthConnectService] Failed to load preference testKey: Storage error',
        'ERROR'
      );
    });
  });

  describe('saveStringPreference / loadStringPreference', () => {
    test('saves string value without JSON encoding', async () => {
      await saveStringPreference('serverUrl', 'https://example.com');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:serverUrl',
        'https://example.com' // Not JSON encoded
      );
    });

    test('loads string value from storage', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce('https://example.com');

      const result = await loadStringPreference('serverUrl');

      expect(result).toBe('https://example.com');
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@HealthConnect:serverUrl');
    });

    test('returns null when key does not exist', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await loadStringPreference('nonExistentKey');

      expect(result).toBeNull();
    });

    test('logs error and returns undefined on save error', async () => {
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));

      const result = await saveStringPreference('serverUrl', 'https://example.com');

      expect(result).toBeUndefined();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthConnectService] Failed to save string preference serverUrl: Storage full',
        'ERROR'
      );
    });

    test('logs error and returns null on load error', async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadStringPreference('serverUrl');

      expect(result).toBeNull();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthConnectService] Failed to load string preference serverUrl: Storage error',
        'ERROR'
      );
    });
  });

  describe('saveSyncDuration / loadSyncDuration', () => {
    test('saves sync duration value', async () => {
      await saveSyncDuration('7d');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:syncDuration',
        '7d'
      );
    });

    test('loads sync duration value from storage', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce('7d');

      const result = await loadSyncDuration();

      expect(result).toBe('7d');
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@HealthConnect:syncDuration');
    });

    test("returns '24h' as default when no value stored", async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await loadSyncDuration();

      expect(result).toBe('24h');
    });

    test("logs error and returns '24h' on load error", async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadSyncDuration();

      expect(result).toBe('24h');
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthConnectService] Failed to load sync duration: Storage error',
        'ERROR'
      );
    });

    test('logs error and returns undefined on save error', async () => {
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));

      const result = await saveSyncDuration('30d');

      expect(result).toBeUndefined();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthConnectService] Failed to save sync duration: Storage full',
        'ERROR'
      );
    });

    test('stores various duration values correctly', async () => {
      const durations: SyncDuration[] = ['today', '24h', '3d', '7d', '30d', '90d'];

      for (const duration of durations) {
        jest.clearAllMocks();
        await saveSyncDuration(duration);
        expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
          '@HealthConnect:syncDuration',
          duration
        );
      }
    });
  });
});
