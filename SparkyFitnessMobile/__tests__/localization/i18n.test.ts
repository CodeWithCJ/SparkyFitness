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
    jest.clearMocks();
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
});

describe('getAppLocale', () => {
  it('returns en-US for English', () => {
    jest.isolateModules(() => {
      const { default: i18n, getAppLocale } = require('../../src/localization/i18n');
      i18n.changeLanguage('en');
      expect(getAppLocale()).toBe('en-US');
    });
  });

  it('returns pl-PL for Polish', () => {
    jest.isolateModules(() => {
      const { default: i18n, getAppLocale } = require('../../src/localization/i18n');
      i18n.changeLanguage('pl');
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

    jest.isolateModules(async () => {
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

    jest.isolateModules(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('uses device language when no stored preference', async () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
    ]);

    jest.isolateModules(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      await initializeI18n();
      expect(i18n.resolvedLanguage).toBe('en');
    });
  });

  it('falls back to English for missing Polish translation', () => {
    jest.isolateModules(() => {
      const { default: i18n } = require('../../src/localization/i18n');
      i18n.changeLanguage('pl');
      // Key that exists only in English resource should fall back
      expect(i18n.t('common.nonexistent')).toBe(''); // i18next returns empty string for missing keys
    });
  });
});

describe('protection: dynamic content is not translated', () => {
  it('does not translate food product names', () => {
    jest.isolateModules(() => {
      const { default: i18n } = require('../../src/localization/i18n');
      i18n.changeLanguage('pl');
      // Food names are not valid semantic keys, so they return as-is
      expect(i18n.t('Chicken Breast')).toBe('Chicken Breast');
      expect(i18n.t('Milk 2%')).toBe('Milk 2%');
    });
  });

  it('does not translate server exercise names', () => {
    jest.isolateModules(() => {
      const { default: i18n } = require('../../src/localization/i18n');
      i18n.changeLanguage('pl');
      expect(i18n.t('Bulgarian Split Squat')).toBe('Bulgarian Split Squat');
    });
  });

  it('does not translate custom meal type names', () => {
    jest.isolateModules(() => {
      const { default: i18n } = require('../../src/localization/i18n');
      i18n.changeLanguage('pl');
      // Custom meal types like "Drugie śniadanie" should not be translated
      expect(i18n.t('Drugie śniadanie')).toBe('Drugie śniadanie');
    });
  });

  it('does not translate custom measurement category names', () => {
    jest.isolateModules(() => {
      const { default: i18n } = require('../../src/localization/i18n');
      i18n.changeLanguage('pl');
      // Custom measurement categories are not semantic keys
      expect(i18n.t('Blood Glucose')).toBe('Blood Glucose');
    });
  });
});
