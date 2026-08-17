import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useWidgetLanguageRefresh } from '../../src/hooks/useWidgetLanguageRefresh';
import i18n from '../../src/localization/i18n';
import { CalorieWidgetBridge } from '../../src/services/CalorieWidgetBridge';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    prepareWidgetLocale: jest.fn(() => Promise.resolve()),
    reloadWidget: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

const mockPrepareWidgetLocale = CalorieWidgetBridge.prepareWidgetLocale as jest.Mock;
const mockReload = CalorieWidgetBridge.reloadWidget as jest.Mock;
const mockReloadMacro = CalorieWidgetBridge.reloadMacroWidget as jest.Mock;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

type I18nEventListener = (lng?: string) => void;

const flushSync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('useWidgetLanguageRefresh', () => {
  let languageListeners: I18nEventListener[] = [];
  let resolvedLanguage = 'en';
  let osSpy: jest.SpyInstance | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrepareWidgetLocale.mockReset().mockResolvedValue(undefined);
    mockReload.mockReset().mockResolvedValue(undefined);
    mockReloadMacro.mockReset().mockResolvedValue(undefined);
    languageListeners = [];
    resolvedLanguage = 'en';
    useAppPreferencesStore.setState({ languagePreference: 'system' });
    jest.spyOn(i18n, 'on').mockImplementation(((event: string, listener: I18nEventListener) => {
      if (event === 'languageChanged') languageListeners.push(listener);
      return i18n;
    }) as typeof i18n.on);
    jest.spyOn(i18n, 'off').mockImplementation(((event: string) => {
      if (event === 'languageChanged') languageListeners = [];
      return i18n;
    }) as typeof i18n.off);
    Object.defineProperty(i18n, 'resolvedLanguage', {
      get: () => resolvedLanguage,
      configurable: true,
    });
    osSpy = jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (osSpy) osSpy.restore();
  });

  const setPreference = (preference: 'system' | 'en' | 'pl') => {
    useAppPreferencesStore.setState({ languagePreference: preference });
  };

  it('prepares the effective PL render locale before both reloads', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    expect(mockPrepareWidgetLocale).toHaveBeenCalledWith('pl', 'pl');
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
    expect(mockPrepareWidgetLocale.mock.invocationCallOrder[0]).toBeLessThan(
      mockReload.mock.invocationCallOrder[0],
    );
  });

  it('passes effective EN even when the preference is still PL during the race window', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    resolvedLanguage = 'en';
    languageListeners[0]('en');
    await flushSync();

    expect(mockPrepareWidgetLocale).toHaveBeenLastCalledWith('pl', 'en');
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('uses system preference with effective EN and prepares before reload', async () => {
    setPreference('system');
    resolvedLanguage = 'en';
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    expect(mockPrepareWidgetLocale).toHaveBeenCalledWith('system', 'en');
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('dedupes an identical preference/effective-language state', async () => {
    setPreference('en');
    resolvedLanguage = 'en';
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    languageListeners[0]('en');
    await flushSync();

    expect(mockPrepareWidgetLocale).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('retries after locale preparation failure', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';
    mockPrepareWidgetLocale.mockRejectedValueOnce(
      new Error('E_WRITE_FAILED: persist failed'),
    );
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    expect(mockReload).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      '[useWidgetLanguageRefresh] Widget locale preparation failed: E_WRITE_FAILED: persist failed',
      'ERROR',
    );

    languageListeners[0]('pl');
    await flushSync();
    expect(mockPrepareWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('attempts both reloads independently and retries after a calorie failure', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';
    mockReload.mockRejectedValueOnce(new Error('calorie failed'));
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);

    languageListeners[0]('pl');
    await flushSync();
    expect(mockPrepareWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('retries after a macro failure', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';
    mockReloadMacro.mockRejectedValueOnce(new Error('macro failed'));
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    languageListeners[0]('pl');
    await flushSync();
    expect(mockPrepareWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('serializes rapid signals and uses the latest effective language', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();

    resolvedLanguage = 'en';
    languageListeners[0]('en');
    languageListeners[0]('en');
    await flushSync();

    expect(mockPrepareWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockPrepareWidgetLocale).toHaveBeenLastCalledWith('pl', 'en');
  });

  it('does nothing on iOS', async () => {
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    setPreference('pl');
    renderHook(() => useWidgetLanguageRefresh());
    await flushSync();
    expect(mockPrepareWidgetLocale).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockReloadMacro).not.toHaveBeenCalled();
  });
});
