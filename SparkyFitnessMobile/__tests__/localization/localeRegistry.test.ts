import { RESOURCE_MAP, SHIPPED_LOCALES, SOURCE_LOCALE, FALLBACK_LOCALE, SUPPORTED_LANGUAGES } from '../../src/localization';
import { normalizeLocaleFromRegistry } from '../../src/localization/localeRegistry';

describe('locale registry contracts', () => {
  it('keeps source and fallback registered', () => {
    expect(SOURCE_LOCALE).toBe('en');
    expect(FALLBACK_LOCALE).toBe('en');
    expect(SHIPPED_LOCALES[SOURCE_LOCALE]).toBeDefined();
    expect(SHIPPED_LOCALES[FALLBACK_LOCALE]).toBeDefined();
  });

  it('requires an exact resource map match for shipped locales', () => {
    expect(Object.keys(RESOURCE_MAP).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
    expect(Object.keys(RESOURCE_MAP).every((locale) => SUPPORTED_LANGUAGES.includes(locale as never))).toBe(true);
  });

  it('validates English display-name metadata', () => {
    const english = RESOURCE_MAP.en.translation as Record<string, unknown>;
    const flatten = (value: unknown, prefix = '', result: Record<string, unknown> = {}) => {
      if (typeof value === 'string') result[prefix] = value;
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key, result));
      return result;
    };
    const englishLeaves = flatten(english);
    for (const metadata of Object.values(SHIPPED_LOCALES)) {
      expect(englishLeaves[metadata.displayNameKey]).toBe(metadata.defaultDisplayName);
    }
  });

  it('does not ambiguously resolve a language-only regional family', () => {
    const synthetic = {
      'pt-BR': { languageCode: 'pt', intlLocale: 'pt-BR', nativeLanguageTag: 'pt-BR', displayNameKey: 'x', defaultDisplayName: 'Brazil' },
      'pt-PT': { languageCode: 'pt', intlLocale: 'pt-PT', nativeLanguageTag: 'pt-PT', displayNameKey: 'x', defaultDisplayName: 'Portugal' },
    };
    expect(normalizeLocaleFromRegistry('pt-BR', synthetic)).toBe('pt-BR');
    expect(normalizeLocaleFromRegistry('pt-BR-x-private', synthetic)).toBe('pt-BR');
    expect(normalizeLocaleFromRegistry('pt-PT', synthetic)).toBe('pt-PT');
    expect(normalizeLocaleFromRegistry('pt-PT-x-private', synthetic)).toBe('pt-PT');
    expect(normalizeLocaleFromRegistry('pt', synthetic)).toBeNull();
  });
});
