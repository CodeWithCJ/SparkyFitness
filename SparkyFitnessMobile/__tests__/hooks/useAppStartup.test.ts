import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAppStartup } from '../../src/hooks/useAppStartup';
import { loadBackgroundSyncEnabled } from '../../src/services/storage';
import { startObservers, stopObservers } from '../../src/services/healthConnectService';
import {
  configureBackgroundSync,
  performBackgroundSync,
  flushPendingHealthSyncCacheRefresh,
} from '../../src/services/backgroundSyncService';
import { tryClaimAutoSync } from '../../src/services/autoSyncCoordinator';
import { ensureTimezoneBootstrapped } from '../../src/services/api/preferencesApi';
import { initWorkoutNotificationActions } from '../../src/stores/activeWorkoutStore';
import { initNotifications, registerLocalizedNotificationPresentation } from '../../src/services/notifications';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import { addLog } from '../../src/services/LogService';
import { initMedicationNotificationActions } from '../../src/services/medicationNotificationHandler';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/storage', () => ({
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
  registerLocalizedNotificationPresentation: jest.fn(),
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

const mockLoadBackgroundSyncEnabled = loadBackgroundSyncEnabled as jest.MockedFunction<typeof loadBackgroundSyncEnabled>;
const mockStartObservers = startObservers as jest.MockedFunction<typeof startObservers>;
const mockStopObservers = stopObservers as jest.MockedFunction<typeof stopObservers>;
const mockConfigureBackgroundSync = configureBackgroundSync as jest.MockedFunction<typeof configureBackgroundSync>;
const mockPerformBackgroundSync = performBackgroundSync as jest.MockedFunction<typeof performBackgroundSync>;
const mockFlushPendingRefresh = flushPendingHealthSyncCacheRefresh as jest.MockedFunction<typeof flushPendingHealthSyncCacheRefresh>;
const mockTryClaimAutoSync = tryClaimAutoSync as jest.MockedFunction<typeof tryClaimAutoSync>;
const mockRegisterLocalized = registerLocalizedNotificationPresentation as jest.MockedFunction<typeof registerLocalizedNotificationPresentation>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockEnsureTimezoneBootstrapped = ensureTimezoneBootstrapped as jest.MockedFunction<typeof ensureTimezoneBootstrapped>;

beforeEach(async () => {
  await initializeI18n('en');
  await i18n.changeLanguage('en');
  jest.clearAllMocks();
  mockEnsureTimezoneBootstrapped.mockResolvedValue('America/New_York');
  mockConfigureBackgroundSync.mockResolvedValue(undefined);
  mockLoadBackgroundSyncEnabled.mockResolvedValue(true);
  mockFlushPendingRefresh.mockResolvedValue(undefined);
  mockRegisterLocalized.mockResolvedValue(undefined);
  mockPerformBackgroundSync.mockResolvedValue(undefined as Awaited<ReturnType<typeof performBackgroundSync>>);
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

  it('refreshes notification presentation through the real languageChanged owner listener', async () => {
    renderHook(() => useAppStartup({ shouldYieldObserverSync }));
    await waitFor(() => expect(initNotifications).toHaveBeenCalled());
    mockRegisterLocalized.mockClear();

    await act(async () => { await i18n.changeLanguage('pl'); });
    await waitFor(() => expect(mockRegisterLocalized).toHaveBeenCalledTimes(1));
    await act(async () => { await i18n.changeLanguage('en'); });
    await waitFor(() => expect(mockRegisterLocalized).toHaveBeenCalledTimes(2));
  });

  it('removes the languageChanged listener on unmount', async () => {
    const { unmount } = renderHook(() => useAppStartup({ shouldYieldObserverSync }));
    await waitFor(() => expect(initNotifications).toHaveBeenCalled());
    unmount();
    mockRegisterLocalized.mockClear();
    await act(async () => { await i18n.changeLanguage('pl'); });
    expect(mockRegisterLocalized).not.toHaveBeenCalled();
  });

  it('contains notification refresh rejection and logs an error while remaining mounted', async () => {
    const registrationError = new Error('registration failed');
    mockRegisterLocalized.mockRejectedValue(registrationError);
    const { result } = renderHook(() => useAppStartup({ shouldYieldObserverSync }));
    await waitFor(() => expect(initNotifications).toHaveBeenCalled());
    mockAddLog.mockClear();
    await act(async () => { await i18n.changeLanguage('pl'); });
    await waitFor(() => expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('registration failed'), 'ERROR',
    ));
    expect(result.current).toBeUndefined();
  });

  it('stops observers on unmount', async () => {
    const { unmount } = renderHook(() => useAppStartup({ shouldYieldObserverSync }));
    await waitFor(() => expect(mockConfigureBackgroundSync).toHaveBeenCalled());

    unmount();
    expect(mockStopObservers).toHaveBeenCalled();
  });
});
