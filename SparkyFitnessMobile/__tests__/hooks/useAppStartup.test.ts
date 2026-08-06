import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useInitialRoute, useAppStartup } from '../../src/hooks/useAppStartup';
import { getActiveServerConfig, loadBackgroundSyncEnabled } from '../../src/services/storage';
import { startObservers, stopObservers } from '../../src/services/healthConnectService';
import {
  configureBackgroundSync,
  performBackgroundSync,
  flushPendingHealthSyncCacheRefresh,
} from '../../src/services/backgroundSyncService';
import { tryClaimAutoSync } from '../../src/services/autoSyncCoordinator';
import { ensureTimezoneBootstrapped } from '../../src/services/api/preferencesApi';
import { initWorkoutNotificationActions } from '../../src/stores/activeWorkoutStore';
import { initNotifications } from '../../src/services/notifications';
import { initMedicationNotificationActions } from '../../src/services/medicationNotificationHandler';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  loadBackgroundSyncEnabled: jest.fn(),
}));

jest.mock('../../src/services/healthConnectService', () => ({
  startObservers: jest.fn(),
  stopObservers: jest.fn(),
}));

jest.mock('../../src/services/backgroundSyncService', () => ({
  configureBackgroundSync: jest.fn(),
  performBackgroundSync: jest.fn(),
  flushPendingHealthSyncCacheRefresh: jest.fn(),
}));

jest.mock('../../src/services/autoSyncCoordinator', () => ({
  tryClaimAutoSync: jest.fn(),
}));

jest.mock('../../src/services/api/preferencesApi', () => ({
  ensureTimezoneBootstrapped: jest.fn(),
}));

jest.mock('../../src/stores/activeWorkoutStore', () => ({
  initWorkoutNotificationActions: jest.fn(),
}));

jest.mock('../../src/services/notifications', () => ({
  initNotifications: jest.fn(),
}));

jest.mock('../../src/services/medicationNotificationHandler', () => ({
  initMedicationNotificationActions: jest.fn(),
}));

jest.mock('../../src/services/workoutLiveActivity', () => ({
  initWorkoutLiveActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/themeService', () => ({
  initializeTheme: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
  initLogService: jest.fn().mockResolvedValue(undefined),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;
const mockLoadBackgroundSyncEnabled = loadBackgroundSyncEnabled as jest.MockedFunction<typeof loadBackgroundSyncEnabled>;
const mockStartObservers = startObservers as jest.MockedFunction<typeof startObservers>;
const mockStopObservers = stopObservers as jest.MockedFunction<typeof stopObservers>;
const mockConfigureBackgroundSync = configureBackgroundSync as jest.MockedFunction<typeof configureBackgroundSync>;
const mockPerformBackgroundSync = performBackgroundSync as jest.MockedFunction<typeof performBackgroundSync>;
const mockFlushPendingRefresh = flushPendingHealthSyncCacheRefresh as jest.MockedFunction<typeof flushPendingHealthSyncCacheRefresh>;
const mockTryClaimAutoSync = tryClaimAutoSync as jest.MockedFunction<typeof tryClaimAutoSync>;
const mockEnsureTimezoneBootstrapped = ensureTimezoneBootstrapped as jest.MockedFunction<typeof ensureTimezoneBootstrapped>;

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureTimezoneBootstrapped.mockResolvedValue('America/New_York');
  mockConfigureBackgroundSync.mockResolvedValue(undefined);
  mockLoadBackgroundSyncEnabled.mockResolvedValue(true);
  mockFlushPendingRefresh.mockResolvedValue(undefined);
  mockPerformBackgroundSync.mockResolvedValue(undefined as Awaited<ReturnType<typeof performBackgroundSync>>);
});

describe('useInitialRoute', () => {
  it('routes to Tabs and enables linking when an active server config exists', async () => {
    mockGetActiveServerConfig.mockResolvedValue({ id: 'cfg-1' } as Awaited<ReturnType<typeof getActiveServerConfig>>);

    const { result } = renderHook(() => useInitialRoute());

    await waitFor(() => expect(result.current.initialRoute).toBe('Tabs'));
    expect(result.current.linkingEnabled).toBe(true);
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('routes to Onboarding with linking disabled when no config exists', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useInitialRoute());

    await waitFor(() => expect(result.current.initialRoute).toBe('Onboarding'));
    expect(result.current.linkingEnabled).toBe(false);
  });

  it('falls back to Onboarding and still hides the splash when config loading throws', async () => {
    mockGetActiveServerConfig.mockRejectedValue(new Error('storage unavailable'));

    const { result } = renderHook(() => useInitialRoute());

    await waitFor(() => expect(result.current.initialRoute).toBe('Onboarding'));
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });
});

describe('useAppStartup', () => {
  const shouldYieldObserverSync = jest.fn(() => false);

  it('bootstraps the timezone before configuring background sync, then starts observers', async () => {
    const order: string[] = [];
    mockEnsureTimezoneBootstrapped.mockImplementation(async () => {
      order.push('timezone');
      return 'America/New_York';
    });
    mockConfigureBackgroundSync.mockImplementation(async () => {
      order.push('configure');
    });
    mockStartObservers.mockImplementation(() => {
      order.push('observers');
    });

    renderHook(() => useAppStartup({ shouldYieldObserverSync }));

    await waitFor(() => expect(mockStartObservers).toHaveBeenCalled());
    expect(order).toEqual(['timezone', 'configure', 'observers']);
    expect(initWorkoutNotificationActions).toHaveBeenCalled();
    expect(initMedicationNotificationActions).toHaveBeenCalled();
    expect(initNotifications).toHaveBeenCalled();
  });

  it('does not start observers when background sync is disabled', async () => {
    mockLoadBackgroundSyncEnabled.mockResolvedValue(false);

    renderHook(() => useAppStartup({ shouldYieldObserverSync }));

    await waitFor(() => expect(mockConfigureBackgroundSync).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockStartObservers).not.toHaveBeenCalled();
  });

  it('runs an observer-triggered sync only when not yielding and the claim is granted', async () => {
    let observerCallback: (() => void) | undefined;
    mockStartObservers.mockImplementation((callback: () => void) => {
      observerCallback = callback;
    });
    renderHook(() => useAppStartup({ shouldYieldObserverSync }));
    await waitFor(() => expect(observerCallback).toBeDefined());

    shouldYieldObserverSync.mockReturnValueOnce(true);
    observerCallback?.();
    expect(mockPerformBackgroundSync).not.toHaveBeenCalled();

    const release = jest.fn();
    mockTryClaimAutoSync.mockReturnValue(release);
    await act(async () => {
      observerCallback?.();
    });
    expect(mockPerformBackgroundSync).toHaveBeenCalledWith('healthkit-observer');
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('stops observers on unmount', async () => {
    const { unmount } = renderHook(() => useAppStartup({ shouldYieldObserverSync }));
    await waitFor(() => expect(mockConfigureBackgroundSync).toHaveBeenCalled());

    unmount();
    expect(mockStopObservers).toHaveBeenCalled();
  });
});
