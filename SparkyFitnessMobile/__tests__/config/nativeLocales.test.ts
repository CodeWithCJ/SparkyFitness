import fs from 'fs';
import path from 'path';
import {
  SHIPPED_LOCALES,
  SOURCE_LOCALE,
} from '../../src/localization/localeRegistry';

const MOBILE_ROOT = path.join(__dirname, '../..');
const SHIPPED = Object.keys(SHIPPED_LOCALES);

const REQUIRED_IOS_KEYS = [
  'NSCameraUsageDescription',
  'NSHealthShareUsageDescription',
  'NSHealthUpdateUsageDescription',
  'NSLocalNetworkUsageDescription',
] as const;

function readMetadata(locale: string): { ios?: Record<string, string> } {
  return JSON.parse(
    fs.readFileSync(path.join(MOBILE_ROOT, `locales/${locale}.json`), 'utf8')
  );
}

describe('native app locale resources', () => {
  it('ships an Expo metadata catalog for every registered locale', () => {
    for (const locale of SHIPPED) {
      expect(
        fs.existsSync(path.join(MOBILE_ROOT, `locales/${locale}.json`))
      ).toBe(true);
    }
  });

  it('defines every required iOS permission key in the source locale', () => {
    const ios = readMetadata(SOURCE_LOCALE).ios ?? {};
    for (const key of REQUIRED_IOS_KEYS) {
      expect(ios[key]).toEqual(expect.any(String));
      expect(ios[key]).not.toBe('');
    }
  });

  it('never emits a permission key the source does not define', () => {
    // A missing key falls back to the base Info.plist copy; an unknown one is
    // dead weight and stays blocking.
    const source = new Set(Object.keys(readMetadata(SOURCE_LOCALE).ios ?? {}));
    for (const locale of SHIPPED) {
      for (const key of Object.keys(readMetadata(locale).ios ?? {})) {
        expect(source.has(key)).toBe(true);
      }
    }
  });

  it('has non-empty permission copy in every shipped locale', () => {
    for (const locale of SHIPPED) {
      for (const value of Object.values(readMetadata(locale).ios ?? {})) {
        expect(value).toEqual(expect.any(String));
        expect(value).not.toBe('');
      }
    }
  });
});
