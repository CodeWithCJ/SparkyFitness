import { AppState, Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useAppLanguageForegroundSync } from '../../src/hooks/useAppLanguageForegroundSync';
import { syncAppLanguageFromSystem } from '../../src/localization';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/localization', () => ({
  syncAppLanguageFromSystem: jest.fn(() => Promise.resolve('en')),
}));

const mockSync = syncAppLanguageFromSystem as jest.MockedFunction<typeof syncAppLanguageFromSystem>;

describe('useAppLanguageForegroundSync', () => {
  let listeners: ((state: string) => void)[] = [];
  let removeSubscription: jest.Mock;
  let osSpy: jest.SpyInstance | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    listeners = [];
    removeSubscription = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listeners.push(handler as (state: string) => void);
      return { remove: removeSubscription } as never;
    });
    osSpy = jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (osSpy) osSpy.restore();
  });

  it('registers a listener for an explicit preference on Android', () => {
    useAppPreferencesStore.setState({ languagePreference: 'en' });

    renderHook(() => useAppLanguageForegroundSync());

    expect(listeners).toHaveLength(1);
  });

  it('registers a listener for system preference on Android', () => {
    useAppPreferencesStore.setState({ languagePreference: 'system' });

    renderHook(() => useAppLanguageForegroundSync());

    expect(listeners).toHaveLength(1);
  });

  it('calls the resync when the app returns to active', async () => {
    useAppPreferencesStore.setState({ languagePreference: 'pl' });

    renderHook(() => useAppLanguageForegroundSync());
    expect(listeners).toHaveLength(1);

    listeners[0]('active');

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
  });

  it('does not register a listener for an explicit preference on iOS', () => {
    osSpy?.restore();
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    useAppPreferencesStore.setState({ languagePreference: 'en' });

    renderHook(() => useAppLanguageForegroundSync());

    expect(listeners).toHaveLength(0);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('registers a listener for system preference on iOS', () => {
    osSpy?.restore();
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    useAppPreferencesStore.setState({ languagePreference: 'system' });

    renderHook(() => useAppLanguageForegroundSync());

    expect(listeners).toHaveLength(1);
  });

  it('removes the subscription on unmount', () => {
    useAppPreferencesStore.setState({ languagePreference: 'en' });

    const { unmount } = renderHook(() => useAppLanguageForegroundSync());
    expect(removeSubscription).not.toHaveBeenCalled();

    unmount();
    expect(removeSubscription).toHaveBeenCalledTimes(1);
  });
});
