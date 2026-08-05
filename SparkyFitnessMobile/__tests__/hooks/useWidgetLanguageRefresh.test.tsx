import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useWidgetLanguageRefresh } from '../../src/hooks/useWidgetLanguageRefresh';
import i18n from '../../src/localization/i18n';
import { CalorieWidgetBridge } from '../../src/services/CalorieWidgetBridge';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    reloadWidget: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

const mockReload = CalorieWidgetBridge.reloadWidget as jest.Mock;
const mockReloadMacro = CalorieWidgetBridge.reloadMacroWidget as jest.Mock;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

function setPlatform(os: 'android' | 'ios'): void {
  Object.defineProperty(Platform, 'OS', {
    get: () => os,
    configurable: true,
  });
}

const flushReload = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('useWidgetLanguageRefresh', () => {
  let languageListeners: (() => void)[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    languageListeners = [];
    jest.spyOn(i18n, 'on').mockImplementation(((event: string, listener: () => void) => {
      if (event === 'languageChanged') {
        languageListeners.push(listener);
      }
      return i18n;
    }) as typeof i18n.on);
    jest.spyOn(i18n, 'off').mockImplementation((((event: string) => {
      if (event === 'languageChanged') {
        languageListeners = [];
      }
      return i18n;
    }) as unknown) as typeof i18n.off);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reloads both widgets once on mount to apply the current locale', () => {
    setPlatform('android');

    renderHook(() => useWidgetLanguageRefresh());

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('reloads all widget instances when the effective language changes', async () => {
    setPlatform('android');

    renderHook(() => useWidgetLanguageRefresh());

    expect(languageListeners).toHaveLength(1);
    languageListeners[0]();
    await flushReload();

    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('does not add an extra reload when language does not change', () => {
    setPlatform('android');

    renderHook(() => useWidgetLanguageRefresh());

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('re-registers the listener on remount (restart behavior)', () => {
    setPlatform('android');

    const { unmount } = renderHook(() => useWidgetLanguageRefresh());
    unmount();
    renderHook(() => useWidgetLanguageRefresh());

    expect(languageListeners).toHaveLength(1);
    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('does not touch the widget bridge on iOS', () => {
    setPlatform('ios');

    renderHook(() => useWidgetLanguageRefresh());

    expect(mockReload).not.toHaveBeenCalled();
    expect(mockReloadMacro).not.toHaveBeenCalled();
  });

  it('still calls reloadMacroWidget when reloadWidget rejects', async () => {
    setPlatform('android');
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
    expect(
      mockAddLog.mock.calls.some((call) =>
        String(call[0]).includes('Macro widget reload failed'),
      ),
    ).toBe(false);
  });

  it('still calls reloadWidget when reloadMacroWidget rejects', async () => {
    setPlatform('android');
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
    expect(
      mockAddLog.mock.calls.some((call) =>
        String(call[0]).includes('Calorie widget reload failed'),
      ),
    ).toBe(false);
  });

  it('settles both rejections without an unhandled rejection', async () => {
    setPlatform('android');
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
    setPlatform('android');
    mockReload.mockRejectedValueOnce(new Error('calorie down'));
    mockReloadMacro.mockRejectedValueOnce(new Error('macro down'));

    renderHook(() => useWidgetLanguageRefresh());

    await flushReload();

    expect(languageListeners).toHaveLength(1);
    languageListeners[0]();
    await flushReload();

    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('retries the refresh on the next language change after an earlier failure', async () => {
    setPlatform('android');
    mockReload.mockRejectedValueOnce(new Error('calorie down'));

    renderHook(() => useWidgetLanguageRefresh());

    await flushReload();

    mockReload.mockResolvedValue(undefined);
    languageListeners[0]();
    await flushReload();

    expect(mockReload).toHaveBeenCalledTimes(2);
    expect(mockReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('does not log anything on iOS', () => {
    setPlatform('ios');

    renderHook(() => useWidgetLanguageRefresh());

    expect(mockAddLog).not.toHaveBeenCalled();
  });
});
