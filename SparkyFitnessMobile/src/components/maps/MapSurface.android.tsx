import { forwardRef } from 'react';
import { usesGoogleMapsOnAndroid } from '../../utils/routeMapSupport';
import MapLibreMapSurface from './maplibreMapSurface';
import ReactNativeMapSurface from './reactNativeMapSurface';
import type { MapSurfaceHandle, MapSurfaceProps } from './mapSurfaceTypes';

/**
 * The Android map engine: Google Maps when the build was given
 * `GOOGLE_MAPS_ANDROID_API_KEY`, otherwise the keyless MapLibre map over
 * OpenStreetMap vector tiles. iOS always uses Apple Maps
 * (`reactNativeMapSurface.tsx`), so it never pays for the MapLibre bundle.
 */
const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(
  (props, ref) =>
    usesGoogleMapsOnAndroid() ? (
      <ReactNativeMapSurface {...props} ref={ref} />
    ) : (
      <MapLibreMapSurface {...props} ref={ref} />
    )
);

MapSurface.displayName = 'MapSurface';

export default MapSurface;
