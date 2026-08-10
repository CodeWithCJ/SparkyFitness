jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: { iosAppGroup: 'group.test.sparkyfitness' },
    },
  },
}));

jest.mock('@bacons/apple-targets', () => {
  const mocks = {
    set: jest.fn(),
    remove: jest.fn(),
    reload: jest.fn(),
  };

  class ExtensionStorage {
    appGroup: string;
    constructor(group: string) {
      this.appGroup = group;
    }
    set(key: string, value: unknown) {
      mocks.set(key, value);
    }
    get() {
      return null;
    }
    remove(key: string) {
      mocks.remove(key);
    }
    static reloadWidget(name?: string) {
      mocks.reload(name);
    }
  }

  return { ExtensionStorage, __mocks: mocks };
});

import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ExtensionStorage } from '@bacons/apple-targets';

import { useIOSWidgetLanguageRefresh } from '../../src/hooks/useIOSWidgetLanguageRefresh';
import i18n from '../../src/localization/i18n';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

interface AppleTargetsMocks {
  set: jest.Mock;
  remove: jest.Mock;
  reload: jest.Mock;
}

const mockedAppleTargets = jest.requireMock('@bacons/apple-targets') as {
  ExtensionStorage: typeof ExtensionStorage;
  __mocks: AppleTargetsMocks;
};

const mockSet = mockedAppleTargets.__mocks.set;
const mockRemove = mockedAppleTargets.__mocks.remove;
const mockReload = mockedAppleTargets.__mocks.reload;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

type I18nEventListener = (lng?: string) => void;

/** Flush the serialized sync queue (one microtask per enqueued run). */
async function flushSync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('useIOSWidgetLanguageRefresh', () => {
  let languageListeners: I18nEventListener[] = [];
  let initializedListeners: I18nEventListener[] = [];
  let isInitialized = true;
  let resolvedLanguage = 'en';
  let osSpy: jest.SpyInstance | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset persistent module-factory implementations too, not only call
    // history: a mockImplementation from one test must never leak into a later
    // test in this file.
    mockSet.mockReset();
    mockRemove.mockReset();
    mockReload.mockReset();
    __resetAppPreferencesStoreForTests();
    languageListeners = [];
    initializedListeners = [];
    isInitialized = true;
    resolvedLanguage = 'en';
    jest.spyOn(i18n, 'on').mockImplementation(((event: string, listener: I18nEventListener) => {
      if (event === 'languageChanged') {
        languageListeners.push(listener);
      }
      if (event === 'initialized') {
        initializedListeners.push(listener);
      }
      return i18n;
    }) as typeof i18n.on);
    jest.spyOn(i18n, 'off').mockImplementation(((event: string) => {
      if (event === 'languageChanged') {
        languageListeners = [];
      }
      if (event === 'initialized') {
        initializedListeners = [];
      }
      return i18n;
    }) as typeof i18n.off);
    Object.defineProperty(i18n, 'isInitialized', {
      get: () => isInitialized,
      configurable: true,
    });
    Object.defineProperty(i18n, 'resolvedLanguage', {
      get: () => resolvedLanguage,
      configurable: true,
    });
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (osSpy) osSpy.restore();
  });

  function setPreference(preference: 'system' | 'en' | 'pl'): void {
    useAppPreferencesStore.setState({ languagePreference: preference });
  }

  it('writes the pl override and reloads both timelines on mount', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).toHaveBeenCalledWith('widgetLocale', 'pl');
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
  });

  it('writes the en override for an explicit en preference', async () => {
    setPreference('en');

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).toHaveBeenCalledWith('widgetLocale', 'en');
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('removes the override for the system preference', async () => {
    setPreference('system');

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockRemove).toHaveBeenCalledWith('widgetLocale');
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('removes the override when switching explicit en -> system while the effective language stays en', async () => {
    setPreference('en');

    const { rerender } = renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'en');
    expect(mockRemove).not.toHaveBeenCalled();

    // Device language stays en; only the preference changes to system.
    setPreference('system');
    rerender();
    await flushSync();

    expect(mockRemove).toHaveBeenCalledWith('widgetLocale');
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(4);
  });

  it('removes the override when switching explicit pl -> system while the effective language stays pl', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';

    const { rerender } = renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'pl');

    setPreference('system');
    rerender();
    await flushSync();

    expect(mockRemove).toHaveBeenCalledWith('widgetLocale');
    expect(mockReload).toHaveBeenCalledTimes(4);
  });

  it('persists an override when switching system -> explicit with the same effective language', async () => {
    setPreference('system');

    const { rerender } = renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockRemove).toHaveBeenCalledTimes(1);

    setPreference('en');
    rerender();
    await flushSync();

    expect(mockSet).toHaveBeenCalledWith('widgetLocale', 'en');
    expect(mockReload).toHaveBeenCalledTimes(4);
  });

  it('re-syncs when the effective i18n language changes', async () => {
    setPreference('pl');
    resolvedLanguage = 'en';

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'pl');

    // Effective language changes while the preference stays pl.
    resolvedLanguage = 'pl';
    languageListeners[0]('pl');
    await flushSync();

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(4);
  });

  it('does not write or reload redundantly for an identical fully-applied state', async () => {
    setPreference('en');

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(2);

    languageListeners[0]('en');
    await flushSync();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('applies the preference after i18n initialization when mounted before init', async () => {
    setPreference('pl');
    isInitialized = false;
    resolvedLanguage = 'pl';

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).not.toHaveBeenCalled();

    initializedListeners[0]();
    await flushSync();

    expect(mockSet).toHaveBeenCalledWith('widgetLocale', 'pl');
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('does not touch the app group on Android', async () => {
    osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    setPreference('pl');

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('logs and retries when the storage write throws', async () => {
    setPreference('pl');
    mockSet.mockImplementationOnce(() => {
      throw new Error('app group unavailable');
    });

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('[useIOSWidgetLanguageRefresh]'),
      'ERROR',
    );
    expect(mockReload).not.toHaveBeenCalled();

    languageListeners[0]('pl');
    await flushSync();

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('logs and retries when the remove throws', async () => {
    setPreference('system');
    mockRemove.mockImplementationOnce(() => {
      throw new Error('app group unavailable');
    });

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockAddLog).toHaveBeenCalledTimes(1);
    expect(mockReload).not.toHaveBeenCalled();

    languageListeners[0]('en');
    await flushSync();

    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('attempts both reloads independently and retries when one fails', async () => {
    setPreference('pl');
    let reloadFailure: string | null = 'widget';
    mockReload.mockImplementation((name?: string) => {
      if (reloadFailure !== null && name === reloadFailure) {
        throw new Error('calorie reload failed');
      }
    });

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    // Both timelines are attempted even though the calorie one failed.
    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
    expect(mockAddLog).toHaveBeenCalledTimes(1);

    reloadFailure = null;
    languageListeners[0]('pl');
    await flushSync();

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(4);
  });

  it('retries the flow when the macro widget reload fails', async () => {
    setPreference('pl');
    let reloadFailure: string | null = 'macroWidget';
    mockReload.mockImplementation((name?: string) => {
      if (reloadFailure !== null && name === reloadFailure) {
        throw new Error('macro reload failed');
      }
    });

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
    expect(mockAddLog).toHaveBeenCalledTimes(1);

    reloadFailure = null;
    languageListeners[0]('pl');
    await flushSync();

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(4);
  });

  it('serializes rapid signals so the newest preference wins', async () => {
    setPreference('en');

    const { rerender } = renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();
    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'en');

    // Fire several signals without waiting between them: the last enqueued run
    // must win, and the shared state must end on the newest preference. The
    // store read happens when each queued run executes, so en -> pl -> system
    // lands on system (remove) with dedupe skipping the redundant signals.
    languageListeners[0]('en');
    setPreference('pl');
    rerender();
    languageListeners[0]('pl');
    setPreference('system');
    rerender();
    languageListeners[0]('en');
    await flushSync();

    expect(mockRemove).toHaveBeenCalledWith('widgetLocale');
    // The queued runs re-read the store at execution time, so the intermediate
    // pl write is collapsed: the sync converges on the newest state (system)
    // instead of writing en -> pl -> system. Only the mount (en) and the final
    // system removal reload both timelines, avoiding a reload storm.
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(4);
  });

  it('dedupes after a full success and re-syncs on a real state change', async () => {
    setPreference('en');

    renderHook(() => useIOSWidgetLanguageRefresh());
    await flushSync();

    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'en');

    languageListeners[0]('en');
    await flushSync();
    expect(mockSet).toHaveBeenCalledTimes(1);

    resolvedLanguage = 'pl';
    languageListeners[0]('pl');
    await flushSync();

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(4);

    languageListeners[0]('pl');
    await flushSync();
    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(4);
  });
});
