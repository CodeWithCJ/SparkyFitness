import { getLocales } from 'expo-localization';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [
    { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
  ]),
}));

const mockStorage: Record<string, string> = {};

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
  formatLocalizedNumber,
} from '../../src/localization/i18n';

const STORE_KEY = '@SparkyFitness/app-preferences';

function storedPreference(preference: string): string {
  return JSON.stringify({ state: { languagePreference: preference }, version: 1 });
}

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

  it('maps pl-PL to pl (region suffix is not required)', () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'pl-PL', languageTag: 'pl-PL', regionCode: 'PL', textDirection: 'ltr' },
    ]);
    expect(getDeviceLanguage()).toBe('pl');
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

describe('representative PR3 strings', () => {
  it('renders the language settings, shell and save strings in English', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n();
      await i18n.changeLanguage('en');

      expect(i18n.t('settings.language.title')).toBe('Language');
      expect(i18n.t('settings.language.system')).toBe('System');
      expect(i18n.t('settings.language.english')).toBe('English');
      expect(i18n.t('settings.language.polish')).toBe('Polish');
      expect(i18n.t('settings.app')).toBe('App Settings');
      expect(i18n.t('navigation.settings')).toBe('Settings');
      expect(i18n.t('common.save')).toBe('Save');
      expect(i18n.t('common.saving')).toBe('Saving…');
    });
  });

  it('renders the language settings, shell and save strings in Polish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n();
      await i18n.changeLanguage('pl');

      expect(i18n.t('settings.language.title')).toBe('Język');
      expect(i18n.t('settings.language.system')).toBe('Systemowy');
      expect(i18n.t('settings.language.english')).toBe('Angielski');
      expect(i18n.t('settings.language.polish')).toBe('Polski');
      expect(i18n.t('settings.app')).toBe('Ustawienia aplikacji');
      expect(i18n.t('navigation.settings')).toBe('Ustawienia');
      expect(i18n.t('common.save')).toBe('Zapisz');
      expect(i18n.t('common.saving')).toBe('Zapisywanie…');
    });
  });
});

describe('English fallback contract', () => {
  it('resolves a Polish key that exists to Polish text', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n();
      await i18n.changeLanguage('pl');
      expect(i18n.t('settings.language.title')).toBe('Język');
    });
  });

  it('falls back to the English resource when a Polish key is missing', async () => {
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

  it('uses the explicit fallback string when the resource is missing entirely', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.t('no.such.key', 'Fallback label')).toBe('Fallback label');
      expect(i18n.t('no.such.key', { defaultValue: 'Fallback label' })).toBe('Fallback label');
    });
  });

  it('never leaks a raw translation key into the UI', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n();
      await i18n.changeLanguage('en');
      expect(i18n.t('missing.key.with.fallback', 'Readable text')).not.toContain('missing.key');
      await i18n.changeLanguage('pl');
      // Missing in pl AND en → explicit fallback still wins.
      expect(i18n.t('missing.key.with.fallback', 'Readable text')).toBe('Readable text');
    });
  });

  it('interpolates the explicit fallback template', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(
        i18n.t('example.greeting', {
          name: 'Kamil',
          defaultValue: 'Hello, {{name}}',
        }),
      ).toBe('Hello, Kamil');
    });
  });
});

describe('initializeI18n hydration', () => {
  beforeEach(() => {
    delete mockStorage[STORE_KEY];
  });

  it('reads stored pl preference and sets Polish', async () => {
    mockStorage[STORE_KEY] = storedPreference('pl');

    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('pl');
    });
  });

  it('reads stored en preference and sets English', async () => {
    mockStorage[STORE_KEY] = storedPreference('en');

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

  it('system preference with pl-PL device sets pl', async () => {
    mockStorage[STORE_KEY] = storedPreference('system');

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
    mockStorage[STORE_KEY] = storedPreference('system');

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
    mockStorage[STORE_KEY] = storedPreference('system');

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
    mockStorage[STORE_KEY] = JSON.stringify({
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
    mockStorage[STORE_KEY] = storedPreference('de');

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
    delete mockStorage[STORE_KEY];
  });

  it('corrupted JSON does not break initialization', async () => {
    mockStorage[STORE_KEY] = '{ invalid json }';

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

  it('storage failure keeps the app in a usable English state', async () => {
    await jest.isolateModulesAsync(async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      AsyncStorage.getItem.mockImplementationOnce(() =>
        Promise.reject(new Error('Storage error')),
      );

      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      const result = await initializeI18n();
      expect(result).toBeUndefined();
      expect(i18n.resolvedLanguage).toBe('en');
      // No raw key flash: the representative label resolves through the fallback.
      expect(i18n.t('settings.language.title', 'Language')).toBe('Language');
    });
  });
});

describe('initializeI18n idempotency', () => {
  beforeEach(() => {
    delete mockStorage[STORE_KEY];
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
    delete mockStorage[STORE_KEY];
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

describe('localized number formatting', () => {
  it('uses the active application locale and supports number options', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n, formatLocalizedNumber: formatNumber } = require('../../src/localization/i18n');
      await initializeI18n();

      await i18n.changeLanguage('en');
      expect(formatNumber(12345.678, { maximumFractionDigits: 1 })).toBe(
        new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(12345.678),
      );

      await i18n.changeLanguage('pl');
      expect(formatNumber(12345.678, { maximumFractionDigits: 1 })).toBe(
        new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(12345.678),
      );
      expect(formatLocalizedNumber).toBeDefined();
    });
  });
});
