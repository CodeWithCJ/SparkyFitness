import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { setOnSessionExpired, setOnNoConfigs } from '../../src/services/api/authService';
import { getActiveServerConfig, clearServerConfigCache } from '../../src/services/storage';

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

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveServerConfig.mockResolvedValue(null);
  });

  test('shows login modal when no active config on mount', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth());

    // Wait for the async check to complete
    await act(async () => {});

    expect(result.current.showLoginModal).toBe(true);
  });

  test('does not show login modal when config exists', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.showLoginModal).toBe(false);
  });

  test('registers callbacks on mount', async () => {
    renderHook(() => useAuth());

    await act(async () => {});

    expect(mockSetOnSessionExpired).toHaveBeenCalledTimes(1);
    expect(mockSetOnSessionExpired).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetOnNoConfigs).toHaveBeenCalledTimes(1);
    expect(mockSetOnNoConfigs).toHaveBeenCalledWith(expect.any(Function));
  });

  test('session expired callback shows modal with config ID', async () => {
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

    expect(result.current.showLoginModal).toBe(true);
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

    expect(result.current.showLoginModal).toBe(false);
    mockClearServerConfigCache.mockClear();

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });

    expect(mockClearServerConfigCache).toHaveBeenCalledTimes(1);
  });

  test('no-configs callback shows modal', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: '1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.showLoginModal).toBe(false);

    const noConfigsCb = mockSetOnNoConfigs.mock.calls[0][0];
    act(() => {
      noConfigsCb();
    });

    expect(result.current.showLoginModal).toBe(true);
  });

  test('dismissLoginModal resets state', async () => {
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
    expect(result.current.showLoginModal).toBe(true);
    expect(result.current.expiredConfigId).toBe('config-42');

    act(() => {
      result.current.dismissLoginModal();
    });

    expect(result.current.showLoginModal).toBe(false);
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
    expect(result.current.showLoginModal).toBe(true);

    act(() => {
      result.current.handleLoginSuccess();
    });

    expect(result.current.showLoginModal).toBe(false);
    expect(result.current.expiredConfigId).toBeNull();
  });
});
