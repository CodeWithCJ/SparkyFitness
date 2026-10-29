import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useCSSVariable, useUniwind } from 'uniwind';
import type { GpsTrackPoint } from '@workspace/shared';
import { routeRegion, usableRoutePoints } from '../../utils/cardioSession';
import MapSurface from '../maps/MapSurface';

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
 * renders in lite mode; MapLibre and Apple Maps stay on their standard still
 * view.
 */
const RouteTileMap: React.FC<RouteTileMapProps> = ({
  points,
  accessibilityLabel,
}) => {
  const { theme } = useUniwind();
  const isDark = theme === 'dark' || theme === 'amoled';
  const [routeColor, startColor, finishColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-heart-rate',
  ]) as [string, string, string];

  const coordinates = useMemo(
    () => usableRoutePoints(points).map((p) => ({ lat: p.lat, lon: p.lon })),
    [points]
  );
  const region = useMemo(() => routeRegion(points), [points]);
  if (!region || coordinates.length < 2) return null;

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
        initialViewport={{
          center: { lat: region.latitude, lon: region.longitude },
          latitudeDelta: region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        }}
        dark={isDark}
        interactive={false}
        lite
        hideFromAccessibility
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
    </View>
  );
};

export default RouteTileMap;
