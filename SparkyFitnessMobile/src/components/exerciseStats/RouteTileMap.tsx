import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable, useUniwind } from 'uniwind';
import type { GpsTrackPoint } from '@workspace/shared';
import { routeRegion, usableRoutePoints } from '../../utils/cardioSession';
import { usesGoogleMapsOnAndroid } from '../../utils/routeMapSupport';
import MapSurface from '../maps/MapSurface';
import type { MapSurfaceHandle } from '../maps/mapSurfaceTypes';
import RouteLine from './RouteLine';

const HEIGHT = 220;

interface RouteTileMapProps {
  points: readonly Pick<GpsTrackPoint, 'lat' | 'lon'>[];
  accessibilityLabel: string;
}

/**
 * The GPS track over a real map: Apple Maps on iOS, OpenStreetMap vector tiles
 * on Android. No API key on either. Same start dot and finish ring as the
 * plain line.
 *
 * The map is a still picture of the route: panning and zooming are off so it
 * never takes the screen's scroll. On Android builds with a Google Maps key it
 * renders in lite mode; MapLibre and Apple Maps ignore it.
 */
const RouteTileMap: React.FC<RouteTileMapProps> = ({
  points,
  accessibilityLabel,
}) => {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const isDark = theme === 'dark' || theme === 'amoled';
  const [routeColor, startColor, finishColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-heart-rate',
  ]) as [string, string, string];

  const mapRef = useRef<MapSurfaceHandle>(null);
  const [mapFailed, setMapFailed] = useState(false);

  const coordinates = useMemo(
    () => usableRoutePoints(points).map((p) => ({ lat: p.lat, lon: p.lon })),
    [points]
  );
  const region = useMemo(() => routeRegion(points), [points]);

  useEffect(() => {
    if (coordinates.length > 0) {
      mapRef.current?.fitPoints(coordinates, undefined, false);
    }
  }, [coordinates]);

  if (mapFailed) {
    return (
      <RouteLine points={points} accessibilityLabel={accessibilityLabel} />
    );
  }

  if (!region || coordinates.length < 2) return null;

  const showOsmCredit = Platform.OS === 'android' && !usesGoogleMapsOnAndroid();

  return (
    <View
      className="rounded-lg overflow-hidden"
      style={{ height: HEIGHT }}
      // Touches belong to the screen's scroll view, not the still map.
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="route-tile-map"
    >
      <MapSurface
        ref={mapRef}
        initialViewport={{
          center: { lat: region.latitude, lon: region.longitude },
          latitudeDelta: region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        }}
        dark={isDark}
        interactive={false}
        lite
        hideFromAccessibility
        onDidFailLoadingMap={() => setMapFailed(true)}
        lines={[{ points: coordinates, color: routeColor, width: 4 }]}
        markers={[
          {
            point: coordinates[coordinates.length - 1],
            color: finishColor,
            shape: 'ring',
          },
          { point: coordinates[0], color: startColor, shape: 'dot' },
        ]}
      />
      {showOsmCredit ? (
        <View
          className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded bg-black/50"
          pointerEvents="none"
        >
          <Text className="text-[10px] text-white/90 font-medium">
            {t('routes.osmAttribution', { defaultValue: '© OpenStreetMap' })}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default RouteTileMap;
