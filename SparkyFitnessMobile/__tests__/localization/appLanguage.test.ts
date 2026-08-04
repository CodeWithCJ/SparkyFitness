import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getNativeApplicationLanguage,
  initializeAppLanguage,
  setAppLanguagePreference,
  syncAppLanguageFromSystem,
} from '../../src/localization/appLanguage';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { AppLanguageNative } from '../../src/services/appLanguageNative';

jest.mock('../../src/services/appLanguageNative', () => ({
  AppLanguageNative: {
    isAvailable: true,
    setApplicationLanguage: jest.fn(async () => undefined),
    getApplicationLanguage: jest.fn(async () => null),
    getEffectiveLanguage: jest.fn(async () => 'en'),
  },
}));

const mockNative = AppLanguageNative as jest.Mocked<typeof AppLanguageNative>;

describe('app language service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
    await useAppPreferencesStore.persist.rehydrate();
    mockNative.isAvailable = true;
    mockNative.setApplicationLanguage.mockClear();
    mockNative.getApplicationLanguage.mockReset().mockResolvedValue(null);
    mockNative.getEffectiveLanguage.mockReset().mockResolvedValue('en');
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  it('keeps an existing explicit store preference authoritative during bootstrap', async () => {
    useAppPreferencesStore.setState({ languagePreference: 'pl' });
    mockNative.getApplicationLanguage.mockResolvedValue('en');
    mockNative.getEffectiveLanguage.mockResolvedValue('en');

    await initializeAppLanguage();

    expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith('pl');
    expect(i18n.resolvedLanguage).toBe('pl');
    expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
  });

  it('clears Android application locales for system preference', async () => {
    useAppPreferencesStore.setState({ languagePreference: 'system' });
    mockNative.getEffectiveLanguage.mockResolvedValue('pl');

    await initializeAppLanguage();

    expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith(null);
    expect(i18n.resolvedLanguage).toBe('pl');
    expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
  });

  it('applies an explicit Settings selection through native first', async () => {
    const order: string[] = [];
    mockNative.setApplicationLanguage.mockImplementation(async () => {
      order.push('native');
    });
    const changeLanguage = jest.spyOn(i18n, 'changeLanguage').mockImplementation(async (language) => {
      order.push(`i18n:${language}`);
      return i18n;
    });

    await setAppLanguagePreference('pl');

    expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith('pl');
    expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    expect(order).toEqual(['native', 'i18n:pl']);
    changeLanguage.mockRestore();
  });

  it('adopts a supported Android App Languages change on foreground', async () => {
    useAppPreferencesStore.setState({ languagePreference: 'system' });
    mockNative.getApplicationLanguage.mockResolvedValue('pl');

    await syncAppLanguageFromSystem();

    expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    expect(i18n.resolvedLanguage).toBe('pl');
    expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
  });

  it('restores an explicit preference when native application locale is cleared', async () => {
    useAppPreferencesStore.setState({ languagePreference: 'pl' });

    await syncAppLanguageFromSystem();

    expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith('pl');
    expect(i18n.resolvedLanguage).toBe('pl');
  });

  it('falls back to device language without an Android bridge', async () => {
    mockNative.isAvailable = false;
    useAppPreferencesStore.setState({ languagePreference: 'system' });

    await initializeAppLanguage();

    expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
    expect(i18n.resolvedLanguage).toBe('en');
  });

  it('does not expose unsupported native locale values', async () => {
    mockNative.getApplicationLanguage.mockResolvedValue('de-DE');

    await expect(getNativeApplicationLanguage()).resolves.toBeNull();
  });
});
