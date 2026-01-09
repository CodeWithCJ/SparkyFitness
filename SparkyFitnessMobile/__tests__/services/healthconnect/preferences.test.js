import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveHealthPreference,
  loadHealthPreference,
  saveStringPreference,
  loadStringPreference,
  saveSyncDuration,
  loadSyncDuration,
} from '../../../src/services/healthconnect/preferences';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('preferences', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('saveHealthPreference / loadHealthPreference (JSON storage)', () => {
    test('saves boolean value as JSON', async () => {
      await saveHealthPreference('stepsEnabled', true);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:stepsEnabled',
        JSON.stringify(true)
      );
    });

    test('loads and parses JSON boolean value', async () => {
      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(true));

      const result = await loadHealthPreference('stepsEnabled');

      expect(result).toBe(true);
    });

    test('saves object value as JSON', async () => {
      const value = { enabled: true, lastSync: '2024-01-15' };
      await saveHealthPreference('syncStatus', value);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:syncStatus',
        JSON.stringify(value)
      );
    });

    test('loads and parses JSON object value', async () => {
      const value = { enabled: true, lastSync: '2024-01-15' };
      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(value));

      const result = await loadHealthPreference('syncStatus');

      expect(result).toEqual(value);
    });

    test('saves array value as JSON', async () => {
      const value = ['steps', 'heartRate', 'weight'];
      await saveHealthPreference('enabledMetrics', value);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:enabledMetrics',
        JSON.stringify(value)
      );
    });

    test('loads and parses JSON array value', async () => {
      const value = ['steps', 'heartRate', 'weight'];
      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(value));

      const result = await loadHealthPreference('enabledMetrics');

      expect(result).toEqual(value);
    });

    test('returns null when key does not exist', async () => {
      AsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await loadHealthPreference('nonExistentKey');

      expect(result).toBeNull();
    });

    test('handles save error gracefully', async () => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));

      // Should not throw
      await saveHealthPreference('key', 'value');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    test('returns null on load error', async () => {
      AsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadHealthPreference('key');

      expect(result).toBeNull();
    });
  });

  describe('saveStringPreference / loadStringPreference', () => {
    test('saves string value without JSON encoding', async () => {
      await saveStringPreference('serverUrl', 'https://example.com');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:serverUrl',
        'https://example.com' // Not JSON encoded
      );
    });

    test('loads string value from storage', async () => {
      AsyncStorage.getItem.mockResolvedValueOnce('https://example.com');

      const result = await loadStringPreference('serverUrl');

      expect(result).toBe('https://example.com');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('@HealthConnect:serverUrl');
    });

    test('returns null when key does not exist', async () => {
      AsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await loadStringPreference('nonExistentKey');

      expect(result).toBeNull();
    });

    test('handles save error gracefully', async () => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));

      await saveStringPreference('key', 'value');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    test('returns null on load error', async () => {
      AsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadStringPreference('key');

      expect(result).toBeNull();
    });
  });

  describe('saveSyncDuration / loadSyncDuration', () => {
    test('saves sync duration value', async () => {
      await saveSyncDuration('7d');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@HealthConnect:syncDuration',
        '7d'
      );
    });

    test('loads sync duration value from storage', async () => {
      AsyncStorage.getItem.mockResolvedValueOnce('7d');

      const result = await loadSyncDuration();

      expect(result).toBe('7d');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('@HealthConnect:syncDuration');
    });

    test("returns '24h' as default when no value stored", async () => {
      AsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await loadSyncDuration();

      expect(result).toBe('24h');
    });

    test("returns '24h' on load error", async () => {
      AsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadSyncDuration();

      expect(result).toBe('24h');
    });

    test('handles save error gracefully', async () => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));

      await saveSyncDuration('30d');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    test('stores various duration values correctly', async () => {
      const durations = ['today', '24h', '3d', '7d', '30d', '90d'];

      for (const duration of durations) {
        jest.clearAllMocks();
        await saveSyncDuration(duration);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          '@HealthConnect:syncDuration',
          duration
        );
      }
    });
  });
});
