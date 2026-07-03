import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveHealthPreference,
  loadHealthPreference,
  saveStringPreference,
  loadStringPreference,
  saveSyncDuration,
  loadSyncDuration,
  SyncDuration,
} from '../../../src/services/healthkit/preferences';
import { addLog } from '../../../src/services/LogService';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockAddLog = addLog as jest.Mock;

describe('preferences', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('saveHealthPreference / loadHealthPreference (JSON storage)', () => {
    test('saves and loads boolean value', async () => {
      await saveHealthPreference('stepsEnabled', true);

      const result = await loadHealthPreference<boolean>('stepsEnabled');

      expect(result).toBe(true);
    });

    test('saves and loads false boolean value', async () => {
      await saveHealthPreference('stepsEnabled', false);

      const result = await loadHealthPreference<boolean>('stepsEnabled');

      expect(result).toBe(false);
    });

    test('saves and loads object value', async () => {
      const value = { enabled: true, lastSync: '2024-01-15' };

      await saveHealthPreference('syncStatus', value);

      const result = await loadHealthPreference<typeof value>('syncStatus');
      expect(result).toEqual(value);
    });

    test('saves and loads array value', async () => {
      const value = ['steps', 'heartRate', 'weight'];

      await saveHealthPreference('enabledMetrics', value);

      const result = await loadHealthPreference<string[]>('enabledMetrics');
      expect(result).toEqual(value);
    });

    test('returns null when key does not exist', async () => {
      const result = await loadHealthPreference('nonExistentKey');

      expect(result).toBeNull();
    });

    test('logs error and returns undefined on save error', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage full'));

      const result = await saveHealthPreference('testKey', 'value');

      expect(result).toBeUndefined();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthKitService] Failed to save preference testKey: Storage full',
        'ERROR'
      );
    });

    test('logs error and returns null on load error', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadHealthPreference('testKey');

      expect(result).toBeNull();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthKitService] Failed to load preference testKey: Storage error',
        'ERROR'
      );
    });
  });

  describe('saveStringPreference / loadStringPreference', () => {
    test('saves and loads string value without JSON encoding', async () => {
      await saveStringPreference('serverUrl', 'https://example.com');

      const result = await loadStringPreference('serverUrl');

      expect(result).toBe('https://example.com');
    });

    test('returns null when key does not exist', async () => {
      const result = await loadStringPreference('nonExistentKey');

      expect(result).toBeNull();
    });

    test('logs error and returns undefined on save error', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage full'));

      const result = await saveStringPreference('serverUrl', 'https://example.com');

      expect(result).toBeUndefined();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthKitService] Failed to save string preference serverUrl: Storage full',
        'ERROR'
      );
    });

    test('logs error and returns null on load error', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadStringPreference('serverUrl');

      expect(result).toBeNull();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthKitService] Failed to load string preference serverUrl: Storage error',
        'ERROR'
      );
    });
  });

  describe('saveSyncDuration / loadSyncDuration', () => {
    test('saves and loads sync duration value', async () => {
      await saveSyncDuration('7d');

      const result = await loadSyncDuration();

      expect(result).toBe('7d');
    });

    test("returns '24h' as default when no value stored", async () => {
      const result = await loadSyncDuration();

      expect(result).toBe('24h');
    });

    test("logs error and returns '24h' on load error", async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await loadSyncDuration();

      expect(result).toBe('24h');
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthKitService] Failed to load sync duration: Storage error',
        'ERROR'
      );
    });

    test('logs error and returns undefined on save error', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage full'));

      const result = await saveSyncDuration('30d');

      expect(result).toBeUndefined();
      expect(mockAddLog).toHaveBeenCalledWith(
        '[HealthKitService] Failed to save sync duration: Storage full',
        'ERROR'
      );
    });

    test('stores and retrieves various duration values correctly', async () => {
      const durations: SyncDuration[] = ['today', '24h', '3d', '7d', '30d', '90d'];

      for (const duration of durations) {
        await saveSyncDuration(duration);
        const result = await loadSyncDuration();
        expect(result).toBe(duration);
      }
    });
  });
});
