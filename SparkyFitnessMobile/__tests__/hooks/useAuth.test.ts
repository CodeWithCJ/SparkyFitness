import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from '../../src/hooks/useAuth';
import {
  setOnSessionExpired,
  setOnNoConfigs,
  setOnIdentityChanged,
  suppressSessionExpired,
} from '../../src/services/api/authService';
import { clearServerConfigCache } from '../../src/services/storage';
import type { ServerConfig } from '../../src/services/storage';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';
import type { QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/authService', () => ({
  setOnSessionExpired: jest.fn(),
  setOnNoConfigs: jest.fn(),
  setOnIdentityChanged: jest.fn(),
  suppressSessionExpired: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  clearServerConfigCache: jest.fn(),
}));

const mockSetOnSessionExpired = setOnSessionExpired as jest.MockedFunction<
  typeof setOnSessionExpired
>;
const mockSetOnNoConfigs = setOnNoConfigs as jest.MockedFunction<
  typeof setOnNoConfigs
>;
const mockSetOnIdentityChanged = setOnIdentityChanged as jest.MockedFunction<
  typeof setOnIdentityChanged
>;
const mockClearServerConfigCache =
  clearServerConfigCache as jest.MockedFunction<typeof clearServerConfigCache>;
const mockSuppressSessionExpired =
  suppressSessionExpired as jest.MockedFunction<typeof suppressSessionExpired>;

describe('useAuth', () => {
  let queryClient: QueryClient;

  // The hook reads the query client to drop caches on an identity change, so
  // every render needs a provider around it.
  const renderUseAuth = () =>
    renderHook(() => useAuth(), { wrapper: createQueryWrapper(queryClient) });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  test('does not auto-show any modal on mount', async () => {
    const { result } = renderUseAuth();

    await act(async () => {});

    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.authModalReason).toBeNull();
  });

  test('registers callbacks on mount', async () => {
    renderUseAuth();

    await act(async () => {});

    expect(mockSetOnSessionExpired).toHaveBeenCalledTimes(1);
    expect(mockSetOnSessionExpired).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetOnNoConfigs).toHaveBeenCalledTimes(1);
    expect(mockSetOnNoConfigs).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetOnIdentityChanged).toHaveBeenCalledTimes(1);
    expect(mockSetOnIdentityChanged).toHaveBeenCalledWith(expect.any(Function));
  });

  test('identity changed callback drops every cached query', async () => {
    renderUseAuth();
    await act(async () => {});

    queryClient.setQueryData(['dailySummary', '2026-01-01'], {
      calories: 1800,
    });
    queryClient.setQueryData(['measurements', '2026-01-01'], { weight: 70 });

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    act(() => {
      identityChangedCb();
    });

    expect(
      queryClient.getQueryData(['dailySummary', '2026-01-01'])
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(['measurements', '2026-01-01'])
    ).toBeUndefined();
  });

  test('session expired callback shows reauth modal with config ID', async () => {
    const { result } = renderUseAuth();
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
    const { result } = renderUseAuth();
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
    const { result } = renderUseAuth();
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
    const { result } = renderUseAuth();
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
    const { result } = renderUseAuth();
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
      const { result } = renderUseAuth();
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
      const { result } = renderUseAuth();
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
      const { result } = renderUseAuth();
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
      const { result } = renderUseAuth();
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
      const { result } = renderUseAuth();
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
