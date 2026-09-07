import { getDateLocale } from '@/utils/languageUtils';

describe('getDateLocale', () => {
  it.each([
    ['cs', 'cs'],
    ['de', 'de'],
    ['pt-BR', 'pt-BR'],
    ['zh-Hans', 'zh-CN'],
  ])('maps %s to the matching date-fns locale', (language, expectedCode) => {
    expect(getDateLocale(language).code).toBe(expectedCode);
  });

  it('falls back to English for an unsupported locale', () => {
    expect(getDateLocale('unsupported').code).toBe('en-US');
  });
});
