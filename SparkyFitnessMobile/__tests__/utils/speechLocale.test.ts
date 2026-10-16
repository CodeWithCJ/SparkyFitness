import { resolveSpeechLocale } from '../../src/utils/speechLocale';

describe('resolveSpeechLocale', () => {
  it('keeps a locale that already has a region', () => {
    expect(resolveSpeechLocale('en-GB', ['en-US'])).toBe('en-GB');
  });

  it('expands a bare language using the device region', () => {
    expect(resolveSpeechLocale('en', ['pl-PL', 'en-AU'])).toBe('en-AU');
  });

  it('falls back to a default region when the device has none', () => {
    expect(resolveSpeechLocale('en', [])).toBe('en-US');
    expect(resolveSpeechLocale('pl', ['en-US'])).toBe('pl-PL');
  });

  it('passes through an unknown bare language', () => {
    expect(resolveSpeechLocale('xx', [])).toBe('xx');
  });
});
