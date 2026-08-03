import en from '../../locales/en.json';
import pl from '../../locales/pl.json';

const REQUIRED_IOS_KEYS = [
  'NSCameraUsageDescription',
  'NSHealthShareUsageDescription',
  'NSHealthUpdateUsageDescription',
  'NSLocalNetworkUsageDescription',
] as const;

describe('native app locale resources', () => {
  it('contains the same non-empty iOS permission keys in English and Polish', () => {
    for (const key of REQUIRED_IOS_KEYS) {
      expect(en.ios[key]).toEqual(expect.any(String));
      expect(pl.ios[key]).toEqual(expect.any(String));
      expect(en.ios[key]).not.toBe('');
      expect(pl.ios[key]).not.toBe('');
    }
  });

  it('keeps localized permission copy distinct between languages', () => {
    for (const key of REQUIRED_IOS_KEYS) {
      expect(en.ios[key]).not.toBe(pl.ios[key]);
    }
  });
});
