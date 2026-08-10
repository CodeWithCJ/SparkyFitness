import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useWidgetLanguageRefresh } from '../../src/hooks/useWidgetLanguageRefresh';
import i18n from '../../src/localization/i18n';
import { CalorieWidgetBridge } from '../../src/services/CalorieWidgetBridge';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    setWidgetLocale: jest.fn(() => Promise.resolve()),
    reloadWidget: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

const mockSetWidgetLocale = CalorieWidgetBridge.setWidgetLocale as jest.Mock;
const mockReload = CalorieWidgetBridge.reloadWidget as jest.Mock;
const mockReloadMacro = CalorieWidgetBridge.reloadMacroWidget as jest.Mock;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

type I18nEventListener = (lng?: string) => void;

const flushReload = async () => {
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
    // Reset persistent module-factory implementations too, not only call
    // history: a mockRejectedValue/mockImplementation from one test must never
    // leak into a later test in this file.
    mockSetWidgetLocale.mockReset().mockResolvedValue(undefined);
    mockReload.mockReset().mockResolvedValue(undefined);
    mockReloadMacro.mockReset().mockResolvedValue(undefined);
    __resetAppPreferencesStoreForTests();
    languageListeners = [];
    resolvedLanguage = 'en';
    jest.spyOn(i18n, 'on').mockImplementation(((event: string, listener: I18nEventListener) => {
      if (event === 'languageChanged') {
        languageListeners.push(listener);
      }
      return i18n;
    }) as typeof i18n.on);
    jest.spyOn(i18n, 'off').mockImplementation(((event: string) => {
      if (event === 'languageChanged') {
        languageListeners = [];
      }
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

  function setPreference(preference: 'system' | 'en' | 'pl'): void {
    useAppPreferencesStore.setState({ languagePreference: preference });
  }

  it('persists the pl override and reloads both widgets on mount', async () => {
    setPreference('pl');
    resolvedLanguage = 'pl';

    renderHook(() => useWidgetLanguageRefresh());

    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledWith('pl');
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('persists the en override for an explicit en preference', async () => {
    setPreference('en');

    renderHook(() => useWidgetLanguageRefresh());

    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledWith('en');
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('removes the override for the system preference', async () => {
    setPreference('system');

    renderHook(() => useWidgetLanguageRefresh());

    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledWith(null);
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('clears the override when switching explicit en -> system while the effective language stays en', async () => {
    setPreference('en');

    const { rerender } = renderHook(() => useWidgetLanguageRefresh());
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenLastCalledWith('en');
    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(1);

    // Device language stays en; only the persisted preference changes.
    setPreference('system');
    rerender();
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockSetWidgetLocale).toHaveBeenLastCalledWith(null);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('persists an override when switching system -> explicit with the same effective language', async () => {
    setPreference('system');

    const { rerender } = renderHook(() => useWidgetLanguageRefresh());
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenLastCalledWith(null);

    setPreference('pl');
    resolvedLanguage = 'pl';
    rerender();
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockSetWidgetLocale).toHaveBeenLastCalledWith('pl');
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('re-syncs when the effective i18n language changes', async () => {
    setPreference('pl');
    resolvedLanguage = 'en';

    renderHook(() => useWidgetLanguageRefresh());
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenLastCalledWith('pl');

    resolvedLanguage = 'pl';
    languageListeners[0]('pl');
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('does not add an extra sync when the state is already fully applied', async () => {
    setPreference('en');

    renderHook(() => useWidgetLanguageRefresh());
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(1);

    languageListeners[0]('en');
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the override write fails and retries on the next signal', async () => {
    setPreference('pl');
    mockSetWidgetLocale.mockRejectedValueOnce(new Error('persist failed'));

    renderHook(() => useWidgetLanguageRefresh());
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(1);
    expect(mockReload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockAddLog).toHaveBeenCalledWith(
        '[useWidgetLanguageRefresh] Widget locale override write failed',
        'ERROR',
      ),
    );

    languageListeners[0]('pl');
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('still calls reloadMacroWidget when reloadWidget rejects and stays retryable', async () => {
    setPreference('pl');
    mockReload.mockRejectedValueOnce(new Error('calorie down'));

    renderHook(() => useWidgetLanguageRefresh());

    await waitFor(() => expect(mockReloadMacro).toHaveBeenCalledTimes(1));
    expect(mockReload).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockAddLog).toHaveBeenCalledWith(
        '[useWidgetLanguageRefresh] Calorie widget reload failed',
        'ERROR',
      ),
    );

    languageListeners[0]('pl');
    await flushReload();

    // The whole flow is retried because the state was never marked applied.
    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('still calls reloadWidget when reloadMacroWidget rejects and stays retryable', async () => {
    setPreference('pl');
    mockReloadMacro.mockRejectedValueOnce(new Error('macro down'));

    renderHook(() => useWidgetLanguageRefresh());

    await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockAddLog).toHaveBeenCalledWith(
        '[useWidgetLanguageRefresh] Macro widget reload failed',
        'ERROR',
      ),
    );

    languageListeners[0]('pl');
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('settles both reload rejections without an unhandled rejection', async () => {
    setPreference('pl');
    mockReload.mockRejectedValue(new Error('calorie down'));
    mockReloadMacro.mockRejectedValue(new Error('macro down'));

    const onUnhandledRejection = jest.fn();
    const originalOnUnhandled = process.on.bind(process);
    process.on('unhandledRejection', onUnhandledRejection);

    renderHook(() => useWidgetLanguageRefresh());

    await flushReload();

    expect(onUnhandledRejection).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      '[useWidgetLanguageRefresh] Calorie widget reload failed',
      'ERROR',
    );
    expect(mockAddLog).toHaveBeenCalledWith(
      '[useWidgetLanguageRefresh] Macro widget reload failed',
      'ERROR',
    );

    process.removeListener('unhandledRejection', onUnhandledRejection);
    void originalOnUnhandled;
  });

  it('keeps the languageChanged subscription active after a cold-start failure', async () => {
    setPreference('pl');
    mockReload.mockRejectedValueOnce(new Error('calorie down'));
    mockReloadMacro.mockRejectedValueOnce(new Error('macro down'));

    renderHook(() => useWidgetLanguageRefresh());

    await flushReload();

    expect(languageListeners).toHaveLength(1);
    languageListeners[0]('pl');
    await flushReload();

    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('serializes rapid signals so the newest preference wins', async () => {
    setPreference('en');

    const { rerender } = renderHook(() => useWidgetLanguageRefresh());
    await flushReload();
    expect(mockSetWidgetLocale).toHaveBeenLastCalledWith('en');

    // Fire several signals without waiting between them: the queued runs re-read
    // the store at execution time, so the intermediate pl write is collapsed and
    // the sync converges on the newest state (system = remove) without a reload
    // storm.
    languageListeners[0]('en');
    setPreference('pl');
    rerender();
    languageListeners[0]('pl');
    setPreference('system');
    rerender();
    languageListeners[0]('en');
    await flushReload();

    expect(mockSetWidgetLocale).toHaveBeenLastCalledWith(null);
    expect(mockSetWidgetLocale).toHaveBeenCalledTimes(2);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('does not touch the widget bridge on iOS', () => {
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    setPreference('pl');

    renderHook(() => useWidgetLanguageRefresh());

    expect(mockSetWidgetLocale).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockReloadMacro).not.toHaveBeenCalled();
  });

  it('does not log anything on iOS', () => {
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');

    renderHook(() => useWidgetLanguageRefresh());

    expect(mockAddLog).not.toHaveBeenCalled();
  });
});
