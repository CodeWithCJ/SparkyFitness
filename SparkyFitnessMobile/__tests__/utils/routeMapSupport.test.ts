import {
  canShowRouteMap,
  canShowSatelliteMap,
  usesGoogleMapsOnAndroid,
} from '../../src/utils/routeMapSupport';

describe('canShowRouteMap', () => {
  it('draws a map on iOS and on Android, with or without a Google key', () => {
    expect(canShowRouteMap('ios')).toBe(true);
    expect(canShowRouteMap('android')).toBe(true);
  });

  it('draws no map elsewhere', () => {
    expect(canShowRouteMap('web')).toBe(false);
  });
});

describe('usesGoogleMapsOnAndroid', () => {
  it('keeps Google Maps on Android only when the build had a key', () => {
    expect(
      usesGoogleMapsOnAndroid('android', { androidGoogleMapsEnabled: true })
    ).toBe(true);
    expect(
      usesGoogleMapsOnAndroid('android', { androidGoogleMapsEnabled: false })
    ).toBe(false);
    expect(usesGoogleMapsOnAndroid('android', undefined)).toBe(false);
  });

  it('never uses Google Maps on iOS', () => {
    expect(
      usesGoogleMapsOnAndroid('ios', { androidGoogleMapsEnabled: true })
    ).toBe(false);
  });
});

describe('canShowSatelliteMap', () => {
  it('offers imagery on iOS and on a keyed Android build', () => {
    expect(canShowSatelliteMap('ios', undefined)).toBe(true);
    expect(
      canShowSatelliteMap('android', { androidGoogleMapsEnabled: true })
    ).toBe(true);
  });

  it('has no imagery in the keyless OpenStreetMap map', () => {
    expect(
      canShowSatelliteMap('android', { androidGoogleMapsEnabled: false })
    ).toBe(false);
    expect(canShowSatelliteMap('android', undefined)).toBe(false);
    expect(canShowSatelliteMap('web', undefined)).toBe(false);
  });
});
