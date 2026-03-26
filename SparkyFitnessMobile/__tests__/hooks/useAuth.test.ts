import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { setOnSessionExpired, setOnNoConfigs, suppressSessionExpired } from '../../src/services/api/authService';
import { getActiveServerConfig, clearServerConfigCache } from '../../src/services/storage';
import type { ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/api/authService', () => ({
  setOnSessionExpired: jest.fn(),
  setOnNoConfigs: jest.fn(),
  suppressSessionExpired: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  clearServerConfigCache: jest.fn(),
}));

const mockSetOnSessionExpired = setOnSessionExpired as jest.MockedFunction<typeof setOnSessionExpired>;
const mockSetOnNoConfigs = setOnNoConfigs as jest.MockedFunction<typeof setOnNoConfigs>;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;
const mockClearServerConfigCache = clearServerConfigCache as jest.MockedFunction<typeof clearServerConfigCache>;
const mockSuppressSessionExpired = suppressSessionExpired as jest.MockedFunction<typeof suppressSessionExpired>;

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveServerConfig.mockResolvedValue(null);
  });

  test('shows setup modal when no active config on mount', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.showSetupModal).toBe(true);
    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.authModalReason).toBe('no_configs');
  });

  test('does not show any modal when config exists', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.authModalReason).toBeNull();
  });

  test('registers callbacks on mount', async () => {
    renderHook(() => useAuth());

    await act(async () => {});

    expect(mockSetOnSessionExpired).toHaveBeenCalledTimes(1);
    expect(mockSetOnSessionExpired).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetOnNoConfigs).toHaveBeenCalledTimes(1);
    expect(mockSetOnNoConfigs).toHaveBeenCalledWith(expect.any(Function));
  });

  test('session expired callback shows reauth modal with config ID', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });

    expect(result.current.showReauthModal).toBe(true);
    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.authModalReason).toBe('session_expired');
    expect(result.current.expiredConfigId).toBe('config-42');
  });

  test('session expired clears config cache on first trigger', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    expect(result.current.showReauthModal).toBe(false);
    mockClearServerConfigCache.mockClear();

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });

    expect(mockClearServerConfigCache).toHaveBeenCalledTimes(1);
  });

  test('no-configs callback shows setup modal', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.showSetupModal).toBe(false);

    const noConfigsCb = mockSetOnNoConfigs.mock.calls[0][0];
    act(() => {
      noConfigsCb();
    });

    expect(result.current.showSetupModal).toBe(true);
    expect(result.current.authModalReason).toBe('no_configs');
  });

  test('dismissModal resets state', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });
    expect(result.current.showReauthModal).toBe(true);
    expect(result.current.expiredConfigId).toBe('config-42');

    act(() => {
      result.current.dismissModal();
    });

    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.authModalReason).toBeNull();
    expect(result.current.expiredConfigId).toBeNull();
  });

  test('handleLoginSuccess resets state', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });
    expect(result.current.showReauthModal).toBe(true);

    act(() => {
      result.current.handleLoginSuccess();
    });

    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.authModalReason).toBeNull();
    expect(result.current.expiredConfigId).toBeNull();
  });

  describe('switchToApiKey flow', () => {
    const expiredConfig: ServerConfig = {
      id: 'cfg-1',
      url: 'https://example.com',
      apiKey: '',
      authType: 'session',
      sessionToken: 'old-tok',
    };

    test('handleSwitchToApiKey hides reauth modal and exposes config', async () => {
      mockGetActiveServerConfig.mockResolvedValue(expiredConfig);
      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      // Trigger session expired first
      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });
      expect(result.current.showReauthModal).toBe(true);

      // Switch to API key
      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });

      expect(result.current.showReauthModal).toBe(false);
      expect(result.current.showApiKeySwitchModal).toBe(true);
      expect(result.current.switchToApiKeyConfig).toBe(expiredConfig);
      expect(result.current.expiredConfigId).toBeNull();
    });

    test('handleSwitchToApiKey keeps suppression active', async () => {
      mockGetActiveServerConfig.mockResolvedValue(expiredConfig);
      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });
      mockSuppressSessionExpired.mockClear();

      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });

      // Should NOT call suppressSessionExpired(false)
      expect(mockSuppressSessionExpired).not.toHaveBeenCalled();
    });

    test('handleSwitchToApiKeyDone clears state and unsuppresses', async () => {
      mockGetActiveServerConfig.mockResolvedValue(expiredConfig);
      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });
      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });
      expect(result.current.showApiKeySwitchModal).toBe(true);

      mockSuppressSessionExpired.mockClear();
      act(() => {
        result.current.handleSwitchToApiKeyDone();
      });

      expect(result.current.showApiKeySwitchModal).toBe(false);
      expect(result.current.switchToApiKeyConfig).toBeNull();
      expect(mockSuppressSessionExpired).toHaveBeenCalledWith(false);
    });

    test('session expired callback clears switchToApiKeyConfig', async () => {
      mockGetActiveServerConfig.mockResolvedValue(expiredConfig);
      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });
      expect(result.current.showApiKeySwitchModal).toBe(true);

      // Simulate another session expired event
      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });

      expect(result.current.showApiKeySwitchModal).toBe(false);
      expect(result.current.showReauthModal).toBe(true);
    });

    test('no-configs callback clears switchToApiKeyConfig', async () => {
      mockGetActiveServerConfig.mockResolvedValue(expiredConfig);
      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });
      expect(result.current.showApiKeySwitchModal).toBe(true);

      const noConfigsCb = mockSetOnNoConfigs.mock.calls[0][0];
      act(() => {
        noConfigsCb();
      });

      expect(result.current.showApiKeySwitchModal).toBe(false);
      expect(result.current.showSetupModal).toBe(true);
    });
  });
});
