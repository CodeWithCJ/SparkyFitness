import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

import {
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
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/appLanguageNative', () => ({
  AppLanguageNative: {
    isAvailable: true,
    supportsNativePerAppLanguage: true,
    setApplicationLanguage: jest.fn(async () => undefined),
    getApplicationLanguage: jest.fn(async () => null),
    getEffectiveLanguage: jest.fn(async () => 'en'),
  },
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

const mockNative = AppLanguageNative as jest.Mocked<typeof AppLanguageNative>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

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
    mockNative.supportsNativePerAppLanguage = true;
    mockNative.setApplicationLanguage.mockReset();
    mockNative.getApplicationLanguage.mockReset();
    mockNative.getEffectiveLanguage.mockReset().mockResolvedValue('en');
    mockAddLog.mockClear();
    nativeApplication = null;
    mockNative.getApplicationLanguage.mockImplementation(async () => nativeApplication);
    mockNative.setApplicationLanguage.mockImplementation(async (language: string | null) => {
      nativeApplication = language;
    });
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
    ]);
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  describe('Android <=12 / no native per-app language support', () => {
    beforeEach(() => {
      mockNative.supportsNativePerAppLanguage = false;
    });

    it('never calls native set/get and writes no migration marker', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(mockNative.getApplicationLanguage).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeNull();
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    });

    it('treats the stored preference as authoritative for manual en/pl', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });

      await initializeAppLanguage();

      expect(i18n.resolvedLanguage).toBe('pl');
    });

    it('resolves system through expo-localization (device locale)', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'pl', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
      ]);

      await initializeAppLanguage();

      expect(i18n.resolvedLanguage).toBe('pl');
      expect(mockNative.getEffectiveLanguage).not.toHaveBeenCalled();
    });

    it('applies a manual selection locally without native calls', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });

      await setAppLanguagePreference('pl');

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });

  describe('migration (Android 13+)', () => {
    it('migrates a stored system preference without writing a locale override', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeTruthy();
      expect(i18n.resolvedLanguage).toBe('en');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
    });

    it('migrates a stored en preference to the platform locale en', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith('en');
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeTruthy();
      expect(i18n.resolvedLanguage).toBe('en');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
    });

    it('migrates a stored pl preference to the platform locale pl', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).toHaveBeenCalledWith('pl');
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeTruthy();
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    });

    it('does not write the completion marker when the native write fails (retries next launch)', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.setApplicationLanguage.mockRejectedValueOnce(new Error('native unavailable'));

      await initializeAppLanguage();

      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeNull();
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    });

    it('does not write the completion marker when the native read-back fails (retries next launch)', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockRejectedValueOnce(new Error('read failed'));

      await initializeAppLanguage();

      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeNull();
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
    });

    it('retries the migration on the next bootstrap after a failed handoff', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.setApplicationLanguage.mockRejectedValueOnce(new Error('native unavailable'));

      await initializeAppLanguage();
      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeNull();

      // Restore the tracking implementation (the rejected once is consumed) so
      // the retried handoff writes and read-backs pl.
      mockNative.setApplicationLanguage.mockImplementation(async (language: string | null) => {
        nativeApplication = language;
      });
      await initializeAppLanguage();

      expect(await AsyncStorage.getItem(MIGRATION_KEY)).toBeTruthy();
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
  });

  describe('bootstrap after migration (Android 13+ adopt path)', () => {
    beforeEach(async () => {
      await markMigrationComplete();
    });

    it('falls back to the stored preference when the native read rejects', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockRejectedValue(new Error('bridge failure'));

      await expect(initializeAppLanguage()).resolves.toBe('pl');
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Native application-language read failed'),
        'WARNING',
      );
    });

    it('adopts platform pl over a stored en preference', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });

    it('adopts platform en over a stored pl preference', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue('en');

      await initializeAppLanguage();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
      expect(i18n.resolvedLanguage).toBe('en');
    });

    it('adopts system when the platform reports an empty list and store is pl', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue(null);

      await initializeAppLanguage();

      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
      expect(i18n.resolvedLanguage).toBe('en');
    });

    it('adopts an explicit platform pl when store is system', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await initializeAppLanguage();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });

    it('does not call native set when store and platform already agree', async () => {
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

  describe('native effective-language reads', () => {
    it('falls back to expo-localization when the native read rejects', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });
      mockNative.getEffectiveLanguage.mockRejectedValue(new Error('bridge failure'));
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'pl', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
      ]);

      await initializeAppLanguage();

      expect(i18n.resolvedLanguage).toBe('pl');
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read native effective language'),
        'WARNING',
      );
    });

    it('falls back to expo-localization when the native value is unsupported', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'system' });
      mockNative.getEffectiveLanguage.mockResolvedValue('de-DE');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
      ]);

      await initializeAppLanguage();

      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  describe('foreground sync', () => {
    it('adopts platform pl over an explicit en preference', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });
      mockNative.getApplicationLanguage.mockResolvedValue('pl');

      await syncAppLanguageFromSystem();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
    });

    it('falls back to the stored preference when the native read rejects', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockRejectedValue(new Error('bridge failure'));

      await syncAppLanguageFromSystem();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });

    it('adopts system when an explicit pl preference is cleared in App Languages', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'pl' });
      mockNative.getApplicationLanguage.mockResolvedValue(null);

      await syncAppLanguageFromSystem();

      expect(useAppPreferencesStore.getState().languagePreference).toBe('system');
      expect(i18n.resolvedLanguage).toBe('en');
      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
    });

    it('uses the stored preference when native support is absent', async () => {
      mockNative.supportsNativePerAppLanguage = false;
      useAppPreferencesStore.setState({ languagePreference: 'en' });

      await syncAppLanguageFromSystem();

      expect(mockNative.getApplicationLanguage).not.toHaveBeenCalled();
      expect(mockNative.setApplicationLanguage).not.toHaveBeenCalled();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  describe('settings selection', () => {
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

    it('rejects and preserves the previous language when the native write fails', async () => {
      useAppPreferencesStore.setState({ languagePreference: 'en' });
      mockNative.setApplicationLanguage.mockRejectedValue(new Error('native unavailable'));

      await expect(setAppLanguagePreference('pl')).rejects.toThrow('native unavailable');

      expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
      expect(i18n.resolvedLanguage).toBe('en');
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Native application-language write failed'),
        'ERROR',
      );
    });
  });

  describe('ordering', () => {
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
});
