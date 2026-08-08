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
  const mockSet = jest.fn();
  const mockReload = jest.fn();

  class ExtensionStorage {
    appGroup: string;
    constructor(group: string) {
      this.appGroup = group;
    }
    set(key: string, value: unknown) {
      mockSet(key, value);
    }
    get(key: string) {
      return null;
    }
    static reloadWidget(name?: string) {
      mockReload(name);
    }
  }
  (ExtensionStorage as any).__mockSet = mockSet;
  (ExtensionStorage as any).__mockReload = mockReload;

  return { ExtensionStorage };
});

import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ExtensionStorage } from '@bacons/apple-targets';

import { useIOSWidgetLanguageRefresh } from '../../src/hooks/useIOSWidgetLanguageRefresh';
import i18n from '../../src/localization/i18n';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

const mockSet = (ExtensionStorage as any).__mockSet as jest.Mock;
const mockReload = (ExtensionStorage as any).__mockReload as jest.Mock;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

function setPlatform(os: 'android' | 'ios'): void {
  Object.defineProperty(Platform, 'OS', {
    get: () => os,
    configurable: true,
  });
}

describe('useIOSWidgetLanguageRefresh', () => {
  let languageListeners: ((lng: string) => void)[] = [];
  let initializedListeners: (() => void)[] = [];
  let isInitialized = true;
  let resolvedLanguage = 'en';

  beforeEach(() => {
    jest.clearAllMocks();
    languageListeners = [];
    initializedListeners = [];
    isInitialized = true;
    resolvedLanguage = 'en';
    jest.spyOn(i18n, 'on').mockImplementation(((event: string, listener: any) => {
      if (event === 'languageChanged') {
        languageListeners.push(listener);
      }
      if (event === 'initialized') {
        initializedListeners.push(listener);
      }
      return i18n;
    }) as typeof i18n.on);
    jest.spyOn(i18n, 'off').mockImplementation((((event: string) => {
      if (event === 'languageChanged') {
        languageListeners = [];
      }
      if (event === 'initialized') {
        initializedListeners = [];
      }
      return i18n;
    }) as unknown) as typeof i18n.off);
    Object.defineProperty(i18n, 'isInitialized', {
      get: () => isInitialized,
      configurable: true,
    });
    Object.defineProperty(i18n, 'resolvedLanguage', {
      get: () => resolvedLanguage,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes the current locale and reloads both timelines on mount', () => {
    setPlatform('ios');
    resolvedLanguage = 'pl';

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).toHaveBeenCalledWith('widgetLocale', 'pl');
    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
  });

  it('reloads both timelines when the language changes', () => {
    setPlatform('ios');

    renderHook(() => useIOSWidgetLanguageRefresh());

    resolvedLanguage = 'pl';
    languageListeners[0]('pl');

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'pl');
    expect(mockReload).toHaveBeenCalledTimes(4);
    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
  });

  it('does not write or reload redundantly when the language does not change', () => {
    setPlatform('ios');

    renderHook(() => useIOSWidgetLanguageRefresh());

    languageListeners[0]('en');

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('applies the locale after i18n initialization when mounted before init', () => {
    setPlatform('ios');
    isInitialized = false;

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).not.toHaveBeenCalled();

    resolvedLanguage = 'pl';
    initializedListeners[0]();

    expect(mockSet).toHaveBeenCalledWith('widgetLocale', 'pl');
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('does not touch the bridge on Android', () => {
    setPlatform('android');
    resolvedLanguage = 'pl';

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('logs and continues when the storage write throws', () => {
    setPlatform('ios');
    resolvedLanguage = 'pl';
    mockSet.mockImplementationOnce(() => {
      throw new Error('app group unavailable');
    });

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('[useIOSWidgetLanguageRefresh]'),
      'ERROR',
    );
  });

  it('retries the flow when the app group write fails and the locale is not marked applied', () => {
    setPlatform('ios');
    resolvedLanguage = 'pl';
    mockSet.mockImplementationOnce(() => {
      throw new Error('app group unavailable');
    });

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledTimes(1);

    // Same locale fires again after the failure: the flow must be retried.
    languageListeners[0]('pl');

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
  });

  it('retries the flow when the calorie widget reload fails', () => {
    setPlatform('ios');
    resolvedLanguage = 'pl';
    let reloadFailure: string | null = 'widget';
    mockReload.mockImplementation((name: string) => {
      if (reloadFailure && name === reloadFailure) {
        throw new Error('calorie reload failed');
      }
    });

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockAddLog).toHaveBeenCalledTimes(1);

    // Same locale fires again after the failure: write and reload are retried.
    reloadFailure = null;
    languageListeners[0]('pl');

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(3);
    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
  });

  it('retries the flow when the macro widget reload fails', () => {
    setPlatform('ios');
    resolvedLanguage = 'pl';
    let reloadFailure: string | null = 'macroWidget';
    mockReload.mockImplementation((name: string) => {
      if (reloadFailure && name === reloadFailure) {
        throw new Error('macro reload failed');
      }
    });

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockAddLog).toHaveBeenCalledTimes(1);

    // Same locale fires again after the failure: write and reload are retried.
    reloadFailure = null;
    languageListeners[0]('pl');

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(4);
    expect(mockReload).toHaveBeenCalledWith('widget');
    expect(mockReload).toHaveBeenCalledWith('macroWidget');
  });

  it('skips redundant work after a full success for the same locale', () => {
    setPlatform('ios');
    resolvedLanguage = 'en';

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(2);

    languageListeners[0]('en');

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('reapplies when the locale changes after a successful apply, then dedupes', () => {
    setPlatform('ios');
    resolvedLanguage = 'en';

    renderHook(() => useIOSWidgetLanguageRefresh());

    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'en');

    resolvedLanguage = 'pl';
    languageListeners[0]('pl');

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenLastCalledWith('widgetLocale', 'pl');
    expect(mockReload).toHaveBeenCalledTimes(4);

    // A third identical event for the already-applied pl locale is skipped.
    languageListeners[0]('pl');

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(4);
  });
});
