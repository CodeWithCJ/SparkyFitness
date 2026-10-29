/**
 * MapLibre styles on OpenFreeMap's public instance. No API key, no account,
 * and no Google Play Services: MapLibre Native renders these vector tiles
 * itself. OpenFreeMap and OpenStreetMap need attribution, which the map shows
 * through its attribution button, so it stays on in both themes.
 *
 * They are community-hosted and can be slow or unavailable; a map with no
 * tiles is the failure mode, the same as any map with no network.
 */
export const MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export function resolveMapLibreStyle(dark: boolean = false): string {
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

/**
 * A zoom that shows about `latitudeDelta` degrees. MapLibre has no delta
 * camera; this is only a starting point, since real framing goes through
 * `fitBounds`.
 */
export function zoomForLatitudeDelta(latitudeDelta: number): number {
  const delta = Math.min(Math.max(latitudeDelta, 0.00005), 180);
  return Math.min(Math.max(Math.log2(360 / delta), 1), 20);
}
