import React, { useEffect, useState, useContext, createContext } from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { render, renderHook, waitFor, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppBootstrap } from '../../src/hooks/useAppBootstrap';

jest.mock('../../src/localization', () => ({
  initializeAppLanguage: jest.fn(() => Promise.resolve('en')),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

import { initializeAppLanguage } from '../../src/localization';
import { getActiveServerConfig } from '../../src/services/storage';
import { addLog } from '../../src/services/LogService';
import * as SplashScreen from 'expo-splash-screen';

const mockInitializeAppLanguage = initializeAppLanguage as jest.MockedFunction<typeof initializeAppLanguage>;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;
const mockSplashScreen = SplashScreen as jest.Mocked<typeof SplashScreen>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

const LangContext = createContext('en');

const translations = {
  en: { common: { back: 'Back', close: 'Close', save: 'Save', saving: 'Saving…' } },
  pl: { common: { back: 'Cofnij', close: 'Zamknij', save: 'Zapisz', saving: 'Zapisywanie…' } },
};

function t(key: string, lang: string): string {
  const parts = key.split('.');
  let value: unknown = lang === 'pl' ? translations.pl : translations.en;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return key;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : key;
}

describe('useAppBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeAppLanguage.mockResolvedValue('en');
    mockGetActiveServerConfig.mockResolvedValue(null);
    mockSplashScreen.hideAsync.mockResolvedValue(undefined);
  });

  it('does not set initialRoute before i18n initialization completes', async () => {
    mockInitializeAppLanguage.mockReturnValue(new Promise<never>(() => {}));

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockInitializeAppLanguage).toHaveBeenCalledTimes(1);
    });

    expect(result.current.initialRoute).toBeNull();
  });

  it('sets initialRoute after i18n initialization completes', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });
  });

  it('resolves to Tabs when a server config is active', async () => {
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

  it('routes to Tabs even when language initialization rejects (broken locale never changes the route)', async () => {
    mockInitializeAppLanguage.mockRejectedValue(new Error('language init failed'));
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
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('Failed to initialize app language'),
      'ERROR',
    );
  });

  it('still routes to Onboarding from a missing config when language init rejects', async () => {
    mockInitializeAppLanguage.mockRejectedValue(new Error('language init failed'));
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });
  });

  it('falls back to Onboarding and logs when config loading throws', async () => {
    mockGetActiveServerConfig.mockRejectedValue(new Error('storage unavailable'));

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });
    expect(result.current.linkingEnabled).toBe(false);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load active server config'),
      'ERROR',
    );
  });

  it('does not hide splash screen before i18n is ready', () => {
    mockInitializeAppLanguage.mockReturnValue(new Promise<never>(() => {}));

    renderHook(() => useAppBootstrap());

    expect(mockSplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('hides splash screen after bootstrap completes', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockSplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('hides splash screen even when initialization is rejected', async () => {
    mockInitializeAppLanguage.mockRejectedValue(new Error('language init failed'));

    renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockSplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('logs and keeps the route when hiding the splash fails', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);
    mockSplashScreen.hideAsync.mockRejectedValue(new Error('splash failed'));

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });
    await waitFor(() => {
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Failed to hide splash screen'),
        'ERROR',
      );
    });
    expect(result.current.initialRoute).toBe('Onboarding');
  });

  it('does not trigger a second language initialization on re-render', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result, rerender } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });

    const callsAfterFirstComplete = mockInitializeAppLanguage.mock.calls.length;

    rerender({});

    expect(mockInitializeAppLanguage).toHaveBeenCalledTimes(callsAfterFirstComplete);
  });

  it('language change does not remount the navigator (real NavigationContainer)', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    let screenMountCount = 0;

    function TestScreen() {
      const lang = useContext(LangContext);
      const [counter, setCounter] = useState(0);
      useEffect(() => {
        screenMountCount++;
      }, []);
      return (
        <View>
          <Text testID="save-label">{t('common.save', lang)}</Text>
          <Text testID="counter">{counter}</Text>
          <TouchableOpacity testID="increment" onPress={() => setCounter(c => c + 1)}>
            <Text>+</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const Stack = createNativeStackNavigator();

    function TestApp({ lang }: { lang: string }) {
      const { initialRoute } = useAppBootstrap();
      if (!initialRoute) return null;

      return (
        <LangContext.Provider value={lang}>
          <NavigationContainer>
            <Stack.Navigator>
              <Stack.Screen name="Test" component={TestScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </LangContext.Provider>
      );
    }

    const { getByText, getByTestId, rerender } = render(<TestApp lang="en" />);

    await waitFor(() => {
      expect(getByText('Save')).toBeTruthy();
    });
    expect(screenMountCount).toBe(1);

    fireEvent.press(getByTestId('increment'));
    await waitFor(() => expect(getByText('1')).toBeTruthy());

    // Change language via context — must NOT remount the navigator.
    rerender(<TestApp lang="pl" />);

    await waitFor(() => {
      expect(getByText('Zapisz')).toBeTruthy();
    });

    expect(screenMountCount).toBe(1);
    expect(getByText('1')).toBeTruthy();
  });

  it('language preference change does not alter the bootstrap decision', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result, rerender } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });

    const initialRouteBefore = result.current.initialRoute;
    const initCallsBefore = mockInitializeAppLanguage.mock.calls.length;
    const configCallsBefore = mockGetActiveServerConfig.mock.calls.length;

    rerender({});

    expect(result.current.initialRoute).toBe(initialRouteBefore);
    expect(mockInitializeAppLanguage).toHaveBeenCalledTimes(initCallsBefore);
    expect(mockGetActiveServerConfig).toHaveBeenCalledTimes(configCallsBefore);
  });
});
