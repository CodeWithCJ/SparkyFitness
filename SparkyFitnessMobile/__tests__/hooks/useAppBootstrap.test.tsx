import React, { useEffect } from 'react';
import { render, renderHook, waitFor } from '@testing-library/react-native';
import { useAppBootstrap } from '../../src/hooks/useAppBootstrap';

jest.mock('../../src/localization', () => ({
  initializeI18n: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

import { initializeI18n } from '../../src/localization';
import { getActiveServerConfig } from '../../src/services/storage';
import * as SplashScreen from 'expo-splash-screen';

const mockInitializeI18n = initializeI18n as jest.MockedFunction<typeof initializeI18n>;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;
const mockSplashScreen = SplashScreen as jest.Mocked<typeof SplashScreen>;

describe('useAppBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue(null);
  });

  it('does not set initialRoute before i18n initialization completes', async () => {
    mockInitializeI18n.mockReturnValue(new Promise<void>(() => {}));

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockInitializeI18n).toHaveBeenCalledTimes(1);
    });

    // i18n still pending → initialRoute must be null
    expect(result.current.initialRoute).toBeNull();
  });

  it('sets initialRoute after i18n initialization completes', async () => {
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });
  });

  it('resolves to Tabs when a server config is active', async () => {
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'srv-1',
      url: 'https://example.com',
      apiKey: '',
      authType: 'apiKey' as const,
    });

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Tabs');
    });
    expect(result.current.linkingEnabled).toBe(true);
  });

  it('continues with fallback when initialization is rejected', async () => {
    mockInitializeI18n.mockRejectedValue(new Error('i18n init failed'));

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });
  });

  it('does not hide splash screen before i18n is ready', () => {
    mockInitializeI18n.mockReturnValue(new Promise<void>(() => {}));

    renderHook(() => useAppBootstrap());

    expect(mockSplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('hides splash screen after i18n is ready', async () => {
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue(null);

    renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockSplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('hides splash screen even when initialization is rejected', async () => {
    mockInitializeI18n.mockRejectedValue(new Error('i18n init failed'));

    renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockSplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('does not trigger a second initializeI18n call on re-render', async () => {
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result, rerender } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });

    const callsAfterFirstComplete = mockInitializeI18n.mock.calls.length;

    rerender({});

    expect(mockInitializeI18n).toHaveBeenCalledTimes(callsAfterFirstComplete);
  });

  it('language change does not remount the navigator', async () => {
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue(null);

    let navigatorMountCount = 0;

    function NavigatorPlaceholder() {
      useEffect(() => {
        navigatorMountCount++;
      }, []);
      return null;
    }

    function TestApp({ trigger }: { trigger: number }) {
      const { initialRoute } = useAppBootstrap();
      if (!initialRoute) return null;
      return <NavigatorPlaceholder key="navigator" />;
    }

    const { rerender } = render(<TestApp trigger={0} />);

    await waitFor(() => {
      expect(navigatorMountCount).toBe(1);
    });

    // Force a re-render (simulates any state change, including language preference updates).
    // The navigator must NOT remount.
    rerender(<TestApp trigger={1} />);

    expect(navigatorMountCount).toBe(1);
  });

  it('language preference change does not alter the bootstrap decision', async () => {
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result, rerender } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });

    const initialRouteBefore = result.current.initialRoute;
    const initCallsBefore = mockInitializeI18n.mock.calls.length;
    const configCallsBefore = mockGetActiveServerConfig.mock.calls.length;

    // Force a re-render (simulates a language preference change in AppContent).
    // Since useAppBootstrap has a [] effect dep array, it must not re-run.
    rerender({});

    expect(result.current.initialRoute).toBe(initialRouteBefore);
    expect(mockInitializeI18n).toHaveBeenCalledTimes(initCallsBefore);
    expect(mockGetActiveServerConfig).toHaveBeenCalledTimes(configCallsBefore);
  });
});
