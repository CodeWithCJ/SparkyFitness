import en from '../../locales/en.json';
import pl from '../../locales/pl.json';
import es from '../../locales/es.json';

const REQUIRED_IOS_KEYS = [
  'NSCameraUsageDescription',
  'NSHealthShareUsageDescription',
  'NSHealthUpdateUsageDescription',
  'NSLocalNetworkUsageDescription',
] as const;

describe('native app locale resources', () => {
  it('contains the same non-empty iOS permission keys in English, Polish and Spanish', () => {
    for (const key of REQUIRED_IOS_KEYS) {
      expect(en.ios[key]).toEqual(expect.any(String));
      expect(pl.ios[key]).toEqual(expect.any(String));
      expect(es.ios[key]).toEqual(expect.any(String));
      expect(en.ios[key]).not.toBe('');
      expect(pl.ios[key]).not.toBe('');
      expect(es.ios[key]).not.toBe('');
    }
    expect(Object.keys(en.ios).sort()).toEqual(Object.keys(pl.ios).sort());
    expect(Object.keys(en.ios).sort()).toEqual(Object.keys(es.ios).sort());
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

  it('uses the approved Spanish permission copy', () => {
    expect(es.ios).toEqual({
      NSCameraUsageDescription:
        'SparkyFitness necesita acceder a tu cámara para escanear códigos de barras y etiquetas de alimentos.',
      NSHealthShareUsageDescription:
        'SparkyFitness lee datos de Salud (como actividad, entrenamientos y medidas corporales) para mostrarlos en la app y sincronizarlos con tu servidor SparkyFitness autoalojado.',
      NSHealthUpdateUsageDescription:
        'SparkyFitness escribe en Apple Salud la nutrición y la hidratación que registras en la app, manteniendo ambas sincronizadas.',
      NSLocalNetworkUsageDescription:
        'SparkyFitness se conecta a servidores autoalojados en tu red local.',
    });
  });
});
