import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useWidgetLanguageRefresh } from '../../src/hooks/useWidgetLanguageRefresh';
import i18n from '../../src/localization/i18n';
import { CalorieWidgetBridge } from '../../src/services/CalorieWidgetBridge';

jest.mock('../../src/services/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    reloadWidget: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
  },
}));

const mockReload = CalorieWidgetBridge.reloadWidget as jest.Mock;
const mockReloadMacro = CalorieWidgetBridge.reloadMacroWidget as jest.Mock;

function setPlatform(os: 'android' | 'ios'): void {
  Object.defineProperty(Platform, 'OS', {
    get: () => os,
    configurable: true,
  });
}

describe('useWidgetLanguageRefresh', () => {
  let languageListeners: (() => void)[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    languageListeners = [];
    const originalOn = i18n.on.bind(i18n);
    const originalOff = i18n.off.bind(i18n);
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
    void originalOn;
    void originalOff;
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

  it('reloads all widget instances when the effective language changes', () => {
    setPlatform('android');

    renderHook(() => useWidgetLanguageRefresh());

    expect(languageListeners).toHaveLength(1);
    languageListeners[0]();
    languageListeners[0]();

    expect(mockReload).toHaveBeenCalledTimes(3);
    expect(mockReloadMacro).toHaveBeenCalledTimes(3);
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
});
