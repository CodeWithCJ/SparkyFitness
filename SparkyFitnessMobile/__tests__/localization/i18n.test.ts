import { getLocales } from 'expo-localization';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [
    { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' },
  ]),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

import {
  normalizeLanguage,
  getDeviceLanguage,
  SUPPORTED_LANGUAGES,
} from '../../src/localization/i18n';

describe('normalizeLanguage', () => {
  it('maps Polish tags to pl', () => {
    expect(normalizeLanguage('pl')).toBe('pl');
    expect(normalizeLanguage('pl-PL')).toBe('pl');
    expect(normalizeLanguage('PL')).toBe('pl');
  });

  it('maps Spanish tags to es', () => {
    expect(normalizeLanguage('es')).toBe('es');
    expect(normalizeLanguage('es-ES')).toBe('es');
    expect(normalizeLanguage('ES')).toBe('es');
  });

  it('maps everything else to en', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('de')).toBe('en');
    expect(normalizeLanguage(null)).toBe('en');
    expect(normalizeLanguage(undefined)).toBe('en');
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

  it('returns es for Spanish locale', () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageCode: 'es', languageTag: 'es-ES', regionCode: 'ES', textDirection: 'ltr' },
    ]);
    expect(getDeviceLanguage()).toBe('es');
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

describe('SUPPORTED_LANGUAGES', () => {
  it('includes en, pl and es', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'pl', 'es']);
  });
});

describe('representative PR3 strings', () => {
  it('renders the language settings, shell and save strings in English', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');

      expect(i18n.t('settings.language.title')).toBe('Language');
      expect(i18n.t('settings.language.system')).toBe('System');
      expect(i18n.t('settings.language.english')).toBe('English');
      expect(i18n.t('settings.language.polish')).toBe('Polski');
      expect(i18n.t('settings.language.pickerHint')).toBe('Opens language selection menu');
      expect(i18n.t('settings.app')).toBe('App Settings');
      expect(i18n.t('navigation.settings')).toBe('Settings');
      expect(i18n.t('common.save')).toBe('Save');
      expect(i18n.t('common.saving')).toBe('Saving…');
    });
  });

  it('renders the language settings, shell and save strings in Polish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');

      expect(i18n.t('settings.language.title')).toBe('Język');
      expect(i18n.t('settings.language.system')).toBe('Systemowy');
      expect(i18n.t('settings.language.english')).toBe('English');
      expect(i18n.t('settings.language.polish')).toBe('Polski');
      expect(i18n.t('settings.language.pickerHint')).toBe('Otwiera menu wyboru języka');
      expect(i18n.t('settings.app')).toBe('Ustawienia aplikacji');
      expect(i18n.t('navigation.settings')).toBe('Ustawienia');
      expect(i18n.t('common.save')).toBe('Zapisz');
      expect(i18n.t('common.saving')).toBe('Zapisywanie…');
    });
  });

  it('renders the language settings, shell and save strings in Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('es');

      expect(i18n.t('settings.language.title')).toBe('Idioma');
      expect(i18n.t('settings.language.system')).toBe('Sistema');
      expect(i18n.t('settings.language.english')).toBe('English');
      expect(i18n.t('settings.language.polish')).toBe('Polski');
      expect(i18n.t('settings.language.spanish')).toBe('Español');
      expect(i18n.t('settings.language.pickerHint')).toBe('Abre el menú de selección de idioma');
      expect(i18n.t('settings.app')).toBe('Ajustes de la app');
      expect(i18n.t('navigation.settings')).toBe('Ajustes');
      expect(i18n.t('common.save')).toBe('Guardar');
      expect(i18n.t('common.saving')).toBe('Guardando…');
    });
  });

  it('keeps the endonym Polski in the English catalog', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(i18n.t('settings.language.polish')).toBe('Polski');
    });
  });
});

describe('English fallback contract', () => {
  it('resolves a Polish key that exists to Polish text', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      expect(i18n.t('settings.language.title')).toBe('Język');
    });
  });

  it('falls back to English when a Polish translation is empty', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      i18n.addResource('en', 'translation', 'emptyFallbackProbe', 'New feature');
      i18n.addResource('pl', 'translation', 'emptyFallbackProbe', '');
      expect(i18n.t('emptyFallbackProbe')).toBe('New feature');
    });
  });

  it('falls back to the English resource when a Polish key is missing', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      // The probe key exists only in the en resource; with fallbackLng 'en' the
      // pl lookup must resolve to the English value instead of the raw key.
      i18n.addResource('en', 'translation', 'fallbackProbeKey', 'English fallback text');
      expect(i18n.t('fallbackProbeKey')).toBe('English fallback text');
    });
  });

  it('uses the explicit fallback string when the resource is missing entirely', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(i18n.t('no.such.key', 'Fallback label')).toBe('Fallback label');
      expect(i18n.t('no.such.key', { defaultValue: 'Fallback label' })).toBe('Fallback label');
    });
  });

  it('never leaks a raw translation key into the UI', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(i18n.t('missing.key.with.fallback', 'Readable text')).toBe('Readable text');
      await i18n.changeLanguage('pl');
      // Missing in pl AND en → explicit fallback still wins.
      expect(i18n.t('missing.key.with.fallback', 'Readable text')).toBe('Readable text');
    });
  });

  it('interpolates the explicit fallback template', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(
        i18n.t('example.greeting', {
          name: 'Kamil',
          defaultValue: 'Hello, {{name}}',
        }),
      ).toBe('Hello, Kamil');
    });
  });
});

describe('initializeI18n error resilience', () => {
  it('falls back to English when the requested language init fails', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      const initSpy = jest.spyOn(i18n, 'init');
      initSpy.mockRejectedValueOnce(new Error('pl init failed'));

      const result = await initializeI18n('pl');

      expect(result).toBeUndefined();
      expect(i18n.isInitialized).toBe(true);
      expect(i18n.resolvedLanguage).toBe('en');
      expect(i18n.t('settings.language.title', 'Language')).toBe('Language');
      initSpy.mockRestore();
    });
  });

  it('keeps the session retryable when the English fallback also fails', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      const initSpy = jest.spyOn(i18n, 'init');
      initSpy
        .mockRejectedValueOnce(new Error('pl init failed'))
        .mockRejectedValueOnce(new Error('en init failed'));

      // Both the primary and the fallback init fail; the call still completes
      // (resilient contract) without initializing the instance.
      await expect(initializeI18n('pl')).resolves.toBeUndefined();
      expect(i18n.isInitialized).toBeFalsy();

      // The cached failed promise must be cleared: the second call retries and
      // a successful attempt initializes the instance.
      initSpy.mockRestore();
      await expect(initializeI18n('pl')).resolves.toBeUndefined();
      expect(i18n.isInitialized).toBe(true);
      expect(i18n.resolvedLanguage).toBe('pl');
      initSpy.mockRestore();
    });
  });
});

describe('initializeI18n idempotency', () => {
  it('multiple calls do not initialize i18n instance twice', async () => {
    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      const initSpy = jest.spyOn(i18n, 'init');

      await initializeI18n('en');
      await initializeI18n('en');

      expect(initSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('parallel calls return the same in-flight initialization', async () => {
    await jest.isolateModulesAsync(async () => {
      const { initializeI18n, default: i18n } = require('../../src/localization/i18n');
      const initSpy = jest.spyOn(i18n, 'init');

      await Promise.all([initializeI18n('en'), initializeI18n('en')]);

      expect(initSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ImportHistory pluralization', () => {
  it('uses singular and plural English forms for day counters', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      const progress = (count: number) => i18n.t('importHistory.progress.ofDays', {
        defaultValue: 'of {{formattedCount}} days',
        count,
        formattedCount: String(count),
      });
      const imported = (count: number) => i18n.t('importHistory.done.daysImported', {
        defaultValue: '{{formattedCount}} days imported',
        count,
        formattedCount: String(count),
      });
      expect(progress(1)).toBe('of 1 day');
      expect(progress(2)).toBe('of 2 days');
      expect(imported(1)).toBe('1 day imported');
      expect(imported(12)).toBe('12 days imported');
    });
  });

  it('uses Polish one/few/many forms for representative day counts', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      const progress = (count: number) => i18n.t('importHistory.progress.ofDays', {
        defaultValue: 'of {{formattedCount}} days',
        count,
        formattedCount: String(count),
      });
      const imported = (count: number) => i18n.t('importHistory.done.daysImported', {
        defaultValue: '{{formattedCount}} days imported',
        count,
        formattedCount: String(count),
      });
      expect(progress(0)).toBe('z 0 dni');
      expect(progress(1)).toBe('z 1 dnia');
      expect(progress(2)).toBe('z 2 dni');
      expect(progress(5)).toBe('z 5 dni');
      expect(progress(12)).toBe('z 12 dni');
      expect(progress(22)).toBe('z 22 dni');
      expect(progress(25)).toBe('z 25 dni');
      expect(imported(1)).toBe('Zaimportowano 1 dzień');
      expect(imported(2)).toBe('Zaimportowano 2 dni');
      expect(imported(5)).toBe('Zaimportowano 5 dni');
      expect(imported(12)).toBe('Zaimportowano 12 dni');
      expect(imported(22)).toBe('Zaimportowano 22 dni');
      expect(imported(25)).toBe('Zaimportowano 25 dni');
    });
  });

  it('uses Spanish one/other forms for representative day counts', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('es');
      const progress = (count: number) => i18n.t('importHistory.progress.ofDays', {
        defaultValue: 'of {{formattedCount}} days',
        count,
        formattedCount: String(count),
      });
      const imported = (count: number) => i18n.t('importHistory.done.daysImported', {
        defaultValue: '{{formattedCount}} days imported',
        count,
        formattedCount: String(count),
      });
      expect(progress(1)).toBe('de 1 día');
      expect(progress(2)).toBe('de 2 días');
      expect(imported(1)).toBe('1 día importado');
      expect(imported(12)).toBe('12 días importados');
    });
  });
});

describe('controlled glycemic index translations', () => {
  it('resolves all GI enum labels in English, Polish and Spanish from the catalogs', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      const keys = [
        ['nutrients.glycemicIndexNone', 'None'],
        ['nutrients.glycemicIndexVeryLow', 'Very Low'],
        ['nutrients.glycemicIndexLow', 'Low'],
        ['nutrients.glycemicIndexMedium', 'Medium'],
        ['nutrients.glycemicIndexHigh', 'High'],
        ['nutrients.glycemicIndexVeryHigh', 'Very High'],
      ] as const;
      for (const [key, fallback] of keys) {
        expect(i18n.t(key, { defaultValue: fallback })).toBe(fallback);
      }
      await i18n.changeLanguage('pl');
      const polish = ['Brak', 'Bardzo niski', 'Niski', 'Średni', 'Wysoki', 'Bardzo wysoki'];
      keys.forEach(([key], index) => {
        expect(i18n.t(key, { defaultValue: keys[index][1] })).toBe(polish[index]);
      });
      await i18n.changeLanguage('es');
      const spanish = ['Ninguno', 'Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'];
      keys.forEach(([key], index) => {
        expect(i18n.t(key, { defaultValue: keys[index][1] })).toBe(spanish[index]);
      });
    });
  });
});

describe('ImportHistory pluralization matrix', () => {
  it.each([0, 1, 2, 5, 12, 22, 25])('resolves Polish daysImported for count %s', async (count) => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      const result = i18n.t('importHistory.done.daysImported', {
        defaultValue: '{{formattedCount}} days imported',
        count,
        formattedCount: String(count),
      });
      const expected = count === 1 ? `Zaimportowano ${count} dzień` : `Zaimportowano ${count} dni`;
      expect(result).toBe(expected);
    });
  });
});

describe('ImportHistory plural fallback contract', () => {
  it('keeps English fallback grammatically correct when plural resources are missing', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(i18n.t('missing.importHistory.ofDays', { defaultValue: 'of {{formattedCount}} days', defaultValue_one: 'of {{formattedCount}} day', defaultValue_other: 'of {{formattedCount}} days', count: 1, formattedCount: '1' })).toBe('of 1 day');
      expect(i18n.t('missing.importHistory.ofDays', { defaultValue: 'of {{formattedCount}} days', defaultValue_one: 'of {{formattedCount}} day', defaultValue_other: 'of {{formattedCount}} days', count: 2, formattedCount: '2' })).toBe('of 2 days');
      expect(i18n.t('missing.importHistory.daysImported', { defaultValue: '{{formattedCount}} days imported', defaultValue_one: '{{formattedCount}} day imported', defaultValue_other: '{{formattedCount}} days imported', count: 1, formattedCount: '1' })).toBe('1 day imported');
      expect(i18n.t('missing.importHistory.daysImported', { defaultValue: '{{formattedCount}} days imported', defaultValue_one: '{{formattedCount}} day imported', defaultValue_other: '{{formattedCount}} days imported', count: 12, formattedCount: '12' })).toBe('12 days imported');
    });
  });

  it('resolves the Polish other category for decimal day counts', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      expect(i18n.t('importHistory.progress.ofDays', { defaultValue: 'of {{formattedCount}} days', defaultValue_one: 'of {{formattedCount}} day', defaultValue_few: 'z {{formattedCount}} dni', defaultValue_many: 'z {{formattedCount}} dni', defaultValue_other: 'z {{formattedCount}} dnia', count: 1.2, formattedCount: '1,2' })).toBe('z 1,2 dni');
      expect(i18n.t('importHistory.done.daysImported', { defaultValue: '{{formattedCount}} days imported', defaultValue_one: '{{formattedCount}} day imported', defaultValue_few: 'Zaimportowano {{formattedCount}} dni', defaultValue_many: 'Zaimportowano {{formattedCount}} dni', defaultValue_other: 'Zaimportowano {{formattedCount}} dnia', count: 1.2, formattedCount: '1,2' })).toBe('Zaimportowano 1,2 dni');
    });
  });
});

describe('FoodEntryAdd localization', () => {
  it('resolves serving and meal yield plurals in English, Polish and Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(i18n.t('foodEntryAdd.labels.serving', { defaultValue: 'serving', count: 1 })).toBe('serving');
      expect(i18n.t('foodEntryAdd.labels.serving', { defaultValue: 'serving', count: 2 })).toBe('servings');
      expect(i18n.t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{formattedCount}} serving', defaultValue_one: 'meal makes {{formattedCount}} serving', defaultValue_other: 'meal makes {{formattedCount}} servings', count: 1, formattedCount: '1' })).toBe('meal makes 1 serving');
      expect(i18n.t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{formattedCount}} serving', defaultValue_one: 'meal makes {{formattedCount}} serving', defaultValue_other: 'meal makes {{formattedCount}} servings', count: 2, formattedCount: '2' })).toBe('meal makes 2 servings');
      await i18n.changeLanguage('pl');
      expect(i18n.t('foodEntryAdd.labels.serving', { defaultValue: 'serving', count: 1 })).toBe('porcja');
      expect(i18n.t('foodEntryAdd.labels.serving', { defaultValue: 'serving', count: 2 })).toBe('porcje');
      expect(i18n.t('foodEntryAdd.labels.serving', { defaultValue: 'serving', count: 5 })).toBe('porcji');
      expect(i18n.t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{formattedCount}} serving', defaultValue_one: 'meal makes {{formattedCount}} serving', defaultValue_other: 'meal makes {{formattedCount}} servings', count: 1, formattedCount: '1' })).toBe('posiłek daje 1 porcję');
      expect(i18n.t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{formattedCount}} serving', defaultValue_one: 'meal makes {{formattedCount}} serving', defaultValue_other: 'meal makes {{formattedCount}} servings', count: 2, formattedCount: '2' })).toBe('posiłek daje 2 porcje');
      expect(i18n.t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{formattedCount}} serving', defaultValue_one: 'meal makes {{formattedCount}} serving', defaultValue_other: 'meal makes {{formattedCount}} servings', count: 5, formattedCount: '5' })).toBe('posiłek daje 5 porcji');
      await i18n.changeLanguage('es');
      expect(i18n.t('foodEntryAdd.labels.serving', { defaultValue: 'serving', count: 1 })).toBe('ración');
      expect(i18n.t('foodEntryAdd.labels.serving', { defaultValue: 'serving', count: 2 })).toBe('raciones');
      expect(i18n.t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{formattedCount}} serving', defaultValue_one: 'meal makes {{formattedCount}} serving', defaultValue_other: 'meal makes {{formattedCount}} servings', count: 1, formattedCount: '1' })).toBe('la comida rinde 1 ración');
      expect(i18n.t('foodEntryAdd.labels.mealMakes', { defaultValue: 'meal makes {{formattedCount}} serving', defaultValue_one: 'meal makes {{formattedCount}} serving', defaultValue_other: 'meal makes {{formattedCount}} servings', count: 2, formattedCount: '2' })).toBe('la comida rinde 2 raciones');
    });
  });
});

describe('ExerciseSearch localization', () => {
  it('resolves exercise search copy and ownership filter labels in English, Polish and Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(i18n.t('exerciseSearch.tabs.search', { defaultValue: 'Search' })).toBe('Search');
      expect(i18n.t('exerciseSearch.actions.clearSearch', { defaultValue: 'Clear search' })).toBe('Clear search');
      expect(i18n.t('exerciseSearch.filter.emptyTitle', { defaultValue: 'No {{noun}} in {{filter}}', noun: 'exercises', filter: 'Mine' })).toBe('No exercises in Mine');
      expect(i18n.t('exerciseSearch.accessibility.provider', { defaultValue: 'Exercise provider {{provider}}', provider: 'Wger' })).toBe('Exercise provider Wger');
      await i18n.changeLanguage('pl');
      expect(i18n.t('exerciseSearch.tabs.search', { defaultValue: 'Search' })).toBe('Szukaj');
      expect(i18n.t('exerciseSearch.actions.clearSearch', { defaultValue: 'Clear search' })).toBe('Wyczyść wyszukiwanie');
      expect(i18n.t('exerciseSearch.filter.emptyTitle', { defaultValue: 'No {{noun}} in {{filter}}', noun: 'ćwiczenia', filter: 'Moje' })).toBe('Brak: ćwiczenia — Moje');
      expect(i18n.t('exerciseSearch.accessibility.provider', { defaultValue: 'Exercise provider {{provider}}', provider: 'Wger' })).toBe('Dostawca ćwiczeń: Wger');
      await i18n.changeLanguage('es');
      expect(i18n.t('exerciseSearch.tabs.search', { defaultValue: 'Search' })).toBe('Buscar');
      expect(i18n.t('exerciseSearch.actions.clearSearch', { defaultValue: 'Clear search' })).toBe('Borrar búsqueda');
      expect(i18n.t('exerciseSearch.filter.emptyTitle', { defaultValue: 'No {{noun}} in {{filter}}', noun: 'ejercicios', filter: 'Míos' })).toBe('No hay ejercicios en Míos');
      expect(i18n.t('exerciseSearch.accessibility.provider', { defaultValue: 'Exercise provider {{provider}}', provider: 'Wger' })).toBe('Proveedor de ejercicios Wger');
    });
  });
});

describe('FoodSearch localization', () => {
  it('resolves food search copy and filter labels in English, Polish and Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('en');
      expect(i18n.t('foodSearch.menu.newFood', { defaultValue: 'New Food' })).toBe('New Food');
      expect(i18n.t('foodSearch.search.placeholder', { defaultValue: 'Search foods...' })).toBe('Search foods...');
      expect(i18n.t('foodSearch.states.noFilteredFoods', { defaultValue: 'No foods in {{filter}}', filter: 'Mine' })).toBe('No foods in Mine');
      await i18n.changeLanguage('pl');
      expect(i18n.t('foodSearch.menu.newFood', { defaultValue: 'New Food' })).toBe('Nowy produkt');
      expect(i18n.t('foodSearch.search.placeholder', { defaultValue: 'Search foods...' })).toBe('Szukaj produktów...');
      expect(i18n.t('foodSearch.states.noFilteredFoods', { defaultValue: 'No foods in {{filter}}', filter: 'Moje' })).toBe('Brak produktów: Moje');
      await i18n.changeLanguage('es');
      expect(i18n.t('foodSearch.menu.newFood', { defaultValue: 'New Food' })).toBe('Nuevo alimento');
      expect(i18n.t('foodSearch.search.placeholder', { defaultValue: 'Search foods...' })).toBe('Buscar alimentos...');
      expect(i18n.t('foodSearch.states.noFilteredFoods', { defaultValue: 'No foods in {{filter}}', filter: 'Míos' })).toBe('No hay alimentos en Míos');
    });
  });
});

describe('EditBarcode localization', () => {
  it('resolves barcode confirmation, validation, and action copy in Polish and Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      expect(i18n.t('editBarcode.title', { defaultValue: 'Barcode' })).toBe('Kod kreskowy');
      expect(i18n.t('editBarcode.confirm.inUseMessage', { defaultValue: 'This barcode is already attached to "{{otherName}}". Attach it to "{{foodName}}" anyway?', otherName: 'A', foodName: 'B' })).toBe('Ten kod jest już przypisany do „A”. Czy mimo to przypisać go do „B”?');
      expect(i18n.t('editBarcode.errors.invalidFormat', { defaultValue: 'Barcode must be 8-14 digits.' })).toContain('8');
      expect(i18n.t('editBarcode.actions.attach', { defaultValue: 'Attach' })).toBe('Przypisz');
      await i18n.changeLanguage('es');
      expect(i18n.t('editBarcode.title', { defaultValue: 'Barcode' })).toBe('Código de barras');
      expect(i18n.t('editBarcode.confirm.inUseMessage', { defaultValue: 'This barcode is already attached to "{{otherName}}". Attach it to "{{foodName}}" anyway?', otherName: 'A', foodName: 'B' })).toBe('Este código de barras ya está asociado a «A». ¿Asociarlo a «B» de todos modos?');
      expect(i18n.t('editBarcode.errors.invalidFormat', { defaultValue: 'Barcode must be 8-14 digits.' })).toContain('8');
      expect(i18n.t('editBarcode.actions.attach', { defaultValue: 'Attach' })).toBe('Asociar');
    });
  });
});

describe('WorkoutDetail localization', () => {
  it('resolves workout summary and editing copy in Polish and Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      expect(i18n.t('workoutDetail.summary.exercise_one', { defaultValue: 'Exercise' })).toBe('Ćwiczenie');
      expect(i18n.t('workoutDetail.summary.exercise_few', { defaultValue: 'Exercises' })).toBe('Ćwiczenia');
      expect(i18n.t('workoutDetail.summary.exercise_many', { defaultValue: 'Exercises' })).toBe('Ćwiczeń');
      expect(i18n.t('workoutDetail.labels.details', { defaultValue: 'Details' })).toBe('Szczegóły');
      expect(i18n.t('workoutDetail.title.edit', { defaultValue: 'Edit Workout' })).toBe('Edytuj trening');
      await i18n.changeLanguage('es');
      expect(i18n.t('workoutDetail.summary.exercise_one', { defaultValue: 'Exercise' })).toBe('Ejercicio');
      expect(i18n.t('workoutDetail.summary.exercise_other', { defaultValue: 'Exercises' })).toBe('Ejercicios');
      expect(i18n.t('workoutDetail.labels.details', { defaultValue: 'Details' })).toBe('Detalles');
      expect(i18n.t('workoutDetail.title.edit', { defaultValue: 'Edit Workout' })).toBe('Editar entrenamiento');
    });
  });
});

describe('ActivityDetail localization', () => {
  it('resolves activity detail statistics and editing copy in Polish and Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      expect(i18n.t('activityDetail.stats.duration', { defaultValue: 'Duration' })).toBe('Czas trwania');
      expect(i18n.t('activityDetail.stats.avgHeartRate', { defaultValue: 'Avg Heart Rate' })).toBe('Średnie tętno');
      expect(i18n.t('activityDetail.labels.secondsShort', { defaultValue: 'Sec' })).toBe('Sek.');
      expect(i18n.t('activityDetail.accessibility.edit', { defaultValue: 'Edit activity' })).toBe('Edytuj aktywność');
      await i18n.changeLanguage('es');
      expect(i18n.t('activityDetail.stats.duration', { defaultValue: 'Duration' })).toBe('Duración');
      expect(i18n.t('activityDetail.stats.avgHeartRate', { defaultValue: 'Avg Heart Rate' })).toBe('Frecuencia cardíaca media');
      expect(i18n.t('activityDetail.labels.secondsShort', { defaultValue: 'Sec' })).toBe('Seg');
      expect(i18n.t('activityDetail.accessibility.edit', { defaultValue: 'Edit activity' })).toBe('Editar actividad');
    });
  });
});

describe('FoodSettings localization', () => {
  it('resolves food settings labels and descriptions in Polish and Spanish', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      expect(i18n.t('foodSettings.title', { defaultValue: 'Food Settings' })).toBe('Ustawienia produktów');
      expect(i18n.t('foodSettings.mealTypes.title', { defaultValue: 'Meal Types' })).toBe('Typy posiłków');
      expect(i18n.t('foodSettings.netCarbs.title', { defaultValue: 'Show Net Carbs' })).toBe('Pokaż węglowodany netto');
      expect(i18n.t('foodSettings.barcode.retryTitle', { defaultValue: 'Retry with Open Food Facts' })).toBe('Spróbuj ponownie z Open Food Facts');
      await i18n.changeLanguage('es');
      expect(i18n.t('foodSettings.title', { defaultValue: 'Food Settings' })).toBe('Ajustes de comida');
      expect(i18n.t('foodSettings.mealTypes.title', { defaultValue: 'Meal Types' })).toBe('Tipos de comida');
      expect(i18n.t('foodSettings.netCarbs.title', { defaultValue: 'Show Net Carbs' })).toBe('Mostrar carbohidratos netos');
      expect(i18n.t('foodSettings.barcode.retryTitle', { defaultValue: 'Retry with Open Food Facts' })).toBe('Reintentar con Open Food Facts');
    });
  });
});

describe('WorkoutComplete localization', () => {
  it('resolves completion labels, RPE, and Polish and Spanish set plurals', async () => {
    await jest.isolateModulesAsync(async () => {
      const { default: i18n, initializeI18n } = require('../../src/localization/i18n');
      await initializeI18n('pl');
      expect(i18n.t('workoutComplete.title', { defaultValue: 'Workout Complete' })).toBe('Trening ukończony');
      expect(i18n.t('workoutComplete.rpe.hard', { defaultValue: 'Hard' })).toBe('Trudny');
      expect(i18n.t('workoutComplete.labels.sets', { defaultValue: '{{count}} sets', count: 1 })).toBe('1 seria');
      expect(i18n.t('workoutComplete.actions.done', { defaultValue: 'Done' })).toBe('Gotowe');
      await i18n.changeLanguage('es');
      expect(i18n.t('workoutComplete.title', { defaultValue: 'Workout Complete' })).toBe('Entrenamiento completado');
      expect(i18n.t('workoutComplete.rpe.hard', { defaultValue: 'Hard' })).toBe('Difícil');
      expect(i18n.t('workoutComplete.labels.sets', { defaultValue: '{{count}} sets', count: 1 })).toBe('1 serie');
      expect(i18n.t('workoutComplete.labels.sets', { defaultValue: '{{count}} sets', count: 2 })).toBe('2 series');
      expect(i18n.t('workoutComplete.actions.done', { defaultValue: 'Done' })).toBe('Listo');
    });
  });
});
