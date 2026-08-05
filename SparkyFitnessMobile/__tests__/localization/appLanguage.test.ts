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

const MIGRATION_KEY = '@SparkyFitness/app-language-migration';

async function markMigrationComplete(): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_KEY, JSON.stringify({ version: 1 }));
}

describe('app language service', () => {
  let nativeApplication: string | null;

  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
    await useAppPreferencesStore.persist.rehydrate();
    mockNative.isAvailable = true;
    mockNative.setApplicationLanguage.mockClear();
    mockNative.getApplicationLanguage.mockReset();
    mockNative.getEffectiveLanguage.mockReset().mockResolvedValue('en');
    nativeApplication = null;
    mockNative.getApplicationLanguage.mockImplementation(async () => nativeApplication);
    mockNative.setApplicationLanguage.mockImplementation(async (language: string | null) => {
      nativeApplication = language;
    });
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  describe('migration', () => {
    it('migrates a stored system preference to an empty AppCompat list', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeTruthy();
      expect(i18n.resolvedLanguage).toBe('en');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
    });

    it('migrates a stored en preference to AppCompat en', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith('en');
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeTruthy();
      expect(i18n.resolvedLanguage).toBe('en');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
    });

    it('migrates a stored pl preference to AppCompat pl', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith('pl');
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeTruthy();
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    });

    it('does not re-run migration when the marker already exists', async () => {
      await markMigrationComplete();
      useAppPreferencesStore.setState({ languagePreference: 'en' });
      nativeApplication = 'en';

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(i18n.resolvedLanguage).toBe('en');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
    });

    it('does not write the completion marker when the native write fails', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.setApplicationLanguage.mockRejectedValueOnce(new Error('native unavailable'));

      await initializeAppLanguage();

      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeNull();
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    });
  });

  describe('bootstrap after migration', () => {
    beforeEach(async () => {
      await markMigrationComplete();
    });

    it('adopts AppCompat pl over a stored en preference', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });

    it('adopts AppCompat en over a stored pl preference', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue('en');

      await initializeAppLanguage();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
      expect(i18n.resolvedLanguage).toBe('en');
    });

    it('adopts system when AppCompat reports an empty list and store is pl', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue(null);

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
      expect(i18n.resolvedLanguage).toBe('en');
    });

    it('adopts an explicit AppCompat pl when store is system', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await initializeAppLanguage();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });

    it('does not call native set when store and AppCompat already agree', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
    });

    it('repairs an unsupported native locale to system', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });
      mockNative.getApplicationLanguage.mockResolvedValue('de-DE');

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith(null);
      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  describe('foreground sync', () => {
    it('adopts AppCompat pl over an explicit en preference', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await syncAppLanguageFromSystem();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
    });

    it('adopts AppCompat en over an explicit pl preference', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue('en');

      await syncAppLanguageFromSystem();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
      expect(i18n.resolvedLanguage).toBe('en');
    });

    it('adopts system when an explicit pl preference is cleared in App Languages', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue(null);

      await syncAppLanguageFromSystem();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
      expect(i18n.resolvedLanguage).toBe('en');
      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
    });

    it('adopts an explicit AppCompat pl when store is system', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await syncAppLanguageFromSystem();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
    });

    it('performs no redundant writes when nothing changed', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');
      await i18n.changeLanguage('pl');

      await syncAppLanguageFromSystem();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });

    it('repairs an unsupported native locale to system', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue('de-DE');

      await syncAppLanguageFromSystem();

      expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith(null);
      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
      expect(i18n.resolvedLanguage).toBe('en');
    });

    it('does not touch the bridge when unavailable', async () => {
      mockNative.isAvailable = false;
      useAppPreferencesStore.setState({ languagePreference: 'en' });

      await syncAppLanguageFromSystem();

      expect(mockNative.getApplicationLanguage).not.toHaveBeenCalled();
      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  describe('ordering', () => {
    it('applies a Settings selection through native before i18next', async () => {
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

    it('reads native before updating the store during system sync', async () => {
      const order: string[] = [];
      mockNative.getApplicationLanguage.mockImplementation(async () => {
        order.push('native');
        return 'pl';
      });
      const changeLanguage = jest.spyOn(i18n, 'changeLanguage').mockImplementation(async (language) => {
        order.push(`i18n:${language}`);
        return i18n;
      });
      useAppPreferencesStore.setState({ languagePreference: 'en' });

      await syncAppLanguageFromSystem();

      expect(order[0]).toBe('native');
      expect(order.indexOf('native')).toBeLessThan(order.indexOf('i18n:pl'));
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      changeLanguage.mockRestore();
    });
  });

  it('does not expose unsupported native locale values', async () => {
    mockNative.getApplicationLanguage.mockResolvedValue('de-DE');

    await expect(getNativeApplicationLanguage()).resolves.toBeNull();
  });
});
