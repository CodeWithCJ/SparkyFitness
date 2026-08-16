import { AppState, Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useAppLanguageForegroundSync } from '../../src/hooks/useAppLanguageForegroundSync';
import { syncAppLanguageFromSystem } from '../../src/localization';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/localization', () => ({
  syncAppLanguageFromSystem: jest.fn(() => Promise.resolve('en')),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

const mockSync = syncAppLanguageFromSystem as jest.MockedFunction<typeof syncAppLanguageFromSystem>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

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

    listeners[0]('background');
    expect(mockSync).not.toHaveBeenCalled();

    listeners[0]('active');
    await waitFor(() => {
      expect(mockSync).toHaveBeenCalledTimes(1);
    });
  });

  it('catches and logs a resync rejection without an unhandled promise rejection', async () => {
    useAppPreferencesStore.setState({ languagePreference: 'pl' });
    mockSync.mockRejectedValueOnce(new Error('bridge failure'));

    renderHook(() => useAppLanguageForegroundSync());
    expect(listeners).toHaveLength(1);

    // The rejection must be consumed by the hook, not left floating.
    listeners[0]('active');

    await waitFor(() => {
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Foreground resync failed'),
        'ERROR',
      );
    });
  });

  it('keeps the listener usable after a resync rejection', async () => {
    useAppPreferencesStore.setState({ languagePreference: 'pl' });
    mockSync.mockRejectedValueOnce(new Error('bridge failure'));

    renderHook(() => useAppLanguageForegroundSync());

    listeners[0]('active');
    await waitFor(() => {
      expect(mockAddLog).toHaveBeenCalledTimes(1);
    });

    listeners[0]('active');
    await waitFor(() => {
      expect(mockSync).toHaveBeenCalledTimes(2);
    });
  });

  it('removes the listener on unmount', () => {
    useAppPreferencesStore.setState({ languagePreference: 'en' });

    const { unmount } = renderHook(() => useAppLanguageForegroundSync());
    expect(listeners).toHaveLength(1);

    unmount();
    expect(removeSubscription).toHaveBeenCalledTimes(1);
  });

  it('keeps one listener when the legacy preference changes', () => {
    useAppPreferencesStore.setState({ languagePreference: 'en' });

    const { rerender } = renderHook(() => useAppLanguageForegroundSync());
    expect(listeners).toHaveLength(1);

    useAppPreferencesStore.setState({ languagePreference: 'pl' });
    rerender();

    expect(removeSubscription).toHaveBeenCalledTimes(0);
    expect(listeners).toHaveLength(1);
  });

  it('keeps the listener on iOS for an explicit legacy preference', () => {
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    useAppPreferencesStore.setState({ languagePreference: 'en' });

    renderHook(() => useAppLanguageForegroundSync());

    expect(listeners).toHaveLength(1);
  });

  it('keeps the listener on iOS while following the system language', () => {
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    useAppPreferencesStore.setState({ languagePreference: 'system' });

    renderHook(() => useAppLanguageForegroundSync());

    expect(listeners).toHaveLength(1);
  });
});
