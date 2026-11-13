import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';
import { getAuthHeaders } from '../../src/services/api/authService';
import {
  getActiveServerConfig,
  getActiveServerConfigId,
  proxyHeadersToRecord,
} from '../../src/services/storage';
import {
  isPayloadForActiveServer,
  syncWatchServerCredentials,
} from '../../src/services/watchServerCredentials';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    setTelemetryOwner: jest.fn(async () => undefined),
    setServerCredentials: jest.fn(async () => undefined),
    clearServerCredentials: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  getActiveServerConfigId: jest.fn(),
  proxyHeadersToRecord: jest.fn(() => ({})),
}));

jest.mock('../../src/services/api/authService', () => ({
  getAuthHeaders: jest.fn(() => ({ Authorization: 'Bearer tok-123' })),
}));

describe('watchServerCredentials', () => {
  const originalPlatformOs = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatformOs,
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatformOs,
      configurable: true,
    });
  });

  describe('syncWatchServerCredentials', () => {
    it('only reads getActiveServerConfigId on iOS without calling native credential methods', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'ios',
        configurable: true,
      });
      (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-ios');

      const ownerId = await syncWatchServerCredentials();

      expect(ownerId).toBe('srv-ios');
      expect(getActiveServerConfigId).toHaveBeenCalledTimes(1);
      expect(getActiveServerConfig).not.toHaveBeenCalled();
      expect(WatchConnectivity?.setTelemetryOwner).not.toHaveBeenCalled();
      expect(WatchConnectivity?.setServerCredentials).not.toHaveBeenCalled();
      expect(WatchConnectivity?.clearServerCredentials).not.toHaveBeenCalled();
    });

    it('sets telemetry owner and credentials from one ServerConfig snapshot on Android', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
      });
      const cfg = {
        id: 'srv-android',
        url: 'https://sparky.example.com/',
        proxyHeaders: [{ key: 'X-Proxy', value: '1' }],
      };
      (getActiveServerConfig as jest.Mock).mockResolvedValue(cfg);
      (proxyHeadersToRecord as jest.Mock).mockReturnValue({ 'X-Proxy': '1' });
      (getAuthHeaders as jest.Mock).mockReturnValue({
        Authorization: 'Bearer secret',
      });

      const ownerId = await syncWatchServerCredentials();

      expect(ownerId).toBe('srv-android');
      expect(getActiveServerConfig).toHaveBeenCalled();
      expect(getActiveServerConfigId).not.toHaveBeenCalled();
      expect(WatchConnectivity?.setTelemetryOwner).toHaveBeenCalledWith(
        'srv-android'
      );
      expect(WatchConnectivity?.setServerCredentials).toHaveBeenCalledWith(
        'https://sparky.example.com',
        {
          'X-Proxy': '1',
          Authorization: 'Bearer secret',
          'X-Meal-Model-Version': '2',
        }
      );
      expect(WatchConnectivity?.clearServerCredentials).not.toHaveBeenCalled();
    });

    it('skips superseded credential writes when overlapping syncs run', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
      });
      const cfgA = {
        id: 'srv-a',
        url: 'https://a.example.com',
        proxyHeaders: [],
      };
      const cfgB = {
        id: 'srv-b',
        url: 'https://b.example.com',
        proxyHeaders: [],
      };
      let currentCfg = cfgA;
      (getActiveServerConfig as jest.Mock).mockImplementation(
        async () => currentCfg
      );

      const first = syncWatchServerCredentials();
      currentCfg = cfgB;
      const second = syncWatchServerCredentials();

      const [firstOwner, secondOwner] = await Promise.all([first, second]);
      expect(firstOwner).toBe('srv-a');
      expect(secondOwner).toBe('srv-b');
      expect(WatchConnectivity?.setTelemetryOwner).toHaveBeenCalledTimes(1);
      expect(WatchConnectivity?.setTelemetryOwner).toHaveBeenLastCalledWith(
        'srv-b'
      );
      expect(WatchConnectivity?.setServerCredentials).toHaveBeenCalledTimes(1);
      expect(WatchConnectivity?.setServerCredentials).toHaveBeenLastCalledWith(
        'https://b.example.com',
        expect.any(Object)
      );
    });

    it('clears credentials on Android when no active server URL is present', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
      });
      (getActiveServerConfig as jest.Mock).mockResolvedValue(null);

      const ownerId = await syncWatchServerCredentials();

      expect(ownerId).toBeNull();
      expect(WatchConnectivity?.setTelemetryOwner).toHaveBeenCalledWith('');
      expect(WatchConnectivity?.clearServerCredentials).toHaveBeenCalledTimes(
        1
      );
      expect(WatchConnectivity?.setServerCredentials).not.toHaveBeenCalled();
    });
  });

  describe('isPayloadForActiveServer', () => {
    it('passes through payloads without an ownerId', async () => {
      expect(await isPayloadForActiveServer({})).toBe(true);
      expect(getActiveServerConfigId).not.toHaveBeenCalled();
    });

    it('accepts payloads whose ownerId matches the active server', async () => {
      (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
      expect(await isPayloadForActiveServer({ ownerId: 'srv-1' })).toBe(true);
    });

    it('rejects payloads when ownerId mismatches or no server is active', async () => {
      (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-2');
      expect(await isPayloadForActiveServer({ ownerId: 'srv-1' })).toBe(false);

      (getActiveServerConfigId as jest.Mock).mockResolvedValue(null);
      expect(await isPayloadForActiveServer({ ownerId: 'srv-1' })).toBe(false);
    });
  });
});
