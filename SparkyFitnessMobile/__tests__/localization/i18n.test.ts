import { getLocales } from 'expo-localization';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [
    { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
  ]),
}));

const mockStorage: Record<string, string> = {
  '@SparkyFitness/app-preferences': JSON.stringify({
    state: { languagePreference: 'pl' },
    version: 1,
  }),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  }),
}));

import {
  resolveLanguagePreference,
  getDeviceLanguage,
  SUPPORTED_LANGUAGES,
} from '../../src/localization/i18n';

describe('resolveLanguagePreference', () => {
  it('returns device language for system preference', () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'pl', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
    ]);
    expect(resolveLanguagePreference('system')).toBe('pl');
  });

  it('returns en for system preference on English device', () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
    ]);
    expect(resolveLanguagePreference('system')).toBe('en');
  });

  it('returns explicit language when not system', () => {
    expect(resolveLanguagePreference('pl')).toBe('pl');
    expect(resolveLanguagePreference('en')).toBe('en');
  });
});

describe('getDeviceLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns pl for Polish locale', () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'pl', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
    ]);
    expect(getDeviceLanguage()).toBe('pl');
  });

  it('returns en for English locale', () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
    ]);
    expect(getDeviceLanguage()).toBe('en');
  });

  it('returns en for unsupported device locale (de-DE)', () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'de', languageTag: 'de-DE', regionCode: 'DE', textDirection: 'ltr' },
    ]);
    expect(getDeviceLanguage()).toBe('en');
  });
});

describe('getAppLocale', () => {
  it('returns en-US for English', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n, getAppLocale } = require('../../src/localization/i18n');
      await initializeI18n();
      await i18n.changeLanguage('en');
      expect(getAppLocale()).toBe('en-US');
    });
  });

  it('returns pl-PL for Polish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n, getAppLocale } = require('../../src/localization/i18n');
      await initializeI18n();
      await i18n.changeLanguage('pl');
      expect(getAppLocale()).toBe('pl-PL');
    });
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('includes en and pl', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'pl']);
  });
});

describe('initializeI18n hydration', () => {
  beforeEach(() => {
    delete mockStorage['@SparkyFitness/app-preferences'];
  });

  it('reads stored pl preference and sets Polish', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'pl' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });

  it('reads stored en preference and sets English', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'en' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('uses device language when no stored preference', async () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
    ]);

    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('falls back to English for a key missing from Polish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n();
      await i18n.changeLanguage('pl');
      // The probe key exists only in the en resource; with fallbackLng 'en' the
      // pl lookup must resolve to the English value instead of the raw key.
      i18n.addResource('en', 'translation', 'fallbackProbeKey', 'English fallback text');
      expect(i18n.t('fallbackProbeKey')).toBe('English fallback text');
    });
  });
});

describe('initializeI18n preference normalization', () => {
  beforeEach(() => {
    delete mockStorage['@SparkyFitness/app-preferences'];
  });

  it('stored pl preference sets pl', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'pl' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });

  it('stored en preference sets en', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'en' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('system preference with pl-PL device sets pl', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'system' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'pl', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
      ]);

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });

  it('system preference with en-US device sets en', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'system' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
      ]);

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('system preference with unsupported de-DE device sets en', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'system' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'de', languageTag: 'de-DE', regionCode: 'DE', textDirection: 'ltr' },
      ]);

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('no stored preference uses system (device language)', async () => {
    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'pl', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
      ]);

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });

  it('missing languagePreference in stored state uses system', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { hapticsEnabled: false },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
      ]);

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('invalid preference value (de) uses system', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = JSON.stringify({
      state: { languagePreference: 'de' },
      version: 1,
    });

    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
      ]);

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      // 'de' is not a valid LanguagePreference → normalized to 'system' → device language (en)
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });
});

describe('initializeI18n error resilience', () => {
  beforeEach(() => {
    delete mockStorage['@SparkyFitness/app-preferences'];
  });

  it('corrupted JSON does not break initialization', async () => {
    mockStorage['@SparkyFitness/app-preferences'] = '{ invalid json }';

    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
      ]);

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      // Corrupted JSON → falls back to 'system' → device language (en)
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('AsyncStorage.getItem error does not break initialization', async () => {
    await jest.isolateModulesAsync(async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      AsyncStorage.getItem.mockImplementationOnce(() =>
        Promise.reject(new Error('Storage error')),
      );

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      // On AsyncStorage error → falls back to 'en'
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('fallback to en on controlled error', async () => {
    await jest.isolateModulesAsync(async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      AsyncStorage.getItem.mockImplementationOnce(() =>
        Promise.reject(new Error('Storage error')),
      );

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      const result = await initializeI18n();
      expect(result).toBeUndefined();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });
});

describe('initializeI18n idempotency', () => {
  beforeEach(() => {
    delete mockStorage['@SparkyFitness/app-preferences'];
  });

  it('multiple calls do not initialize i18n instance twice', async () => {
    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      const initSpy = jest.spyOn(i18n, 'init');

      await initializeI18n();
      await initializeI18n();

      expect(initSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('parallel calls return the same in-flight initialization', async () => {
    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      const initSpy = jest.spyOn(i18n, 'init');

      await Promise.all([initializeI18n(), initializeI18n()]);

      expect(initSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('applyLanguagePreference', () => {
  beforeEach(() => {
    delete mockStorage['@SparkyFitness/app-preferences'];
  });

  it('applyLanguagePreference(pl) works after initialization', async () => {
    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, applyLanguagePreference, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      await applyLanguagePreference('pl');
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });

  it('applyLanguagePreference(system) re-resolves device language at call time', async () => {
    await jest.isolateModulesAsync(async () => {
      const { getLocales } = require('expo-localization');
      const { initializeI18n, applyLanguagePreference, default: i18n } = require('../../src/localization/i18n');

      // Initialize with device as en-US
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
      ]);
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');

      // Change device language to pl-PL and apply 'system'
      (getLocales as jest.Mock).mockReturnValue([
        { languageCode: 'pl', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
      ]);
      await applyLanguagePreference('system');
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });
});
