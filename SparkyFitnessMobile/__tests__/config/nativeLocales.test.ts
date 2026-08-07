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
    expect(Object.keys(en.ios).sort()).toEqual(Object.keys(pl.ios).sort());
  });

  it('uses the approved Polish permission copy', () => {
    expect(pl.ios).toEqual({
      NSCameraUsageDescription:
        'SparkyFitness potrzebuje dostępu do aparatu, aby skanować kody kreskowe i etykiety produktów.',
      NSHealthShareUsageDescription:
        'SparkyFitness odczytuje dane zdrowotne, takie jak aktywność, treningi i pomiary ciała, aby wyświetlać je w aplikacji i synchronizować z Twoim samodzielnie hostowanym serwerem SparkyFitness.',
      NSHealthUpdateUsageDescription:
        'SparkyFitness zapisuje rejestrowane w aplikacji wartości odżywcze i nawodnienie w Apple Health, aby zachować synchronizację.',
      NSLocalNetworkUsageDescription:
        'SparkyFitness łączy się z samodzielnie hostowanymi serwerami w Twojej sieci lokalnej.',
    });
  });
});
