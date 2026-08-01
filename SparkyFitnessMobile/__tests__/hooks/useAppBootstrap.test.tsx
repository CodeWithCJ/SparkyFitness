import React, { useEffect, useState, useContext, createContext } from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { render, renderHook, waitFor, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
    mockInitializeI18n.mockResolvedValue(undefined);
    mockGetActiveServerConfig.mockResolvedValue(null);
  });

  it('does not set initialRoute before i18n initialization completes', async () => {
    mockInitializeI18n.mockReturnValue(new Promise<void>(() => {}));

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockInitializeI18n).toHaveBeenCalledTimes(1);
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
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result, rerender } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.initialRoute).toBe('Onboarding');
    });

    const callsAfterFirstComplete = mockInitializeI18n.mock.calls.length;

    rerender({});

    expect(mockInitializeI18n).toHaveBeenCalledTimes(callsAfterFirstComplete);
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
    const initCallsBefore = mockInitializeI18n.mock.calls.length;
    const configCallsBefore = mockGetActiveServerConfig.mock.calls.length;

    rerender({});

    expect(result.current.initialRoute).toBe(initialRouteBefore);
    expect(mockInitializeI18n).toHaveBeenCalledTimes(initCallsBefore);
    expect(mockGetActiveServerConfig).toHaveBeenCalledTimes(configCallsBefore);
  });
});
