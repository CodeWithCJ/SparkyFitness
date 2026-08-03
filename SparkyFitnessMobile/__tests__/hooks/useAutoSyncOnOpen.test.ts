import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAutoSyncOnOpen } from '../../src/hooks/useAutoSyncOnOpen';
import type { useSyncHealthData } from '../../src/hooks/useSyncHealthData';
import {
  loadTimeRange,
  getActiveServerConfig,
  loadSyncOnOpenEnabled,
} from '../../src/services/storage';
import { initHealthConnect, loadHealthPreference } from '../../src/services/healthConnectService';
import { HEALTH_METRICS } from '../../src/HealthMetrics';
import { flushPendingHealthSyncCacheRefresh } from '../../src/services/backgroundSyncService';
import {
  tryClaimAutoSync,
  isForegroundAutoSyncWindowOpen,
  setForegroundAutoSyncWindowOpen,
  shouldRunForegroundResumeAutoSync,
  recordAutoSyncTime,
} from '../../src/services/autoSyncCoordinator';

jest.mock('../../src/services/storage', () => ({
  loadTimeRange: jest.fn(),
  getActiveServerConfig: jest.fn(),
  loadSyncOnOpenEnabled: jest.fn(),
}));

jest.mock('../../src/services/healthConnectService', () => ({
  initHealthConnect: jest.fn(),
  loadHealthPreference: jest.fn(),
}));

jest.mock('../../src/services/backgroundSyncService', () => ({
  flushPendingHealthSyncCacheRefresh: jest.fn(),
}));

jest.mock('../../src/services/autoSyncCoordinator', () => ({
  tryClaimAutoSync: jest.fn(),
  isForegroundAutoSyncWindowOpen: jest.fn(),
  setForegroundAutoSyncWindowOpen: jest.fn(),
  shouldRunForegroundResumeAutoSync: jest.fn(),
  recordAutoSyncTime: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockLoadTimeRange = loadTimeRange as jest.MockedFunction<typeof loadTimeRange>;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;
const mockLoadSyncOnOpenEnabled = loadSyncOnOpenEnabled as jest.MockedFunction<typeof loadSyncOnOpenEnabled>;
const mockInitHealthConnect = initHealthConnect as jest.MockedFunction<typeof initHealthConnect>;
const mockLoadHealthPreference = loadHealthPreference as jest.MockedFunction<typeof loadHealthPreference>;
const mockFlushPendingRefresh = flushPendingHealthSyncCacheRefresh as jest.MockedFunction<typeof flushPendingHealthSyncCacheRefresh>;
const mockTryClaimAutoSync = tryClaimAutoSync as jest.MockedFunction<typeof tryClaimAutoSync>;
const mockIsWindowOpen = isForegroundAutoSyncWindowOpen as jest.MockedFunction<typeof isForegroundAutoSyncWindowOpen>;
const mockSetWindowOpen = setForegroundAutoSyncWindowOpen as jest.MockedFunction<typeof setForegroundAutoSyncWindowOpen>;
const mockShouldRunResume = shouldRunForegroundResumeAutoSync as jest.MockedFunction<typeof shouldRunForegroundResumeAutoSync>;
const mockRecordAutoSyncTime = recordAutoSyncTime as jest.MockedFunction<typeof recordAutoSyncTime>;

type SyncMutation = ReturnType<typeof useSyncHealthData>;

function buildSyncMutation(overrides: Partial<{ isPending: boolean }> = {}): SyncMutation {
  return {
    isPending: overrides.isPending === true,
    mutate: jest.fn(),
  } as unknown as SyncMutation;
}

const ALL_METRICS_ENABLED = Object.fromEntries(
  HEALTH_METRICS.map((metric) => [metric.stateKey, true]),
);

function mockHappyPathServices() {
  mockLoadSyncOnOpenEnabled.mockResolvedValue(true);
  mockGetActiveServerConfig.mockResolvedValue({ id: 'cfg-1' } as Awaited<ReturnType<typeof getActiveServerConfig>>);
  mockInitHealthConnect.mockResolvedValue(true);
  mockLoadTimeRange.mockResolvedValue('7d');
  mockLoadHealthPreference.mockResolvedValue(true);
  mockRecordAutoSyncTime.mockResolvedValue(undefined);
  mockFlushPendingRefresh.mockResolvedValue(undefined);
  mockShouldRunResume.mockResolvedValue(true);
}

let appStateHandler: ((state: string) => void | Promise<void>) | null = null;
const removeSubscription = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (state: string) => void) => {
    appStateHandler = handler;
    return { remove: removeSubscription };
  }) as unknown as typeof AppState.addEventListener);
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

// Fake-timer tests restore real timers inside the test body: react-native
// testing library's auto-cleanup awaits timer-driven work and hangs if fake
// timers are still installed when it runs.
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAutoSyncOnOpen cold-start sync', () => {
  it('opens the window, claims, and mutates with loaded preferences when on Tabs', async () => {
    mockHappyPathServices();
    const release = jest.fn();
    mockTryClaimAutoSync.mockReturnValue(release);
    const syncMutation = buildSyncMutation();

    renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Tabs', syncMutation }));

    await waitFor(() => expect(syncMutation.mutate).toHaveBeenCalledTimes(1));
    expect(mockSetWindowOpen).toHaveBeenCalledWith(true);
    expect(syncMutation.mutate).toHaveBeenCalledWith(
      { timeRange: '7d', healthMetricStates: ALL_METRICS_ENABLED },
      expect.objectContaining({ onSettled: expect.any(Function), onSuccess: expect.any(Function) }),
    );

    const options = (syncMutation.mutate as jest.Mock).mock.calls[0][1];
    act(() => {
      options.onSuccess();
      options.onSettled();
    });
    expect(mockRecordAutoSyncTime).toHaveBeenCalledWith('cfg-1');
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockSetWindowOpen).toHaveBeenLastCalledWith(false);
  });

  it('does nothing when the initial route is Onboarding', async () => {
    mockHappyPathServices();
    const syncMutation = buildSyncMutation();

    renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Onboarding', syncMutation }));
    await flushAsync();

    expect(mockLoadSyncOnOpenEnabled).not.toHaveBeenCalled();
    expect(mockTryClaimAutoSync).not.toHaveBeenCalled();
    expect(syncMutation.mutate).not.toHaveBeenCalled();
  });

  it('does nothing when sync-on-open is disabled', async () => {
    mockHappyPathServices();
    mockLoadSyncOnOpenEnabled.mockResolvedValue(false);
    const syncMutation = buildSyncMutation();

    renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Tabs', syncMutation }));
    await flushAsync();

    expect(mockSetWindowOpen).not.toHaveBeenCalled();
    expect(mockTryClaimAutoSync).not.toHaveBeenCalled();
    expect(syncMutation.mutate).not.toHaveBeenCalled();
  });

  it('closes the window again without syncing when the claim is not granted', async () => {
    mockHappyPathServices();
    mockTryClaimAutoSync.mockReturnValue(null);
    const syncMutation = buildSyncMutation();

    renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Tabs', syncMutation }));
    await flushAsync();

    expect(mockSetWindowOpen).toHaveBeenNthCalledWith(1, true);
    expect(mockSetWindowOpen).toHaveBeenNthCalledWith(2, false);
    expect(syncMutation.mutate).not.toHaveBeenCalled();
  });

  it('releases the claim and closes the window via the watchdog when the sync never settles', async () => {
    jest.useFakeTimers();
    mockHappyPathServices();
    const release = jest.fn();
    mockTryClaimAutoSync.mockReturnValue(release);
    const syncMutation = buildSyncMutation();

    renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Tabs', syncMutation }));
    await flushAsync();
    expect(syncMutation.mutate).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(90_000);
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockSetWindowOpen).toHaveBeenLastCalledWith(false);
    jest.useRealTimers();
  });
});

describe('useAutoSyncOnOpen foreground-return sync', () => {
  it('skips the resume sync when the app was away for less than five minutes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-03T10:00:00Z'));
    mockHappyPathServices();
    mockTryClaimAutoSync.mockReturnValue(jest.fn());
    const syncMutation = buildSyncMutation();

    renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Onboarding', syncMutation }));
    expect(appStateHandler).not.toBeNull();

    await act(async () => {
      await appStateHandler?.('background');
    });
    jest.setSystemTime(new Date('2026-08-03T10:04:00Z'));
    await act(async () => {
      await appStateHandler?.('active');
    });

    expect(mockFlushPendingRefresh).toHaveBeenCalled();
    expect(mockGetActiveServerConfig).not.toHaveBeenCalled();
    expect(syncMutation.mutate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('runs the resume sync when the app was away long enough and the coordinator allows it', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-03T10:00:00Z'));
    mockHappyPathServices();
    const release = jest.fn();
    mockTryClaimAutoSync.mockReturnValue(release);
    const syncMutation = buildSyncMutation();

    renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Onboarding', syncMutation }));

    await act(async () => {
      await appStateHandler?.('background');
    });
    jest.setSystemTime(new Date('2026-08-03T10:06:00Z'));
    await act(async () => {
      await appStateHandler?.('active');
    });

    expect(mockShouldRunResume).toHaveBeenCalledWith('cfg-1');
    expect(mockSetWindowOpen).toHaveBeenCalledWith(true);
    expect(syncMutation.mutate).toHaveBeenCalledWith(
      { timeRange: '7d', healthMetricStates: ALL_METRICS_ENABLED },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
    jest.useRealTimers();
  });

  it('removes the AppState subscription on unmount', () => {
    mockHappyPathServices();
    const { unmount } = renderHook(() =>
      useAutoSyncOnOpen({ initialRoute: 'Onboarding', syncMutation: buildSyncMutation() }),
    );

    unmount();
    expect(removeSubscription).toHaveBeenCalled();
  });
});

describe('shouldYieldObserverSync', () => {
  it('is true only while a deliberate foreground window is open', async () => {
    mockHappyPathServices();
    mockTryClaimAutoSync.mockReturnValue(jest.fn());
    mockIsWindowOpen.mockReturnValue(true);
    const syncMutation = buildSyncMutation();

    const { result } = renderHook(() => useAutoSyncOnOpen({ initialRoute: 'Tabs', syncMutation }));

    await waitFor(() => expect(syncMutation.mutate).toHaveBeenCalled());
    expect(result.current.shouldYieldObserverSync()).toBe(true);

    const options = (syncMutation.mutate as jest.Mock).mock.calls[0][1];
    act(() => {
      options.onSettled();
    });
    expect(result.current.shouldYieldObserverSync()).toBe(false);
  });
});
