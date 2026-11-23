/**
 * Still route previews on Android always use the keyless MapLibre map over
 * OpenStreetMap, even in builds given a Google Maps key.
 *
 * Google Maps reports nothing when its key is refused (a missing signing
 * fingerprint, the Maps SDK not enabled, billing off): it stays on a blank
 * grid, so there is no failure to fall back from. MapLibre does report a style
 * or tile failure, and `RouteTileMap` then draws the plain route line.
 */
export { default } from './maplibreMapSurface';
