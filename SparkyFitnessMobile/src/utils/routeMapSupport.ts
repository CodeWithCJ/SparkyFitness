import { Platform } from 'react-native';
import Constants from 'expo-constants';

interface RouteMapExtra {
  androidGoogleMapsEnabled?: unknown;
}

/**
 * Whether cardio routes can be drawn over a real map. iOS always can, with
 * Apple Maps. Android always can too: Google Maps when the build was given a
 * key, otherwise MapLibre over OpenStreetMap, which needs no key, no billing
 * account and no Google Play Services.
 */
export function canShowRouteMap(os: string = Platform.OS): boolean {
  return os === 'ios' || os === 'android';
}

/**
 * Android keeps Google Maps only for builds given a Google Maps key (see
 * `GOOGLE_MAPS_ANDROID_API_KEY` in app.config.ts). Every other Android build
 * renders the keyless OpenStreetMap map.
 */
export function usesGoogleMapsOnAndroid(
  os: string = Platform.OS,
  extra: RouteMapExtra | undefined = Constants.expoConfig?.extra
): boolean {
  return os === 'android' && extra?.androidGoogleMapsEnabled === true;
}

/**
 * Satellite/hybrid imagery: Apple Maps always has it, Google Maps when
 * configured. The OpenStreetMap styles have no imagery layer, so the editor
 * hides its Satellite button where there is none.
 */
export function canShowSatelliteMap(
  os: string = Platform.OS,
  extra: RouteMapExtra | undefined = Constants.expoConfig?.extra
): boolean {
  return os === 'ios' || usesGoogleMapsOnAndroid(os, extra);
}
